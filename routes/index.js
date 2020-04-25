var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: '' });
});

/* GET room page. */
router.get('/r/:roomName', function (req, res, next) {
  res.render('room', { title: req.params.roomName });
});

module.exports = router;
