var express = require('express');
var router = express.Router();
var RoomController = require('../controllers/rooms');

router.post('/get_room', RoomController.getRoom);

module.exports = router;
