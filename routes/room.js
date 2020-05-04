var express = require('express');
var router = express.Router();
var RoomController = require('../controllers/rooms');

// get room Info by roomID, from js
router.post('/get_room', RoomController.getRoom);

// compare privateCode
router.post('/comparePrivateCode', RoomController.comparePrivateCode);

module.exports = router;
