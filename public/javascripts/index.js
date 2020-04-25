function go_call(call_type) {
  let type = "v";
  if (call_type == 'audio') {
    type = "a";
  } else if (call_type == 'message') {
    type = "m"
  }
  window.location.href = "/r/" + generate_room_name() + type;
}

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