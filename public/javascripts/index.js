function generate_room_name(length) {
  length = 10;
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  function s6() {
    let str = '';
    for (var i = 0; i < 6; i++) {
      str += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return str;
  }
  result = s6() + s6() + s6() + s6();
  return result;
}

function init() {

}

$(document).ready(function () {
  var ls = localStorage.getItem('whenRoomClosed')
  console.log(ls)
  if (ls) {
    var data = JSON.parse(ls)
    console.log(data)
    $("#display").html(data.display);
    if (data.isHost) {
      $("#callToAction").attr('href', data.buttonCallToActionHost)
      $("#btnname").html("buttonCallToActionHost")
    } else {
      $("#btnname").html("buttonCallToActionGuest")
      $("#callToAction").attr('href', data.buttonCallToActionGuest)
    }
  }
})