var mongoose = require('mongoose');

// roomHash = Schema.Types.ObjectId of this schema
// roomID, audio, video, screenshare, roomType, private, privateCode, privateText,
// maxUser, usersOnline, maxUsersOnline, totalUsedSeconds, roomStatus, 
// hearbeat, hearbeatUrl, watermarkUrl, returnParam, createdAt, closedAt
const roomSchema = new mongoose.Schema({
  roomID: {
    type: String,
    unique: true,
    required: true,
  },
  audio: {
    type: Boolean,
    required: true,
  },
  video: {
    type: Boolean,
    required: true,
  },
  screenshare: {
    type: Boolean,
    required: true,
  },
  roomType: {
    type: String,
    default: 'conference',
  },
  private: {
    type: Boolean,
    default: false,
  },
  privateCode: {
    type: String
  },
  privateText: {
    type: String
  },
  privateHash: {
    type: String
  },
  maxUser: {
    type: Number,
    required: true,
  },
  usersOnline: {
    type: Number,
    default: 0,
  },
  maxUsersOnline: {
    type: Number,
    default: 0,
  },
  totalUsedSeconds: {
    type: Number,
    default: 0,
  },
  roomStatus: {
    type: String,
    default: 'active',
  },
  hearbeat: {
    type: Boolean,
  },
  hearbeatUrl: {
    type: String,
  },
  watermarkUrl: {
    type: String,
  },
  returnParam: [mongoose.Schema.Types.Mixed],

  hostGuest: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  closedAt: {
    type: Date,
    default: null
  },
  roomusers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomUser"
    }
  ]

});

roomSchema.statics.findByRoomID = async function (roomID) {
  let room = await this.findOne({ roomID });
  if (!room) {
    return false;
  }
  return room;
};

roomSchema.pre('remove', function (next) {
  this.model('RoomUser').deleteMany({ user: this._id }, next);
});

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;