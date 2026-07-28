const dns = require('dns');
const udp = require('dgram');
const os = require('os');

const TARGET = 'city-arab.anansigame.org';
const PORT = 53;

// Auto-detect local IP
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

const REDIRECT_IP = process.argv[2] || getLocalIP();
console.log(`[DNS] Target: ${TARGET}`);
console.log(`[DNS] Redirect to: ${REDIRECT_IP}`);
console.log(`[DNS] Listening on port ${PORT}...`);
console.log(`[DNS] Change phone WiFi DNS to ${REDIRECT_IP}`);
console.log(`[DNS] *** IMPORTANT: Run as Administrator on Windows! ***`);

const server = udp.createSocket('udp4');

function buildAResponse(msg, queryEnd, ip) {
  const resp = Buffer.alloc(512);
  let offset = 0;
  msg.copy(resp, 0, 0, 2); offset += 2; // ID
  resp[offset++] = 0x85; resp[offset++] = 0x80; // Flags
  resp[offset++] = 0x00; resp[offset++] = 0x01; // QDCOUNT
  resp[offset++] = 0x00; resp[offset++] = 0x01; // ANCOUNT
  resp[offset++] = 0x00; resp[offset++] = 0x00; // NSCOUNT
  resp[offset++] = 0x00; resp[offset++] = 0x00; // ARCOUNT
  const qlen = queryEnd + 4 - 12;
  msg.copy(resp, offset, 12, queryEnd + 4); offset += qlen; // Question
  resp[offset++] = 0xC0; resp[offset++] = 0x0C; // Name pointer
  resp[offset++] = 0x00; resp[offset++] = 0x01; // A record
  resp[offset++] = 0x00; resp[offset++] = 0x01; // IN class
  resp[offset++] = 0x00; resp[offset++] = 0x00; resp[offset++] = 0x00; resp[offset++] = 0x3C; // TTL 60
  resp[offset++] = 0x00; resp[offset++] = 0x04; // Data length
  ip.split('.').forEach(n => resp[offset++] = parseInt(n));
  return resp.slice(0, offset);
}

server.on('message', (msg, rinfo) => {
  let pos = 12;
  while (msg[pos] !== 0) pos++; // skip name
  pos += 1; // null terminator
  const qtype = msg.readUInt16BE(pos);
  // Read the domain name
  pos = 12;
  let nameParts = [];
  while (msg[pos] !== 0) { const len = msg[pos]; nameParts.push(msg.slice(pos+1, pos+1+len).toString()); pos += len + 1; }
  pos += 1;
  const qname = nameParts.join('.');

  if ((qname === TARGET || qname.endsWith('.anansigame.org') || qname.includes('anansi')) && qtype === 1) {
    const resp = buildAResponse(msg, pos, REDIRECT_IP);
    server.send(resp, rinfo.port, rinfo.address);
    console.log(`[DNS] ${qname} -> ${REDIRECT_IP}`);
  } else {
    // Forward to real DNS
    const fwdServer = udp.createSocket('udp4');
    fwdServer.on('message', (fwdMsg) => {
      server.send(fwdMsg, rinfo.port, rinfo.address);
      fwdServer.close();
    });
    fwdServer.send(msg, 53, '8.8.8.8');
  }
});

server.on('listening', () => {
  const addr = server.address();
  console.log(`[DNS] Server running on ${addr.address}:${addr.port}`);
  console.log(`[DNS] Set your Android phone WiFi DNS to: ${REDIRECT_IP}`);
  console.log(`[DNS] Then open the game - it will connect to your local server!`);
});

try {
  server.bind(PORT);
} catch (e) {
  console.error(`[DNS] Failed to bind port ${PORT}: ${e.message}`);
  console.error('[DNS] Run as Administrator on Windows!');
  process.exit(1);
}
