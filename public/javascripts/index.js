$(document).ready(function () {
  var ls = localStorage.getItem('whenHangUp')
  console.log(ls)
  if (ls) {
    var data = JSON.parse(ls)
    console.log(data)
    if (data.isHost) {
      $("#display").html(data.hangupDisplayTextHost);
      $("#btnname").html(data.hangupCallToActionButtonHost)
      $("#callToAction").attr('href', data.hangupForceForwardHost)
    } else {
      $("#display").html(data.hangupDisplayTextGuest);
      $("#btnname").html(data.hangupCallToActionButtonGuest)
      $("#callToAction").attr('href', data.hangupForceForwardGuest)
    }
  }
})