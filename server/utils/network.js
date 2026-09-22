const os = require('os');

/**
 * Discovers the primary local IPv4 network address (e.g. 192.168.x.x or 10.x.x.x)
 * for LAN access from phones, tablets, or other local devices.
 */
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

module.exports = {
  getLocalNetworkIp
};
