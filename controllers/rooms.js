var Models = require('../models');
var Room = Models.Room;
var Roomuser = Models.RoomUser;
require('dotenv').config();
var channels = require('../global/channels');

// CREATE ROOM: /createroom
exports.createRoom = async function (req, res) {
  console.log(req.body)
  var ck = await checkInternKey(req.body.key)
  if (!ck) { res.status(406).send({ message: "Invalid Key" }); return; }

  let userData = req.body;
  userData.roomId = generateRandomStr(32);
  userData.roomHash = generateRandomStr(32);
  userData.hostGuest = generateRandomStr(6);
  let NewRoom = new Room(userData); // this is model object.
  NewRoom.save()
    .then((data) => {
      console.log(data);
      let resData = {
        status: 200,
        roomId: data.roomId,
        roomHash: data.roomHash,
        audio: data.audio,
        video: data.video,
        screenshare: data.screenshare,
        private: data.private,
        privateCode: data.privateCode,
        privateText: data.privateText,
        createdAt: data.createdAt,
        returnParam: data.returnParam,
        roomHost: process.env.APP_URL + data.roomId + "-" + data.hostGuest,
        roomGuest: process.env.APP_URL + data.roomId + "-" + data.hostGuest.split("").reverse().join(""),
      }

      res.status(201).send(resData);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).send({ status: 'failed', message: err.message });
    })
};

// GET ROOM: /get_room 
exports.getRoom = function (req, res) {
  var room_id = req.body.roomId;
  var hostGuest = req.body.hostGuest;
  console.log(room_id)
  Room.findByRoomID(room_id).then(room => {
    console.log(room_id, room)
    if (!room || (hostGuest != room.hostGuest && hostGuest != room.hostGuest.split("").reverse().join(""))) {
      res.status(500).send({ message: "Room doesn't exist" })
      console.log(room)
    } else if (room.closedAt != null) {
      res.status(500).send({ message: "Room is closed" })
    } else {
      res.status(200).send(room)
    }
  })
};

// compare privateCode
exports.comparePrivateCode = async function (req, res) {
  var room_id = req.body.roomId;
  console.log(room_id)
  Room.findByRoomID(room_id).then(async (room) => {
    if (!room) {
      res.status(500).send({ message: "Room doesn't exist" })
    } else if (room.closedAt != null) {
      res.status(500).send({ message: "Room is closed" })
    } else if (room.privateCode != req.body.privateCode) {
      res.status(500).send({ message: "Invalid Private Code" })
    }
    var privateHash = generateRandomStr(12)
    await Room.findByIdAndUpdate(room._id, { privateHash }, { new: true }).exec();
    res.status(200).send({ message: 'Success', roomId: room.roomId, privateHash })
  })
};

// CLOSE ROOM: /closeroom
exports.closeRoom = async function (req, res) {
  var data = req.body;

  var cr = await checkRoomHash(data.roomId, data.roomHash);
  var ck = await checkInternKey(req.body.key)
  if (!cr) { res.status(406).send({ message: "Invalid RoomHash" }); return; }
  if (!ck) { res.status(406).send({ message: "Invalid Key" }); return; }

  await Room.findOneAndUpdate({ roomHash: data.roomHash }, { closedAt: Date.now(), roomStatus: 'closed' }, { new: true })
  console.log('closeRoom', data, channels)
  for (id in channels[data.roomId]) {
    channels[data.roomId][id].emit('roomClosed', data);
  }
  res.status(200).send({ status: 200, roomId: data.roomId, roomStatus: 'closed' });
};

// SEND TEST TO ROOM: /texttoroom
exports.textToRoom = async function (req, res) {
  var data = req.body;

  var cr = await checkRoomHash(data.roomId, data.roomHash);
  var ck = await checkInternKey(req.body.key)
  if (!cr) { res.status(406).send({ message: "Invalid RoomHash" }); return; }
  if (!ck) { res.status(406).send({ message: "Invalid Key" }); return; }

  console.log('textToRoom', data, channels)
  for (id in channels[data.roomId]) {
    channels[data.roomId][id].emit('textReceived', data);
  }
  res.status(200).send({ status: 200, roomId: data.roomId });
};

// SEND MEDIA TO ROOM: /playtoroom
exports.playToRoom = async function (req, res) {
  var data = req.body;

  var cr = await checkRoomHash(data.roomId, data.roomHash);
  var ck = await checkInternKey(req.body.key)
  if (!cr) { res.status(406).send({ message: "Invalid RoomHash" }); return; }
  if (!ck) { res.status(406).send({ message: "Invalid Key" }); return; }

  console.log('playToRoom', data, channels)
  for (id in channels[data.roomId]) {
    channels[data.roomId][id].emit('playReceived', data);
  }
  res.status(200).send({ status: 200, roomId: data.roomId });
};

// GET STATUS OF A ROOM: /status
exports.statusOfRoom = async function (req, res) {
  var data = req.body;

  var cr = await checkRoomHash(data.roomId, data.roomHash);
  var ck = await checkInternKey(req.body.key)
  if (!cr) { res.status(406).send({ message: "Invalid RoomHash" }); return; }
  if (!ck) { res.status(406).send({ message: "Invalid Key" }); return; }

  var rooms = await Room.find({ roomHash: data.roomHash });
  var room = rooms[0]
  var roomusers = await Roomuser.find({ room_id: room._id });
  console.log('room', roomusers)
  var totalUsedSeconds = room.totalUsedSeconds;
  var resUsers = [];
  roomusers.forEach(user => {
    var temp = { ...user }
    var user = temp._doc
    console.log(user)
    if (user.leavedAt == undefined) {
      var joinedAt = user.joinedAt
      var leavedAt = new Date();
      user.usedSeconds = Math.abs((leavedAt.getTime() - joinedAt.getTime()) / 1000);
      totalUsedSeconds += user.usedSeconds;
    }
    resUsers.push(user)
  });
  var resData = {
    roomId: room.roomId,
    roomHash: room.roomHash,
    totalUsedSeconds: totalUsedSeconds,
    usersOnline: room.usersOnline,
    maxUsersOnline: room.maxUsersOnline,
    video: room.video,
    audio: room.audio,
    screenshare: room.screenshare,
    createdAt: room.createdAt,
    roomStatus: room.roomStatus,
    roomusers: resUsers,
    roomHost: "https://call.bemycall.com/r/" + room.roomId + "-" + room.hostGuest,
    roomGuest: "https://call.bemycall.com/r/" + room.roomId + "-" + room.hostGuest.split("").reverse().join(""),
  }
  console.log('resData', resData)
  res.status(200).send(resData);
};

// GET STATUS OF ALL THE ONLINE ROOM: /intern/rooms
exports.statusOfAllRoom = async function (req, res) {
  console.log("statusOfAllRoom", process.env.INTERN_KEY)
  if (checkInternKey(req.body.key)) {
    var rooms = await Room.find({ closedAt: null })
    var resData = [];
    rooms.forEach(async (item) => {
      var temp = { ...item }
      var room = temp._doc
      room.users = await Roomuser.find({ room_id: room._id, leavedAt: undefined });
      // console.log('rooms', room)
      delete room._id;
      delete room.returnParam;
      delete room.roomusers;
      resData.push(room)
    });
    wait(1500).then(() => {
      console.log('sent')
      res.status(200).send(resData)
    })
  } else {
    res.status(500).send("Error: Invalid Key")
  }
}

// GET ALL THE ONLINE USERS: /intern/users
exports.getUsersOnline = async function (req, res) {
  var data = req.body;
  if (checkInternKey(req.body.key)) {
    var users = await Roomuser.find({ leavedAt: undefined });
    var resUsers = [];
    users.forEach(item => {
      var temp = { ...item }
      var user = temp._doc;
      var joinedAt = user.joinedAt
      var leavedAt = new Date();
      user.usedSeconds = Math.abs((leavedAt.getTime() - joinedAt.getTime()) / 1000);
      resUsers.push(user)
    });
    res.status(200).send(resUsers)
  }
}

// GET STATS BETWEEN FROM AND TO: /intern/stats
exports.getStats = async function (req, res) {

  // Maybe you need to count usedSeconds for online users here again . . .
  var data = req.body;
  console.log(data)
  var from = new Date(new Date(data.from).toISOString());
  var to = new Date(new Date(data.to).toISOString());
  console.log('from, to', from, to)
  if (checkInternKey(req.body.key)) {
    var rooms = await Room.find({ createdAt: { $gte: from, $lte: to } });
    var users = await Roomuser.find({ joinedAt: { $gte: from, $lte: to } });
    var audioRooms = await Room.find({ createdAt: { $gte: from, $lte: to }, video: false });
    var usedSeconds = await Room.aggregate(
      [{
        $match: {
          createdAt: { $gte: from, $lte: to }
        }
      },
      {
        $group: {
          _id: 1,
          amount: { $sum: "$totalUsedSeconds" }
        }
      }]
    )
    console.log('stats', usedSeconds)
    var resData = {
      usersTotal: users.length,
      roomsTotla: rooms.length,
      videoRooms: rooms.length - audioRooms.length,
      audioRooms: audioRooms.length,
      usedSeconds: (usedSeconds.length > 1) ? usedSeconds[0].amount : 0,
    }
    res.status(200).send(resData)
  }
}

const checkRoomHash = async (roomId, roomHash) => {
  const rooms = await Room.find({ roomId, roomHash });
  const roomLength = rooms.length;
  console.log('checkroomhash', roomLength)
  if (roomLength != 0) {
    return true
  }
  return false;
}

const checkPrivateCode = async (_id, privateCode) => {
  const room = await Room.findById(_id);
  console.log('checkPrivateCode', (room.privateCode === privateCode), room)
  if (room.privateCode === privateCode) {
    return true
  }
  return false;
}

const generateRandomStr = (stringLength) => {
  const randomstring = require('randomstring')
  return (randomstring.generate(stringLength))
}

const checkInternKey = (key) => {
  return (process.env.INTERN_KEY === key)
}

const wait = (delayInMS) => {
  return new Promise(resolve => setTimeout(resolve, delayInMS));
}
