$(document).ready(function () {
  var ls = localStorage.getItem('whenRoomClosed')
  console.log(ls)
  if (ls) {
    var data = JSON.parse(ls)
    console.log(data)
    if (data.display) {
      $("#display").html(data.display);
      $("#display").show();
    }
    if (data.isHost) {
      $("#btnname").html(data.buttonCallToActionTextHost)
      $("#callToAction").attr('href', data.buttonCallToActionHost)
    } else {
      $("#btnname").html(data.buttonCallToActionTextGuest)
      $("#callToAction").attr('href', data.buttonCallToActionGuest)
    }
    if (data.buttonCallToActionGuest || data.buttonCallToActionHost) {
      $("#callToAction").show();
    }
  }
})