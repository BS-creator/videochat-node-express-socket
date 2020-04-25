/** CONFIG **/
var self_url = window.location.href;
var segs = self_url.split("/");
var roomname = segs[segs.length - 1];
console.log(roomname)

var SIGNALING_SERVER = "https://videochat-signalhub.s-t-r-i-v-e.com/";
// var SIGNALING_SERVER = "http://localhost";
var USE_AUDIO = true;
var USE_VIDEO = true;
var ROOM_NAME = roomname;
var MUTE_AUDIO_BY_DEFAULT = false;
var MainVideoPeer = null;
/** stun / turn server **/
var ICE_SERVERS = [
  { urls: ["stun:ws-turn2.xirsys.com"] },
  {
    username: "FtejCUFBllhaRc2b8yFrgYZXcKZQKJOmcRWBIXeWy-CUl2DIlvY7QjUgDGh_PLsTAAAAAF6j9W9iZW15Y2FsbA==",
    credential: "31b7f840-86cf-11ea-8f0f-a695319b0c25",
    urls: [
      "turn:ws-turn2.xirsys.com:80?transport=udp",
      "turn:ws-turn2.xirsys.com:3478?transport=udp",
      "turn:ws-turn2.xirsys.com:80?transport=tcp",
      "turn:ws-turn2.xirsys.com:3478?transport=tcp",
      "turns:ws-turn2.xirsys.com:443?transport=tcp",
      "turns:ws-turn2.xirsys.com:5349?transport=tcp"
    ]
  }
]

var signaling_socket = null;   /* our socket.io connection to our webserver */
var local_media_stream = null; /* our own microphone / webcam */
var peers = {};                /* keep track of our peer connections, indexed by peer_id (aka socket.io id) */
var peer_media_elements = {};  /* keep track of our <video>/<audio> tags, indexed by peer_id */
var remoteStreams = {};

function init() {

  RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
  RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.msRTCSessionDescription;
  navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia;

  console.log("Connecting to signaling server");
  signaling_socket = io(SIGNALING_SERVER);
  signaling_socket = io();

  signaling_socket.on('connect', function () {
    console.log("Connected to signaling server");
    setup_local_media(function () {
      /* once the user has given us access to their
       * microphone/camcorder, join the channel and start peering up */
      join_chat_channel(ROOM_NAME, { 'whatever-you-want-here': 'stuff' });
    });
  });
  signaling_socket.on('disconnect', function () {
    console.log("Disconnected from signaling server");
    /* Tear down all of our peer connections and remove all the
     * media divs when we disconnect */
    for (peer_id in peer_media_elements) {
      peer_media_elements[peer_id].remove();
      remoteStreams[peer_id].remove();
    }
    for (peer_id in peers) {
      peers[peer_id].close();
    }

    peers = {};
    peer_media_elements = {};
    remoteStreams = {};
  });
  function join_chat_channel(channel, userdata) {
    signaling_socket.emit('join', { "channel": channel, "userdata": userdata });
  }
  function part_chat_channel(channel) {
    signaling_socket.emit('part', channel);
  }


  /**
  * When we join a group, our signaling server will send out 'addPeer' events to each pair
  * of users in the group (creating a fully-connected graph of users, ie if there are 6 people
  * in the channel you will connect directly to the other 5, so there will be a total of 15
  * connections in the network).
  */
  signaling_socket.on('addPeer', function (config) {
    console.log('Signaling server said to add peer:', config);
    var peer_id = config.peer_id;
    if (peer_id in peers) {
      /* This could happen if the user joins multiple channels where the other peer is also in. */
      console.log("Already connected to peer ", peer_id);
      return;
    }
    var peer_connection = new RTCPeerConnection(
      { "iceServers": ICE_SERVERS },
      { "optional": [{ "DtlsSrtpKeyAgreement": true }] } /* this will no longer be needed by chrome
                                                                        * eventually (supposedly), but is necessary
                                                                        * for now to get firefox to talk to chrome */
    );
    peers[peer_id] = peer_connection;

    peer_connection.onicecandidate = function (event) {
      if (event.candidate) {
        signaling_socket.emit('relayICECandidate', {
          'peer_id': peer_id,
          'ice_candidate': {
            'sdpMLineIndex': event.candidate.sdpMLineIndex,
            'candidate': event.candidate.candidate
          }
        });
      }
    }
    // peer_connection.onaddstream = function (event) {
    //   console.log("onAddStream", event);
    //   var remote_media_ele = createVideoElement(event.stream, peer_id)
    //   peer_media_elements[peer_id] = remote_media_ele;
    //   remoteStreams[peer_id] = event.stream;
    //   if (Object.keys(remoteStreams).length == 1) {
    //     attachMediaStream(document.getElementById("main_video"), event.stream);
    //   }
    // }

    peer_connection.ontrack = function (event) {
      console.log('ontrack', peer_id, event)
      var remoteStream = event.streams[0];
      if (!(peer_media_elements.hasOwnProperty(peer_id))) {
        var remote_media_ele = createVideoElement(remoteStream, peer_id)
        peer_media_elements[peer_id] = remote_media_ele;
      }
      remoteStreams[peer_id] = remoteStream;
      if (Object.keys(remoteStreams).length == 1) {
        attachMediaStream(document.getElementById("main_video"), remoteStream);
      }
    }

    /* Add our local stream */
    // peer_connection.addStream(local_media_stream);
    local_media_stream.getTracks().forEach((track) => {
      console.log('foreachtrack', track);
      peer_connection.addTrack(track, local_media_stream)
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
          signaling_socket.emit('relaySessionDescription',
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
  signaling_socket.on('sessionDescription', function (config) {
    console.log('Remote description received: ', config);
    var peer_id = config.peer_id;
    var peer = peers[peer_id];
    var remote_description = config.session_description;
    console.log(config.session_description);

    var desc = new RTCSessionDescription(remote_description);
    var stuff = peer.setRemoteDescription(desc,
      function () {
        console.log("setRemoteDescription succeeded");
        if (remote_description.type == "offer") {
          console.log("Creating answer");
          peer.createAnswer()
            .then((answer) => {
              return peer.setLocalDescription(answer);
            })
            .then(() => {
              signaling_socket.emit('relaySessionDescription',
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
  signaling_socket.on('iceCandidate', function (config) {
    var peer = peers[config.peer_id];
    var ice_candidate = config.ice_candidate;
    peer.addIceCandidate(new RTCIceCandidate(ice_candidate));
  });


  /**
   * When a user leaves a channel (or is disconnected from the
   * signaling server) everyone will recieve a 'removePeer' message
   * telling them to trash the media channels they have open for those
   * that peer. If it was this client that left a channel, they'll also
   * receive the removePeers. If this client was disconnected, they
   * wont receive removePeers, but rather the
   * signaling_socket.on('disconnect') code will kick in and tear down
   * all the peer sessions.
   */
  signaling_socket.on('removePeer', function (config) {
    console.log('Signaling server said to remove peer:', config);
    var peer_id = config.peer_id;
    if (peer_id in peer_media_elements) {
      peer_media_elements[peer_id].remove();
    }
    if (peer_id in peers) {
      peers[peer_id].close();
    }

    delete peers[peer_id];
    delete peer_media_elements[config.peer_id];
    delete remoteStreams[config.peer_id];

    if (MainVideoPeer === config.peer_id && Object.keys(remoteStreams).length >= 1) {  // if there's at least one remote stream, then add it to main video, else local video 
      attachMediaStream(document.getElementById("main_video"), remoteStreams[Object.keys(remoteStreams)[0]]);
    } else {
      console.log('ooooo')
      attachMediaStream(document.getElementById("main_video"), local_media_stream);
    }
  });
}

/***********************/
/** Common stuff **/
/***********************/
attachMediaStream = function (element, stream) {
  element.srcObject = stream;
};

createVideoElement = function (stream, peer_id) {
  var videoWrapper = $("<div class='video-tile animated fadeInRight'></div>")
  var videoEle = $("<video onclick='toggleMainVideo(this)' peer_id='" + peer_id + "'>");
  videoEle.attr("autoplay", "autoplay");
  videoEle.attr("playsinline", "");
  $(videoWrapper).append(videoEle);
  $('#remote_videos').append(videoWrapper);
  attachMediaStream(videoEle[0], stream);
  return videoWrapper;
}

toggleMainVideo = function (selfEle) {
  var peer_id = $(selfEle).attr('peer_id');
  MainVideoPeer = peer_id;
  console.log(remoteStreams)
  console.log('toggleMainVideo', selfEle, $(selfEle).attr('peer_id'))
  if (peer_id) {
    attachMediaStream(document.getElementById("main_video"), remoteStreams[peer_id]);
    console.log('add remote stream', remoteStreams[peer_id])
  } else {
    attachMediaStream(document.getElementById("main_video"), local_media_stream);
    console.log('add local stream', local_media_stream)
  }
}

toggleCamera = function () {
  $(".videoToggle").toggle()
  $(".local_video").toggle()
  var videoTracks = local_media_stream.getVideoTracks();
  if (videoTracks.length === 0) {
    console.log("No local video available.");
    return;
  }
  console.log("Toggling video mute state.");
  for (var i = 0; i < videoTracks.length; ++i) {
    videoTracks[i].enabled = !cameraOn;
  }
  cameraOn = !cameraOn;
}

toggleMic = function () {
  $(".micToggle").toggle()
  var audioTracks = local_media_stream.getAudioTracks();
  if (audioTracks.length === 0) {
    console.log("No local audio available.");
    return;
  }
  console.log("Toggling audio mute state.");
  for (var i = 0; i < audioTracks.length; ++i) {
    audioTracks[i].enabled = !micOn;
  }
  micOn = !micOn;
}
var cameraOn = true;
var micOn = true;
$(".videoToggle").click(toggleCamera)
$(".micToggle").click(toggleMic)
$(".btn-call-end").click(function () { window.location.href = "/" })

/***********************/
/** Local media stuff **/
/***********************/
function setup_local_media(callback, errorback) {
  if (local_media_stream != null) {  /* ie, if we've already been initialized */
    if (callback) callback();
    return;
  }
  /* Ask user for permission to use the computers microphone and/or camera,
   * attach it to an <audio> or <video> tag if they give us access. */
  console.log("Requesting access to local audio / video inputs");


  navigator.getUserMedia = (navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia);

  // check if the video and audio devices exist or not
  var video_exist = false;
  var audio_exist = false;
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

      var constraints = {
        "audio": audio_exist,
        "video": video_exist,
      }
      return constraints;
    }).then(constraints => {
      console.log('constraints', constraints)
      navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => { /* user accepted access to a/v */
          console.log("Access granted to audio/video", stream);
          local_media_stream = stream;
          attachMediaStream(document.getElementById("main_video"), stream);
          attachMediaStream(document.getElementById("local_video"), stream);
          if (callback) callback();
        })
        .catch((e) => { /* user denied access to a/v */
          console.log("Access denied for audio/video");
          alert("You chose not to provide access to the camera/microphone, demo will not work.");
          if (errorback) errorback();
        });

    })


}