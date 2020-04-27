var express = require('express');
var router = express.Router();
var RoomController = require('../controllers/rooms');

router.post('/get_room', RoomController.getRoom);

router.get('/get_status', RoomController.getStatus);

module.exports = router;
