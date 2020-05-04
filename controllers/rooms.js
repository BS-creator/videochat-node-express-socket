var Models = require('../models');
var Room = Models.Room;
var Roomuser = Models.RoomUser;
require('dotenv').config();
var channels = require('../global/channels');

// CREATE ROOM: /createroom
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
        privateText: data.privateText,
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

// GET ROOM: /get_room 
exports.getRoom = function (req, res) {
  var room_id = req.body.roomID;
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
  var room_id = req.body.roomID;
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
    res.status(200).send({ message: 'Success', roomID: room.roomID, privateHash })
  })
};

// CLOSE ROOM: /closeroom
exports.closeRoom = async function (req, res) {
  var data = req.body;

  var cr = await checkRoomHash(data.roomID, data.roomHash);
  var ck = await checkInternKey(req.body.key)
  if (!cr) { res.status(406).send({ message: "Invalid RoomHash" }); return; }
  if (!ck) { res.status(406).send({ message: "Invalid Key" }); return; }

  await Room.findOneAndUpdate({ _id: data.roomHash }, { closedAt: Date.now(), roomStatus: 'closed' }, { new: true })
  console.log('closeRoom', data, channels)
  for (id in channels[data.roomID]) {
    channels[data.roomID][id].emit('roomClosed', data);
  }
  res.status(200).send({ status: 200, roomID: data.roomID, roomStatus: 'closed' });
};

// SEND TEST TO ROOM: /texttoroom
exports.textToRoom = async function (req, res) {
  var data = req.body;

  var cr = await checkRoomHash(data.roomID, data.roomHash);
  var ck = await checkInternKey(req.body.key)
  if (!cr) { res.status(406).send({ message: "Invalid RoomHash" }); return; }
  if (!ck) { res.status(406).send({ message: "Invalid Key" }); return; }

  console.log('textToRoom', data, channels)
  for (id in channels[data.roomID]) {
    channels[data.roomID][id].emit('textReceived', data);
  }
  res.status(200).send({ status: 200, roomID: data.roomID });
};

// SEND MEDIA TO ROOM: /playtoroom
exports.playToRoom = async function (req, res) {
  var data = req.body;

  var cr = await checkRoomHash(data.roomID, data.roomHash);
  var ck = await checkInternKey(req.body.key)
  if (!cr) { res.status(406).send({ message: "Invalid RoomHash" }); return; }
  if (!ck) { res.status(406).send({ message: "Invalid Key" }); return; }

  console.log('playToRoom', data, channels)
  for (id in channels[data.roomID]) {
    channels[data.roomID][id].emit('playReceived', data);
  }
  res.status(200).send({ status: 200, roomID: data.roomID });
};

// GET STATUS OF A ROOM: /status
exports.statusOfRoom = async function (req, res) {
  var data = req.body;

  var cr = await checkRoomHash(data.roomID, data.roomHash);
  var ck = await checkInternKey(req.body.key)
  if (!cr) { res.status(406).send({ message: "Invalid RoomHash" }); return; }
  if (!ck) { res.status(406).send({ message: "Invalid Key" }); return; }

  var room = await Room.findById(data.roomHash);
  var roomusers = await Roomuser.find({ roomHash: room._id });
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
    roomusers: resUsers,
    roomHost: "https://call.bemycall.com/r/" + room.roomID + "-" + room.hostGuest,
    roomGuest: "https://call.bemycall.com/r/" + room.roomID + "-" + room.hostGuest.split("").reverse().join(""),
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
      room.roomHash = room._id;
      delete room._id;
      delete room.returnParam;
      delete room.roomusers;
      room.users = await Roomuser.find({ roomHash: room.roomHash, leavedAt: undefined });
      // console.log('rooms', room)
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
      usedSeconds: usedSeconds[0].amount,
    }
    res.status(200).send(resData)
  }
}

const checkRoomHash = async (roomID, roomHash) => {
  const roomLength = await Room.find({ roomID, _id: roomHash }).count();
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
