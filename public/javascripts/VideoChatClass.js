import { CONFIG } from './config.js'

var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.msRTCSessionDescription;

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
    this.ServerURL = "http://localhost:3000/room";
    // this.ServerURL = "https://call.bemycall.com/room";

    await $.post(this.ServerURL + "/get_room", { roomID: this.getRoomName(), hostGuest: this.getRoomName(true) },
      function (res) {
        that.config = res;
      }, 'json')
      .fail(function (err) {
        console.log(err)
        alert(err.responseJSON.message)
      });

    if (!this.config.video) {
      $(".videoToggle").addClass('disabled');
    }
    if (!this.config.audio) {
      $(".micToggle").addClass('disabled');
    }
    if (!this.config.screenshare) {
      $(".screenShare").addClass('disabled');
    }
    if (this.config.private && (this.config.privateHash == undefined || this.config.privateHash != this.getParameterByName('hash'))) {
      window.location.href = '/confirm?roomID=' + this.config.roomID + "-" + this.getRoomName(true) + "&text=" + this.config.privateText
    }

    // this.toggleGrid();  // i'd like to see toggle view when developing because it's smaller
    $(".micToggle").click(this.toggleMic);
    $(".gridToggle").click(this.toggleGrid);
    $(".videoToggle").click(this.toggleCamera);
    $(".screenShare").click(this.toggleScreenShare);
    $(".btn-call-end").click(function () { window.location.href = "/" })
    $(".watermark").css("background-image", "url(" + this.config.watermarkUrl + ")")
    window.toggleMainVideo = this.toggleMainVideo;  // for toggle main video in html


    console.log("Init: Connecting to signaling server");
    this.signalingSocket = io(CONFIG.SIGNALING_SERVER);
    this.signalingSocket = io();

    this.signalingSocket.on('connect', function () {
      console.log("Connected to signaling server");
      that.setup_local_media(function () {
        /* once the user has given us access to their
         * microphone/camcorder, join the channel and start peering up */
        that.join_chat_channel(that.getRoomName(), that.config);
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

    /** When the room is full */
    this.signalingSocket.on('fullRoom', function (data) {
      let maxUser = data.maxUser;
      alert("Excuse me, the room you tried is full now!")
      window.location.href = "/"
    })

    /** When the room is closed */
    this.signalingSocket.on('roomClosed', function (data) {
      console.log(data);
      if (that.checkHost() && data.forceForwardHost) {
        window.location.href = data.forceForwardHost
      } else if (!that.checkHost() && data.forceForwardGuest) {
        window.location.href = data.forceForwardGuest
      } else {
        data.isHost = that.checkHost();
        window.localStorage.setItem('whenRoomClosed', JSON.stringify(data));
        window.location.href = "/";
      }
    })

    /** When the play media is received */
    this.signalingSocket.on('playReceived', function (data) {
      console.log(data);
      var media;
      if (that.checkHost()) {
        media = data.playHost
      } else {
        media = data.playGuest
      }
      $("body").append("<audio autoplay><source src='" + media + "'></audio>")
    })

    /** When the text is received from ... */
    this.signalingSocket.on('textReceived', function (data) {
      console.log(data);
      var txt = '';
      if (that.checkHost()) {
        txt = data.displayHost
      } else {
        txt = data.displayGuest
      }
      var toast = new iqwerty.toast.Toast();
      toast.setText(txt).setDuration(eval(data.seconds) * 1000).show();

    })

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
          that.chageLayout()

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
      that.chageLayout()

      if (that.MainVideoPeer === config.peer_id && Object.keys(that.remoteStreams).length >= 1) {  // if there's at least one remote stream, then add it to main video, else local video 
        that.attachMediaStream(document.getElementById("main_video"), that.remoteStreams[Object.keys(that.remoteStreams)[0]]);
      } else {
        that.attachMediaStream(document.getElementById("main_video"), that.localMediaStream);
      }
    });
  }

  join_chat_channel = (channel, userData) => {
    this.signalingSocket.emit('join', { "channel": channel, "userData": userData });
  }

  part_chat_channel = (channel) => {
    this.signalingSocket.emit('part', channel);
  }

  attachMediaStream = (element, stream) => {
    element.srcObject = stream;
  }

  createVideoElement = (stream, peer_id) => {
    var eleLen = parseInt(Object.keys(this.peerMediaElements).length) + 1;
    console.log(eleLen)
    var layout = [["100%", "100%"], ["50%", "100%"], ["33.333%", "100%"], ["50%", "50%"], ["33.333%", "50%"], ["33.333%", "50%"], ["25%", "50%"]]
    let styles = '';//($("#remote_videos").hasClass("remote-tile-view")) ? 'style=width: ' + layout[eleLen][0] + ', height: ' + layout[eleLen][1] : '';
    let videoWrapper = $("<div class='video-tile animated fadeInRight' " + styles + "></div>")
    let videoEle = $("<video onclick='toggleMainVideo(this)' peer_id='" + peer_id + "'>");
    videoEle.attr("autoplay", "autoplay");
    videoEle.attr("playsinline", "");
    $(videoWrapper).append(videoEle);
    $('#remote_videos').append(videoWrapper);
    this.attachMediaStream(videoEle[0], stream);
    // this.chageLayout()
    return videoWrapper;
  }

  chageLayout = () => {
    var eleLen = Object.keys(this.peerMediaElements).length;
    var layout = [["100%", "100%"], ["50%", "100%"], ["33.333%", "100%"], ["50%", "50%"], ["33.333%", "50%"], ["33.333%", "50%"], ["25%", "50%"], ["25%", "50%"], ["33.333%", "33.333%"], ["20%", "50%"], ["20%", "33.333%"]]
    if (eleLen > 9) eleLen = 10
    console.log(eleLen, $("#remote_videos").hasClass("remote-tile-view"), layout[eleLen], layout[eleLen][0], layout[eleLen][1]);
    if ($("#remote_videos").hasClass("remote-tile-view")) {
      $(".remote-tile-view .video-tile ").css({ width: layout[eleLen][0], height: layout[eleLen][1] })
    } else {
      console.log('else')
      // $(".remote-tile-view .video-tile ").removeAttr("style")
      $(".video-tile ").css({ width: "160px", height: "100px" })
    }

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
    this.chageLayout();

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
            var eles = document.getElementsByClassName("temp-video")
            for (var i = 0; i < eles.length; i++) {
              eles[i].srcObject = stream
            }
            if (callback) callback();
          })
          .catch((e) => { /* user denied access to a/v */
            console.log("Access denied for audio/video");
            alert("You chose not to provide access to the camera/microphone");
            if (errorback) errorback();
          });

      })
  }

  getRoomName = (checkHost) => {
    if (checkHost == undefined) checkHost = false;

    let segs = (window.location.href).split("/");
    let commonSeg = segs[segs.length - 1].split("-")
    console.log(commonSeg[0])
    if (checkHost) {
      return (commonSeg[commonSeg.length - 1].split('?'))[0]
    }
    return commonSeg[0];
  }

  checkHost = () => {
    return (this.config.hostGuest == this.getRoomName(true))
  }

  getParameterByName = (name, url) => {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
      results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
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

$(document).ready(function () {
  $('[data-toggle="tooltip"]').tooltip();
});