var mongoose = require('mongoose');
const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    unique: true,
    required: true,
  },
  type: {
    type: String,
    default: 'conference',
  },
  video: {
    type: Boolean,
    required: true,
  },
  audio: {
    type: Boolean,
    required: true,
  },
  current_users: {
    type: Number,
    default: 0,
  },
  max_user: {
    type: Number,
    required: true,
  },
  used_time: {
    type: Date,
    default: null
  },
  created_at: {
    type: Date,
    default: Date.now
  },
});

roomSchema.statics.findByName = async function (name) {
  let room = await this.findOne({
    name: name,
  });
  if (!room) {
    return false;
  }
  return room;
};

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;