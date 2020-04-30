var express = require('express');
var router = express.Router();
var RoomController = require('../controllers/rooms');

/* POST: CREATE ROOM. */
router.post('/createroom', RoomController.createRoom);

/* POST: CLOSE ROOM. */
router.post('/closeroom', RoomController.closeRoom);

/* POST: CLOSE ROOM. */
router.post('/texttoroom', RoomController.textToRoom);

/* POST: CLOSE ROOM. */
router.post('/playtoroom', RoomController.playToRoom);

/* POST: CLOSE ROOM. */
router.post('/status', RoomController.status);


module.exports = router;