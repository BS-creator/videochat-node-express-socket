$(document).ready(function () {

  var privateText = getParameterByName('text');
  $("#privateText").text(privateText)

  var ServerURL = "http://localhost:3000/room";
  // var ServerURL = "https://call.bemycall.com/room";
  $("#go_room").click(function () {
    var pcode = $("#privateCode").val();
    var roomName = getParameterByName('roomID');
    let segs = roomName.split("-");
    var roomID = segs[0]
    $.post(ServerURL + '/comparePrivateCode', { roomID, privateCode: pcode }, function (res) {
      // $("#error_p").text(res.message).show()
      window.location.href = "/r/" + res.roomID + "-" + segs[1] + "?hash=" + res.privateHash
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