var express = require('express');
var router = express.Router();
var RoomController = require('../controllers/rooms');
require('dotenv').config();

/* POST: CREATE ROOM. */
router.post('/createroom', RoomController.createRoom);

/* POST: CLOSE ROOM. */
router.post('/closeroom', RoomController.closeRoom);

/* POST: SEND TEXT TO ROOM. */
router.post('/texttoroom', RoomController.textToRoom);

/* POST: SEND MEDIA TO ROOM. */
router.post('/playtoroom', RoomController.playToRoom);

/* POST: GET STATUS OF SPECIFIC ROOM. */
router.post('/status', RoomController.statusOfRoom);

/* POST: GET STATUS OF ALL THE ONLINE ROOM WITH ONLINE USERS. */
router.post('/intern/rooms', RoomController.statusOfAllRoom);

/* POST: GET ALL THE ONLINE USERS. */
router.post('/intern/users', RoomController.getUsersOnline);

/* POST: GET STATS BETWEEN FROM AND TO. */
router.post('/intern/stats', RoomController.getStats);


module.exports = router;