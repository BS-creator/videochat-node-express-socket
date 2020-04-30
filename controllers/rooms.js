var Models = require('../models');
var Room = Models.Room;
var Roomuser = Models.RoomUser;
var channels = require('../global/channels');
exports.createRoom = function (req, res) {
  console.log(req.body)
  let userData = req.body;
  userData.roomID = generateRandomStr(32);
  userData.hostGuest = generateRandomStr(6);
  let NewRoom = new Room(userData); // this is model object.
  NewRoom.save()
    .then((data) => {
      console.log(data);
      let resData = {
        status: 200,
        roomID: data.roomID,
        roomHash: data._id,
        audio: data.audio,
        video: data.video,
        screenshare: data.screenshare,
        private: data.private,
        privateCode: data.privateCode,
        createdAt: data.createdAt,
        returnParam: data.returnParam,
        roomHost: "https://call.bemycall.com/r/" + data.roomID + "-" + data.hostGuest,
        roomGuest: "https://call.bemycall.com/r/" + data.roomID + "-" + data.hostGuest.split("").reverse().join(""),
      }

      res.status(201).send(resData);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).send({ status: 'failed', message: err.message });
    })
};

exports.getRoom = function (req, res) {
  var room_id = req.body.roomID;
  console.log(room_id)
  Room.findByRoomID(room_id).then(room => {
    console.log(room_id, room)
    if (!room) {
      res.status(500).send({ message: "Room doesn't exist" })
      console.log(room)
    } else if (room.closedAt != null) {
      res.status(500).send({ message: "Room is closed" })
    } else {
      res.status(200).send(room)
    }
  })
};

exports.closeRoom = async function (req, res) {
  var data = req.body;
  await Room.findOneAndUpdate({ _id: data.roomHash }, { closedAt: Date.now(), roomStatus: 'closed' }, { new: true })
  console.log('closeRoom', data, channels)
  for (id in channels[data.roomID]) {
    channels[data.roomID][id].emit('roomClosed', data);
  }
  res.status(200).send({ status: 200, roomID: data.roomID, roomStatus: 'closed' });
};

exports.textToRoom = function (req, res) {
  var data = req.body;
  console.log('textToRoom', data, channels)
  for (id in channels[data.roomID]) {
    channels[data.roomID][id].emit('textReceived', data);
  }
  res.status(200).send({ status: 200, roomID: data.roomID });
};

exports.playToRoom = function (req, res) {
  var data = req.body;
  console.log('playToRoom', data, channels)
  for (id in channels[data.roomID]) {
    channels[data.roomID][id].emit('playReceived', data);
  }
  res.status(200).send({ status: 200, roomID: data.roomID });
};

exports.status = async function (req, res) {
  var data = req.body;
  var room = await Room.findById(data.roomHash);
  var roomusers = await Roomuser.find({ roomHash: room._id });
  console.log('room', roomusers)
  var totalUsedSeconds = room.totalUsedSeconds;
  roomusers.forEach(user => {
    if (!(user.closedAt)) {
      var joinedAt = user.joinedAt
      var leavedAt = new Date();
      user.usedSeconds = Math.abs((leavedAt.getTime() - joinedAt.getTime()) / 1000);
      totalUsedSeconds += user.usedSeconds;
    }
  });
  var resData = {
    roomID: room.roomID,
    roomHash: room._id,
    totalUsedSeconds: totalUsedSeconds,
    usersOnline: room.usersOnline,
    maxUsersOnline: room.maxUsersOnline,
    video: room.video,
    audio: room.audio,
    screenshare: room.screenshare,
    createdAt: room.createdAt,
    roomStatus: room.roomStatus,
    roomusers: roomusers,
  }
  console.log('resData', resData)
  res.status(200).send(resData);
};


const generateRandomStr = (stringLength) => {
  const randomstring = require('randomstring')

  return (randomstring.generate(stringLength))
}