var mongoose = require('mongoose');
var now = new Date();
const roomUserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
  leavedAt: {
    type: Date,
  },
  usedSeconds: {
    type: Number,
    default: 0,
  },
  room_id: {    // room_id is _id of Room. we call '_id of Room' room_id
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
  }
});


roomUserSchema.statics.findByUserId = async function (userId) {
  console.log(userId)
  let roomUser = await this.findOne({ userId });
  if (!roomUser) {
    return false;
  }
  return roomUser;
};

const RoomUser = mongoose.model('RoomUser', roomUserSchema);

module.exports = RoomUser;