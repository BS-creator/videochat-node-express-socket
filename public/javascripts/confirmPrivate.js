import { CONFIG } from './config.js'

$(document).ready(function () {

  var privateText = (localStorage.hasOwnProperty('privateText')) ? window.localStorage.getItem('privateText') : '';
  $("#privateText").text(privateText)
  $("#go_room").click(function () {
    var pcode = $("#privateCode").val();
    var roomName = getParameterByName('roomId');
    let segs = roomName.split("-");
    var roomId = segs[0]
    $.post(CONFIG.ServerURL + '/comparePrivateCode', { roomId, privateCode: pcode }, function (res) {
      // $("#error_p").text(res.message).show()
      window.location.href = "/" + res.roomId + "-" + segs[1] + "?hash=" + res.privateHash
    }, 'json')
      .fail(function (err) {
        console.log(err)
        $("#error_p").text(err.responseJSON.message).show()
      });
  })
})

function getParameterByName(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}