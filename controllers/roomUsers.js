/* This controller is used by www */
var Models = require('../models');
var RoomUser = Models.RoomUser;
var Room = Models.Room;

exports.createRoomUser = function (roomUser) {
  console.log('createroomuser', roomUser)
  let NewRoomUser = new RoomUser(roomUser); // this is model object.
  NewRoomUser.save()
    .then(async (data) => {
      console.log(data);
      await Room.findOneAndUpdate({ _id: roomUser.roomHash }, { $inc: { usersOnline: 1 } }, { new: true })
      if (roomUser.usersOnline + 1 > roomUser.maxUsersOnline) {
        await Room.findOneAndUpdate({ _id: roomUser.roomHash }, { maxUsersOnline: roomUser.usersOnline + 1 }, { new: true })
      }
    })
    .catch((err) => {
      console.log(err);
    })
};

exports.updateRoomUser = async function (info) {
  console.log(info)
  var roomUser = await RoomUser.findOne({ userId: info.userId });
  console.log("update roomUser", roomUser)
  if (roomUser) {
    var joinedAt = roomUser.joinedAt
    var leavedAt = info.leavedAt
    var usedSeconds = Math.abs((leavedAt.getTime() - joinedAt.getTime()) / 1000);
    var condition = { userId: info.userId };
    var data = { leavedAt, usedSeconds }
    console.log('i am called', leavedAt, joinedAt, usedSeconds, data)
    var res = await RoomUser.updateOne(condition, { $set: data })
    console.log(res.n, res.nModified)
    if (res.nModified != 0) {
      var data = { $inc: { totalUsedSeconds: usedSeconds, usersOnline: -1 } }
      var aa = await Room.findOneAndUpdate({ _id: roomUser.roomHash }, data, { new: true })
      console.log('I am, too', aa.n, aa.nModified)
    }
  }

  // RoomUser.findByUserId(info.userId).then((roomUser) => {
  // })
};

exports.getRoomUserByUserId = function (req, res) {
  let userId = req.body.userId;
  RoomUser.findByUserId(userId).then(roomUser => {
    console.log(userId, roomUser)
    if (!roomUser) {
      res.status(500).send({ message: "RoomUser doesn't exist" })
      console.log(room)
    } else {
      res.status(200).send(room)
    }
  })
};

exports.deleteRoomUser = function (req, res) {
  res.send('NOT IMPLEMENTED: createRoomUser');
};

exports.getStatus = function (req, res) {
  res.send('NOT IMPLEMENTED: RoomUser Status');
};


const generateRandomStr = (stringLength) => {
  const randomstring = require('randomstring')

  return (randomstring.generate(stringLength))
}