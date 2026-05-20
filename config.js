require('dotenv').config();

module.exports = {
  cameraIp:   process.env.CAMERA_IP   || '192.168.1.150',
  cameraUser: process.env.CAMERA_USER || 'admin',
  cameraPass: process.env.CAMERA_PASS || 'admin',
  port:       parseInt(process.env.PORT || '8000', 10),
  tunnel:     process.env.TUNNEL     || '',
  authUser:   process.env.AUTH_USER  || '',
  authPass:   process.env.AUTH_PASS  || '',
};
