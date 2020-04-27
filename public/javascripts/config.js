export const CONFIG = {
  SIGNALING_SERVER: "https://call.bemycall.com/",
  ICE_SERVERS: [
    { urls: ["stun:ws-turn2.xirsys.com"] },
    {
      username: "FtejCUFBllhaRc2b8yFrgYZXcKZQKJOmcRWBIXeWy-CUl2DIlvY7QjUgDGh_PLsTAAAAAF6j9W9iZW15Y2FsbA==",
      credential: "31b7f840-86cf-11ea-8f0f-a695319b0c25",
      urls: [
        "turn:ws-turn2.xirsys.com:80?transport=udp",
        "turn:ws-turn2.xirsys.com:3478?transport=udp",
        "turn:ws-turn2.xirsys.com:80?transport=tcp",
        "turn:ws-turn2.xirsys.com:3478?transport=tcp",
        "turns:ws-turn2.xirsys.com:443?transport=tcp",
        "turns:ws-turn2.xirsys.com:5349?transport=tcp"
      ]
    }
  ],
  displayMediaOptions: {  // For ScreenShare
    video: {
      cursor: "always"
    },
    audio: false
  },
  MUTE_AUDIO_BY_DEFAULT: false,
}