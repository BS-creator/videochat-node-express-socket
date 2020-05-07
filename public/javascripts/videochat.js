import { CONFIG } from './config.js'

var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.msRTCSessionDescription;

var DBconfig = {}                    // Stores chat config which from the database
var MainVideoPeer = 'null';        // Peer of Big Video (main video)
var signalingSocket = null;        // For signal socket
var localMediaStream = null;       // Stores local media stream
var peers = {};                    // Stores all the remote Peers
var peerMediaElements = {};        // Stores all the remote video element DOM
var remoteStreams = {};            // Stores all the remote media streams
var cameraOn = true;               // Status of camera 
var micOn = true;                  // Status of mic
var screenShareOn = false;         // Status of screenshare
var sharedVideoStream = null;      // Stores shared Stream
var ServerURL = '';                // Stores Server URL. It same as self location . . .

async function init() {
  ServerURL = "http://localhost:3000/room";
  // ServerURL = "https://call.bemycall.com/room";

  await $.post(ServerURL + "/get_room", { roomId: getRoomName(), hostGuest: getRoomName(true) },
    function (res) {
      DBconfig = res;
    }, 'json')
    .fail(function (err) {
      console.log(err)
      window.localStorage.setItem('whenRoomClosed', JSON.stringify({ display: err.responseJSON.message }));
      window.location.href = "/room-closed"
      // alert(err.responseJSON.message)
    });

  if (!DBconfig.video) {
    $(".videoToggle").addClass('disabled');
  }
  if (!DBconfig.audio) {
    $(".micToggle").addClass('disabled');
  }
  if (!DBconfig.screenshare) {
    $(".screenShare").addClass('disabled');
  }
  if (DBconfig.private && (DBconfig.privateHash == undefined || DBconfig.privateHash != getParameterByName('hash'))) {
    window.localStorage.setItem('privateText', DBconfig.privateText);
    window.location.href = '/confirm?roomId=' + DBconfig.roomId + "-" + getRoomName(true)
  }

  // toggleGrid();  // i'd like to see toggle view when developing because it's smaller
  $(".micToggle").click(toggleMic);
  $(".gridToggle").click(toggleGrid);
  $(".videoToggle").click(toggleCamera);
  $(".screenShare").click(toggleScreenShare);
  $(".btn-call-end").click(function () {
    var data = {
      hangupDisplayTextHost: DBconfig.hangupDisplayTextHost,
      hangupDisplayTextHost: DBconfig.hangupDisplayTextHost,
      hangupCallToActionButtonHost: DBconfig.hangupCallToActionButtonHost,
      hangupCallToActionButtonGuest: DBconfig.hangupCallToActionButtonGuest,
      hangupForceForwardHost: DBconfig.hangupForceForwardHost,
      hangupForceForwardGuest: DBconfig.hangupForceForwardGuest,
      isHost: checkHost()
    }
    localStorage.setItem("whenHangUp", JSON.stringify(data));
    window.location.href = "/";
  })
  $(".watermark").css("background-image", "url(" + DBconfig.watermarkUrl + ")")
  window.toggleMainVideo = toggleMainVideo;  // for toggle main video in html


  console.log("Init: Connecting to signaling server");
  signalingSocket = io(CONFIG.SIGNALING_SERVER);
  signalingSocket = io();

  signalingSocket.on('connect', function () {
    console.log("Connected to signaling server");
    setup_local_media(function () {
      /* once the user has given us access to their
       * microphone/camcorder, join the channel and start peering up */
      join_chat_channel(getRoomName(), DBconfig);
    });
  });

  signalingSocket.on('disconnect', function () {
    console.log("Disconnected from signaling server");
    /* Tear down all of our peer connections and remove all the media divs when we disconnect */
    for (peer_id in peerMediaElements) {
      peerMediaElements[peer_id].remove();
      remoteStreams[peer_id].remove();
    }
    for (peer_id in peers) {
      peers[peer_id].close();
    }

    peers = {};
    peerMediaElements = {};
    remoteStreams = {};
  });

  /** When the room is full */
  signalingSocket.on('fullRoom', function (data) {
    let maxUser = data.maxUser;
    alert("Excuse me, the room you tried is full now!")
    window.location.href = "/"
  })

  /** When the room is closed */
  signalingSocket.on('roomClosed', function (data) {
    console.log(data);
    if (checkHost() && data.forceForwardHost) {
      window.location.href = data.forceForwardHost
    } else if (!checkHost() && data.forceForwardGuest) {
      window.location.href = data.forceForwardGuest
    } else {
      data.isHost = checkHost();
      window.localStorage.setItem('whenRoomClosed', JSON.stringify(data));
      window.location.href = "/room-closed";
    }
  })

  /** When the play media is received */
  signalingSocket.on('playReceived', function (data) {
    console.log(data);
    var media;
    if (checkHost()) {
      media = data.playHost
    } else {
      media = data.playGuest
    }
    $("body").append("<audio autoplay><source src='" + media + "'></audio>")
  })

  /** When the text is received from ... */
  signalingSocket.on('textReceived', function (data) {
    console.log(data);
    var txt = '';
    if (checkHost()) {
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
  signalingSocket.on('addPeer', function (config) {
    console.log('Signaling server said to add peer:', config, peers);
    let peer_id = config.peer_id;
    if (peer_id in peers) {
      /* This could happen if the user joins multiple channels where the other peer is also in. */
      console.log("Already connected to peer ", peer_id);
      return;
    }
    let peer_connection = new RTCPeerConnection(
      { "iceServers": CONFIG.ICE_SERVERS },
      { "optional": [{ "DtlsSrtpKeyAgreement": true }] } //for firefox
    );
    peers[peer_id] = peer_connection;

    peer_connection.onicecandidate = function (event) {
      if (event.candidate) {
        signalingSocket.emit('relayICECandidate', {
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
      if (!(peerMediaElements.hasOwnProperty(peer_id))) {
        let remote_media_ele = createVideoElement(remoteStream, peer_id)
        peerMediaElements[peer_id] = remote_media_ele;
        chageLayout()

      }
      remoteStreams[peer_id] = remoteStream;
      if (Object.keys(remoteStreams).length == 1) {
        attachMediaStream(document.getElementById("main_video"), remoteStream);
      }
    }

    /* Add our local stream */
    if (screenShareOn) {
      sharedVideoStream.getTracks().forEach((track) => {
        console.log('foreachtrack', track);
        peer_connection.addTrack(track, localMediaStream)
      });
    } else {
      localMediaStream.getTracks().forEach((track) => {
        console.log('foreachtrack', track);
        peer_connection.addTrack(track, localMediaStream)
      });
    }

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
          signalingSocket.emit('relaySessionDescription',
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
  signalingSocket.on('sessionDescription', function (config) {
    console.log('Remote description received: ', config);
    let peer_id = config.peer_id;
    let peer = peers[peer_id];
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
              signalingSocket.emit('relaySessionDescription',
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
  signalingSocket.on('iceCandidate', function (config) {
    let peer = peers[config.peer_id];
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
   * signalingSocket.on('disconnect') code will kick in and tear down
   * all the peer sessions.
   */
  signalingSocket.on('removePeer', function (config) {
    console.log('Signaling server said to remove peer:', config);
    let peer_id = config.peer_id;
    if (peer_id in peerMediaElements) {
      peerMediaElements[peer_id].remove();
    }
    if (peer_id in peers) {
      peers[peer_id].close();
    }

    delete peers[peer_id];
    delete peerMediaElements[config.peer_id];
    delete remoteStreams[config.peer_id];
    chageLayout()

    if (MainVideoPeer === config.peer_id && Object.keys(remoteStreams).length >= 1) {  // if there's at least one remote stream, then add it to main video, else local video 
      attachMediaStream(document.getElementById("main_video"), remoteStreams[Object.keys(remoteStreams)[0]]);
    } else {
      attachMediaStream(document.getElementById("main_video"), localMediaStream);
    }
  });
}

function join_chat_channel(channel, userData) {
  signalingSocket.emit('join', { "channel": channel, "userData": userData });
}

function part_chat_channel(channel) {
  signalingSocket.emit('part', channel);
}

function attachMediaStream(element, stream) {
  element.srcObject = stream;
}

function createVideoElement(stream, peer_id) {
  var eleLen = parseInt(Object.keys(peerMediaElements).length) + 1;
  console.log(eleLen)
  var layout = [["100%", "100%"], ["50%", "100%"], ["33.333%", "100%"], ["50%", "50%"], ["33.333%", "50%"], ["33.333%", "50%"], ["25%", "50%"]]
  let styles = '';//($("#remote_videos").hasClass("remote-tile-view")) ? 'style=width: ' + layout[eleLen][0] + ', height: ' + layout[eleLen][1] : '';
  let videoWrapper = $("<div class='video-tile animated fadeInRight' " + styles + "></div>")
  let videoEle = $("<video onclick='toggleMainVideo(this)' peer_id='" + peer_id + "'>");
  videoEle.attr("autoplay", "autoplay");
  videoEle.attr("playsinline", "");
  $(videoWrapper).append(videoEle);
  $('#remote_videos').append(videoWrapper);
  attachMediaStream(videoEle[0], stream);
  // chageLayout()
  return videoWrapper;
}

function chageLayout() {
  var eleLen = Object.keys(peerMediaElements).length;
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

function toggleMainVideo(selfEle) {
  let peer_id = $(selfEle).attr('peer_id');
  MainVideoPeer = peer_id;
  console.log(remoteStreams)
  console.log('toggleMainVideo', selfEle, $(selfEle).attr('peer_id'))
  if (peer_id) {
    attachMediaStream(document.getElementById("main_video"), remoteStreams[peer_id]);
    console.log('add remote stream', remoteStreams[peer_id])
  } else {
    attachMediaStream(document.getElementById("main_video"), localMediaStream);
    console.log('add local stream', localMediaStream)
  }
}

function toggleCamera() {
  $(".videoToggle").toggle()
  $(".local_video").toggle()
  let videoTracks = localMediaStream.getVideoTracks();
  if (videoTracks.length === 0) {
    console.log("No local video available.");
    return;
  }
  console.log("Toggling video mute state.");
  for (let i = 0; i < videoTracks.length; ++i) {
    videoTracks[i].enabled = !cameraOn;
  }
  cameraOn = !cameraOn;
}

function toggleMic() {
  $(".micToggle").toggle()
  let audioTracks = localMediaStream.getAudioTracks();
  if (audioTracks.length === 0) {
    console.log("No local audio available.");
    return;
  }
  console.log("Toggling audio mute state.");
  for (let i = 0; i < audioTracks.length; ++i) {
    audioTracks[i].enabled = !micOn;
  }
  micOn = !micOn;
}

function toggleGrid() {
  $(".gridToggle").toggle();
  $(".local-video-wrapper").toggle();
  $(".main-video-wrapper").toggle();
  $("#remote_videos").toggleClass("remote-tile-view");
  chageLayout();

}

function toggleScreenShare() {
  $(".screenShare").toggle();
  if (screenShareOn) {
    let tracks = sharedVideoStream.getTracks();
    tracks.forEach(track => track.stop());
    let videoTrack = localMediaStream.getVideoTracks()[0];
    let PCs = Object.values(peers);
    PCs.map(function (pc) {
      var sender = pc.getSenders().find(function (s) {
        return s.track.kind == videoTrack.kind;
      });
      console.log('found sender:', sender);
      sender.replaceTrack(videoTrack);
    });
    document.getElementById("local_video").srcObject = localMediaStream;
    document.getElementById("local_video_tile_view").srcObject = localMediaStream;
    screenShareOn = false;
  } else {
    navigator.mediaDevices.getDisplayMedia(CONFIG.displayMediaOptions)
      .then((stream) => {
        let videoTrack = stream.getVideoTracks()[0];
        let PCs = Object.values(peers);
        PCs.map(function (pc) {
          var sender = pc.getSenders().find(function (s) {
            return s.track.kind == videoTrack.kind;
          });
          console.log('found sender:', sender);
          sender.replaceTrack(videoTrack);
        });

        screenShareOn = true;
        sharedVideoStream = stream;
        document.getElementById("local_video").srcObject = stream;
        document.getElementById("local_video_tile_view").srcObject = stream;
      })
      .catch((e) => console.error(e.message));
  }
}

function setup_local_media(callback, errorback) {
  if (localMediaStream != null) {  /* ie, if we've already been initialized */
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
      console.log(DBconfig)
      let constraints = {
        "audio": DBconfig.audio ? (audio_exist ? true : false) : false,
        "video": DBconfig.video ? (video_exist ? true : false) : false,
        // audio: true,
        // video: false,
      }
      return constraints;
    }).then(constraints => {
      console.log('constraints', constraints)
      navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => { /* user accepted access to a/v */
          console.log("Access granted to audio/video", stream);
          localMediaStream = stream;
          attachMediaStream(document.getElementById("main_video"), stream);
          attachMediaStream(document.getElementById("local_video"), stream);
          attachMediaStream(document.getElementById("local_video_tile_view"), stream);
          var eles = document.getElementsByClassName("temp-video")
          for (var i = 0; i < eles.length; i++) {
            eles[i].srcObject = stream
          }
          if (callback) callback();
        })
        .catch((e) => { /* user denied access to a/v */
          console.log("Access denied for audio/video");
          // alert("You chose not to provide access to the camera/microphone");
          if (errorback) errorback();
        });

    })
}

function getRoomName(checkHost) {
  if (checkHost == undefined) checkHost = false;

  let segs = (window.location.href).split("/");
  let commonSeg = segs[segs.length - 1].split("-")
  console.log(commonSeg[0])
  if (checkHost) {
    return (commonSeg[commonSeg.length - 1].split('?'))[0]
  }
  return commonSeg[0];
}

function checkHost() {
  return (DBconfig.hostGuest == getRoomName(true))
}

function getParameterByName(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
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

if (isMobile.any()) {
  $(".screenShare").hide();
}

init();