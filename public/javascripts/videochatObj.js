import { getConfig } from './config.js'
const CONFIG = getConfig();

const VideoChat = {

  MainVideoPeer: null,
  signaling_socket: null,
  local_media_stream: null,
  peers: {},
  peer_media_elements: {},
  remoteStreams: {},
  cameraOn: true,
  micOn: true,

  init: function () {
    $(".videoToggle").click(this.toggleCamera)
    $(".micToggle").click(this.toggleMic)
    $(".btn-call-end").click(function () { window.location.href = "/" })

    console.log("Init: Connecting to signaling server");
    this.signaling_socket = io(CONFIG.SIGNALING_SERVER);
    this.signaling_socket = io();

    let setup_local_media = this.setup_local_media;
    let join_chat_channel = this.join_chat_channel;
    let getRoomName = this.getRoomName;
    this.signaling_socket.on('connect', function () {
      console.log("Connected to signaling server");
      setup_local_media(function () {
        /* once the user has given us access to their
         * microphone/camcorder, join the channel and start peering up */
        join_chat_channel(getRoomName(), { 'whatever-you-want-here': 'stuff' });
      });
    });

    this.signaling_socket.on('disconnect', function () {
      console.log("Disconnected from signaling server");
      /* Tear down all of our peer connections and remove all the media divs when we disconnect */
      for (peer_id in this.peer_media_elements) {
        this.peer_media_elements[peer_id].remove();
        this.remoteStreams[peer_id].remove();
      }
      for (peer_id in this.peers) {
        this.peers[peer_id].close();
      }

      this.peers = {};
      this.peer_media_elements = {};
      this.remoteStreams = {};
    });

    /**
    * When we join a group, our signaling server will send out 'addPeer' events to each pair
    * of users in the group (creating a fully-connected graph of users, ie if there are 6 people
    * in the channel you will connect directly to the other 5, so there will be a total of 15
    * connections in the network).
    */
    this.signaling_socket.on('addPeer', function (config) {
      console.log('Signaling server said to add peer:', config);
      let peer_id = config.peer_id;
      if (peer_id in this.peers) {
        /* This could happen if the user joins multiple channels where the other peer is also in. */
        console.log("Already connected to peer ", peer_id);
        return;
      }
      let peer_connection = new RTCPeerConnection(
        { "iceServers": ICE_SERVERS },
        { "optional": [{ "DtlsSrtpKeyAgreement": true }] } //for firefox
      );
      this.peers[peer_id] = peer_connection;

      peer_connection.onicecandidate = function (event) {
        if (event.candidate) {
          this.signaling_socket.emit('relayICECandidate', {
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
        if (!(this.peer_media_elements.hasOwnProperty(peer_id))) {
          let remote_media_ele = createVideoElement(remoteStream, peer_id)
          this.peer_media_elements[peer_id] = remote_media_ele;
        }
        this.remoteStreams[peer_id] = remoteStream;
        if (Object.keys(this.remoteStreams).length == 1) {
          this.attachMediaStream(document.getElementById("main_video"), remoteStream);
        }
      }

      /* Add our local stream */
      this.local_media_stream.getTracks().forEach((track) => {
        console.log('foreachtrack', track);
        peer_connection.addTrack(track, this.local_media_stream)
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
            this.signaling_socket.emit('relaySessionDescription',
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
    this.signaling_socket.on('sessionDescription', function (config) {
      console.log('Remote description received: ', config);
      let peer_id = config.peer_id;
      let peer = this.peers[peer_id];
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
                this.signaling_socket.emit('relaySessionDescription',
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
    this.signaling_socket.on('iceCandidate', function (config) {
      let peer = this.peers[config.peer_id];
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
     * this.signaling_socket.on('disconnect') code will kick in and tear down
     * all the peer sessions.
     */
    this.signaling_socket.on('removePeer', function (config) {
      console.log('Signaling server said to remove peer:', config);
      let peer_id = config.peer_id;
      if (peer_id in this.peer_media_elements) {
        this.peer_media_elements[peer_id].remove();
      }
      if (peer_id in this.peers) {
        this.peers[peer_id].close();
      }

      delete this.peers[peer_id];
      delete this.peer_media_elements[config.peer_id];
      delete this.remoteStreams[config.peer_id];

      if (MainVideoPeer === config.peer_id && Object.keys(this.remoteStreams).length >= 1) {  // if there's at least one remote stream, then add it to main video, else local video 
        this.attachMediaStream(document.getElementById("main_video"), this.remoteStreams[Object.keys(this.remoteStreams)[0]]);
      } else {
        this.attachMediaStream(document.getElementById("main_video"), this.local_media_stream);
      }
    });


  },

  join_chat_channel: function (channel, userdata) {
    this.signaling_socket.emit('join', { "channel": channel, "userdata": userdata });
  },

  part_chat_channel: function (channel) {
    this.signaling_socket.emit('part', channel);
  },

  attachMediaStream: function (element, stream) {
    element.srcObject = stream;
  },

  createVideoElement: function (stream, peer_id) {
    let videoWrapper = $("<div class='video-tile animated fadeInRight'></div>")
    let videoEle = $("<video onclick='toggleMainVideo(this)' peer_id='" + peer_id + "'>");
    videoEle.attr("autoplay", "autoplay");
    videoEle.attr("playsinline", "");
    $(videoWrapper).append(videoEle);
    $('#remote_videos').append(videoWrapper);
    this.attachMediaStream(videoEle[0], stream);
    return videoWrapper;
  },

  toggleMainVideo: function (selfEle) {
    let peer_id = $(selfEle).attr('peer_id');
    MainVideoPeer = peer_id;
    console.log(this.remoteStreams)
    console.log('toggleMainVideo', selfEle, $(selfEle).attr('peer_id'))
    if (peer_id) {
      this.attachMediaStream(document.getElementById("main_video"), this.remoteStreams[peer_id]);
      console.log('add remote stream', this.remoteStreams[peer_id])
    } else {
      this.attachMediaStream(document.getElementById("main_video"), this.local_media_stream);
      console.log('add local stream', this.local_media_stream)
    }
  },

  toggleCamera: function () {
    $(".videoToggle").toggle()
    $(".local_video").toggle()
    let videoTracks = this.local_media_stream.getVideoTracks();
    if (videoTracks.length === 0) {
      console.log("No local video available.");
      return;
    }
    console.log("Toggling video mute state.");
    for (let i = 0; i < videoTracks.length; ++i) {
      videoTracks[i].enabled = !cameraOn;
    }
    cameraOn = !cameraOn;
  },

  toggleMic: function () {
    $(".micToggle").toggle()
    let audioTracks = this.local_media_stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log("No local audio available.");
      return;
    }
    console.log("Toggling audio mute state.");
    for (let i = 0; i < audioTracks.length; ++i) {
      audioTracks[i].enabled = !micOn;
    }
    micOn = !micOn;
  },

  setup_local_media: function (callback, errorback) {
    if (this.local_media_stream != null) {  /* ie, if we've already been initialized */
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

        let constraints = {
          "audio": audio_exist,
          "video": video_exist,
        }
        return constraints;
      }).then(constraints => {
        console.log('constraints', constraints)
        navigator.mediaDevices.getUserMedia(constraints)
          .then((stream) => { /* user accepted access to a/v */
            console.log("Access granted to audio/video", stream);
            this.local_media_stream = stream;
            this.attachMediaStream(document.getElementById("main_video"), stream);
            this.attachMediaStream(document.getElementById("local_video"), stream);
            if (callback) callback();
          })
          .catch((e) => { /* user denied access to a/v */
            console.log("Access denied for audio/video");
            alert("You chose not to provide access to the camera/microphone, demo will not work.");
            if (errorback) errorback();
          });

      })
  },

  getRoomName: function () {
    let segs = (window.location.href).split("/");
    return segs[segs.length - 1];
  }

}

VideoChat.init();