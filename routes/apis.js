var express = require('express');
var router = express.Router();
var RoomController = require('../controllers/rooms');

/* POST: creating room. */
router.post('/create_room', RoomController.createRoom);

router.get('/get_status', RoomController.getStatus);

module.exports = router;