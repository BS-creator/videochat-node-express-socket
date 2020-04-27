var Room = require('../models');

exports.createRoom = function (req, res) {
  console.log(req.body)
  let userData = req.body;
  userData.name = generateRoomName(32);

  let NewRoom = new Room(req.body); // this is modal object.
  NewRoom.save()
    .then((data) => {
      console.log(data);
      res.status(201).send('success');
    })
    .catch((err) => {
      console.log(err);
      res.status(500).send({ status: 'failed', message: err.message });
    })
};

exports.getRoom = function (req, res) {
  let name = req.body.name;
  Room.findByName(name).then(room => {
    console.log(name, room)
    if (!room) {
      res.status(500).send({ message: "Room doesn't exist" })
      console.log(room)
    } else {
      res.status(200).send(room)
    }
  })
};

exports.updateRoom = function (req, res) {
  res.send('NOT IMPLEMENTED: createRoom');
};

exports.deleteRoom = function (req, res) {
  res.send('NOT IMPLEMENTED: createRoom');
};

exports.getStatus = function (req, res) {
  res.send('NOT IMPLEMENTED: Room Status');
};


const generateRoomName = (stringLength) => {
  const randomstring = require('randomstring')

  return (randomstring.generate(stringLength))
}