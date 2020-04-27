var mongoose = require('mongoose');
const usedtimeSchema = new mongoose.Schema({
  name: {
    type: String,
    unique: true,
    required: true,
  },
});
const Usedtime = mongoose.model('Room', usedtimeSchema);

module.exports = Usedtime;