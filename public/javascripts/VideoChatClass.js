import { CONFIG } from './config.js'

class VideoChat {
  constructor(initVals) {

    this.config = {}                    // Stores chat config which from the database
    this.MainVideoPeer = 'null';        // Peer of Big Video (main video)
    this.signalingSocket = null;        // For signal socket
    this.localMediaStream = null;       // Stores local media stream
    this.peers = {};                    // Stores all the remote Peers
    this.peerMediaElements = {};        // Stores all the remote video element DOM
    this.remoteStreams = {};            // Stores all the remote media streams
    this.cameraOn = true;               // Status of camera 
    this.micOn = true;                  // Status of mic
    this.screenShareOn = false;         // Status of screenshare
    this.sharedVideoStream = null;      // Stores shared Stream
    this.ServerURL = '';                // Stores Server URL. It same as self location . . .

    if (isMobile.any()) {
      $(".screenShare").hide();
    }
    // this.init();
  }

  init = async () => {
    const that = this;  // it's for when used in signalingSocket.on 
    this.ServerURL = window.location.protocol + "//" + window.location.hostname + "/room";

    await $.post(this.ServerURL + "/get_room", { name: this.getRoomName() }, function (res) {
      console.log(res)
      that.config = res;
    }, 'json');

    if (!this.config.video) {
      $(".videoToggle").addClass('disabled');
    }
    if (!this.config.audio) {
      $(".micToggle").addClass('disabled');
    }

    $(".videoToggle").click(this.toggleCamera);
    $(".micToggle").click(this.toggleMic);
    $(".gridToggle").click(this.toggleGrid);
    $(".screenShare").click(this.toggleScreenShare);
    $(".btn-call-end").click(function () { window.location.href = "/" })
    window.toggleMainVideo = this.toggleMainVideo;  // for toggle main video in html


    console.log("Init: Connecting to signaling server");
    this.signalingSocket = io(CONFIG.SIGNALING_SERVER);
    this.signalingSocket = io();

    this.signalingSocket.on('connect', function () {
      console.log("Connected to signaling server");
      that.setup_local_media(function () {
        /* once the user has given us access to their
         * microphone/camcorder, join the channel and start peering up */
        that.join_chat_channel(that.getRoomName(), { 'whatever-you-want-here': 'stuff' });
      });
    });

    this.signalingSocket.on('disconnect', function () {
      console.log("Disconnected from signaling server");
      /* Tear down all of our peer connections and remove all the media divs when we disconnect */
      for (peer_id in that.peerMediaElements) {
        that.peerMediaElements[peer_id].remove();
        that.remoteStreams[peer_id].remove();
      }
      for (peer_id in that.peers) {
        that.peers[peer_id].close();
      }

      that.peers = {};
      that.peerMediaElements = {};
      that.remoteStreams = {};
    });

    /**
    * When we join a group, our signaling server will send out 'addPeer' events to each pair
    * of users in the group (creating a fully-connected graph of users, ie if there are 6 people
    * in the channel you will connect directly to the other 5, so there will be a total of 15
    * connections in the network).
    */
    this.signalingSocket.on('addPeer', function (config) {
      console.log('Signaling server said to add peer:', config, that.peers);
      // if (Object.keys(that.peers).length == that.config.max_user) {
      //   alert("room is full")
      //   return;
      // }
      let peer_id = config.peer_id;
      if (peer_id in that.peers) {
        /* This could happen if the user joins multiple channels where the other peer is also in. */
        console.log("Already connected to peer ", peer_id);
        return;
      }
      let peer_connection = new RTCPeerConnection(
        { "iceServers": CONFIG.ICE_SERVERS },
        { "optional": [{ "DtlsSrtpKeyAgreement": true }] } //for firefox
      );
      that.peers[peer_id] = peer_connection;

      peer_connection.onicecandidate = function (event) {
        if (event.candidate) {
          that.signalingSocket.emit('relayICECandidate', {
            'peer_id': peer_id,
            'ice_candidate': {
              'sdpMLineIndex': event.candidate.sdpMLineIndex,
              'candidate': event.candidate.candidate
            }
          });
        }
      }

      peer_connection.ontrack = function (event) {
        console.log('ontrack', peer_id, event)
        let remoteStream = event.streams[0];
        if (!(that.peerMediaElements.hasOwnProperty(peer_id))) {
          let remote_media_ele = that.createVideoElement(remoteStream, peer_id)
          that.peerMediaElements[peer_id] = remote_media_ele;
        }
        that.remoteStreams[peer_id] = remoteStream;
        if (Object.keys(that.remoteStreams).length == 1) {
          that.attachMediaStream(document.getElementById("main_video"), remoteStream);
        }
      }

      /* Add our local stream */
      that.localMediaStream.getTracks().forEach((track) => {
        console.log('foreachtrack', track);
        peer_connection.addTrack(track, that.localMediaStream)
      });

      /* Only one side of the peer connection should create the
       * offer, the signaling server picks one to be the offerer.
       * The other user will get a 'sessionDescription' event and will
       * create an offer, then send back an answer 'sessionDescription' to us
       */
      if (config.should_create_offer) {
        console.log("Creating RTC offer to ", peer_id);
        peer_connection.createOffer()
          .then(local_description => {
            console.log("Local offer description is: ", local_description);
            return peer_connection.setLocalDescription(local_description)
          })
          .then(() => {
            that.signalingSocket.emit('relaySessionDescription',
              { 'peer_id': peer_id, 'session_description': peer_connection.localDescription });
            console.log("Offer setLocalDescription succeeded");

          })
          .catch(error => {
            console.log("Error sending offer: ", error);
          });
      }
    });

    /**
     * Peers exchange session descriptions which contains information
     * about their audio / video settings and that sort of stuff. First
     * the 'offerer' sends a description to the 'answerer' (with type
     * "offer"), then the answerer sends one back (with type "answer").
     */
    this.signalingSocket.on('sessionDescription', function (config) {
      console.log('Remote description received: ', config);
      let peer_id = config.peer_id;
      let peer = that.peers[peer_id];
      let remote_description = config.session_description;
      console.log(config.session_description);

      let desc = new RTCSessionDescription(remote_description);
      let stuff = peer.setRemoteDescription(desc,
        function () {
          console.log("setRemoteDescription succeeded");
          if (remote_description.type == "offer") {
            console.log("Creating answer");
            peer.createAnswer()
              .then((answer) => {
                return peer.setLocalDescription(answer);
              })
              .then(() => {
                that.signalingSocket.emit('relaySessionDescription',
                  { 'peer_id': peer_id, 'session_description': peer.localDescription });
                console.log("Answer setLocalDescription succeeded");
              })
              .catch((error) => {
                console.log("Error creating answer: ", error);
              })
          }
        },
        function (error) {
          console.log("setRemoteDescription error: ", error);
        }
      );
      console.log("Description Object: ", desc);

    });

    /**
     * The offerer will send a number of ICE Candidate blobs to the answerer so they
     * can begin trying to find the best path to one another on the net.
     */
    this.signalingSocket.on('iceCandidate', function (config) {
      let peer = that.peers[config.peer_id];
      let ice_candidate = config.ice_candidate;
      peer.addIceCandidate(new RTCIceCandidate(ice_candidate));
    });

    /**
     * When a user leaves a channel (or is disconnected from the
     * signaling server) everyone will recieve a 'removePeer' message
     * telling them to trash the media channels they have open for those
     * that peer. If it was this client that left a channel, they'll also
     * receive the removePeers. If this client was disconnected, they
     * wont receive removePeers, but rather the
     * this.signalingSocket.on('disconnect') code will kick in and tear down
     * all the peer sessions.
     */
    this.signalingSocket.on('removePeer', function (config) {
      console.log('Signaling server said to remove peer:', config);
      let peer_id = config.peer_id;
      if (peer_id in that.peerMediaElements) {
        that.peerMediaElements[peer_id].remove();
      }
      if (peer_id in that.peers) {
        that.peers[peer_id].close();
      }

      delete that.peers[peer_id];
      delete that.peerMediaElements[config.peer_id];
      delete that.remoteStreams[config.peer_id];

      if (that.MainVideoPeer === config.peer_id && Object.keys(that.remoteStreams).length >= 1) {  // if there's at least one remote stream, then add it to main video, else local video 
        that.attachMediaStream(document.getElementById("main_video"), that.remoteStreams[Object.keys(that.remoteStreams)[0]]);
      } else {
        that.attachMediaStream(document.getElementById("main_video"), that.localMediaStream);
      }
    });
  }

  join_chat_channel = (channel, userdata) => {
    this.signalingSocket.emit('join', { "channel": channel, "userdata": userdata });
  }

  part_chat_channel = (channel) => {
    this.signalingSocket.emit('part', channel);
  }

  attachMediaStream = (element, stream) => {
    element.srcObject = stream;
  }

  createVideoElement = (stream, peer_id) => {
    let videoWrapper = $("<div class='video-tile animated fadeInRight'></div>")
    let videoEle = $("<video onclick='toggleMainVideo(this)' peer_id='" + peer_id + "'>");
    videoEle.attr("autoplay", "autoplay");
    videoEle.attr("playsinline", "");
    $(videoWrapper).append(videoEle);
    $('#remote_videos').append(videoWrapper);
    this.attachMediaStream(videoEle[0], stream);
    return videoWrapper;
  }

  toggleMainVideo = (selfEle) => {
    let peer_id = $(selfEle).attr('peer_id');
    this.MainVideoPeer = peer_id;
    console.log(this.remoteStreams)
    console.log('toggleMainVideo', selfEle, $(selfEle).attr('peer_id'))
    if (peer_id) {
      this.attachMediaStream(document.getElementById("main_video"), this.remoteStreams[peer_id]);
      console.log('add remote stream', this.remoteStreams[peer_id])
    } else {
      this.attachMediaStream(document.getElementById("main_video"), this.localMediaStream);
      console.log('add local stream', this.localMediaStream)
    }
  }

  toggleCamera = () => {
    $(".videoToggle").toggle()
    $(".local_video").toggle()
    let videoTracks = this.localMediaStream.getVideoTracks();
    if (videoTracks.length === 0) {
      console.log("No local video available.");
      return;
    }
    console.log("Toggling video mute state.");
    for (let i = 0; i < videoTracks.length; ++i) {
      videoTracks[i].enabled = !this.cameraOn;
    }
    this.cameraOn = !this.cameraOn;
  }

  toggleMic = () => {
    $(".micToggle").toggle()
    let audioTracks = this.localMediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log("No local audio available.");
      return;
    }
    console.log("Toggling audio mute state.");
    for (let i = 0; i < audioTracks.length; ++i) {
      audioTracks[i].enabled = !this.micOn;
    }
    this.micOn = !this.micOn;
  }

  toggleGrid = () => {
    $(".gridToggle").toggle();
    $(".local-video-wrapper").toggle();
    $(".main-video-wrapper").toggle();
    $("#remote_videos").toggleClass("remote-tile-view");
  }

  toggleScreenShare = () => {
    $(".screenShare").toggle();
    if (this.screenShareOn) {
      let tracks = this.sharedVideoStream.getTracks();
      tracks.forEach(track => track.stop());
      let videoTrack = this.localMediaStream.getVideoTracks()[0];
      let PCs = Object.values(this.peers);
      PCs.map(function (pc) {
        var sender = pc.getSenders().find(function (s) {
          return s.track.kind == videoTrack.kind;
        });
        console.log('found sender:', sender);
        sender.replaceTrack(videoTrack);
      });
      document.getElementById("local_video").srcObject = this.localMediaStream;
      document.getElementById("local_video_tile_view").srcObject = this.localMediaStream;
      this.screenShareOn = false;
    } else {
      const that = this;
      navigator.mediaDevices.getDisplayMedia(CONFIG.displayMediaOptions)
        .then((stream) => {
          let videoTrack = stream.getVideoTracks()[0];
          let PCs = Object.values(that.peers);
          PCs.map(function (pc) {
            var sender = pc.getSenders().find(function (s) {
              return s.track.kind == videoTrack.kind;
            });
            console.log('found sender:', sender);
            sender.replaceTrack(videoTrack);
          });

          that.screenShareOn = true;
          that.sharedVideoStream = stream;
          document.getElementById("local_video").srcObject = stream;
          document.getElementById("local_video_tile_view").srcObject = stream;
        })
        .catch((e) => console.error(e.message));
    }
  }

  setup_local_media = (callback, errorback) => {
    if (this.localMediaStream != null) {  /* ie, if we've already been initialized */
      if (callback) callback();
      return;
    }
    /* Ask user for permission to use the computers microphone and/or camera,
     * attach it to an <audio> or <video> tag if they give us access. */
    console.log("Requesting access to local audio / video inputs");

    // check if the video and audio devices exist or not
    let video_exist = false;
    let audio_exist = false;
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        devices.forEach(function (device) {
          console.log(device.kind + ": " + device.label +
            " id = " + device.deviceId);
          // If the kind of the media resource is video,
          if (device.kind == "videoinput") {
            video_exist = true;
          } else if (device.kind == 'audioinput') {
            audio_exist = true;
          }
        });
        console.log(this.config)
        let constraints = {
          "audio": this.config.audio ? (audio_exist ? true : false) : false,
          "video": this.config.video ? (video_exist ? true : false) : false,
        }
        return constraints;
      }).then(constraints => {
        console.log('constraints', constraints)
        navigator.mediaDevices.getUserMedia(constraints)
          .then((stream) => { /* user accepted access to a/v */
            console.log("Access granted to audio/video", stream);
            this.localMediaStream = stream;
            this.attachMediaStream(document.getElementById("main_video"), stream);
            this.attachMediaStream(document.getElementById("local_video"), stream);
            this.attachMediaStream(document.getElementById("local_video_tile_view"), stream);
            if (callback) callback();
          })
          .catch((e) => { /* user denied access to a/v */
            console.log("Access denied for audio/video");
            alert("You chose not to provide access to the camera/microphone");
            if (errorback) errorback();
          });

      })
  }

  getRoomName = () => {
    let segs = (window.location.href).split("/");
    return segs[segs.length - 1];
  }

}

var isMobile = {
  Android: function () {
    return navigator.userAgent.match(/Android/i);
  },
  BlackBerry: function () {
    return navigator.userAgent.match(/BlackBerry/i);
  },
  iOS: function () {
    return navigator.userAgent.match(/iPhone|iPad|iPod/i);
  },
  Opera: function () {
    return navigator.userAgent.match(/Opera Mini/i);
  },
  Windows: function () {
    return navigator.userAgent.match(/IEMobile/i);
  },
  any: function () {
    return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
  }
};

const VC = new VideoChat();
VC.init();