const dns = require('dns');
const udp = require('dgram');

const TARGET = 'city-arab.anansigame.org';
const REDIRECT_IP = '192.168.1.152';
const PORT = 53;

const server = udp.createSocket('udp4');

server.on('message', (msg, rinfo) => {
  // Parse DNS query - simple A record response
  const id = msg.slice(0, 2);
  const flags = msg.slice(2, 4);
  const qdcount = msg.readUInt16BE(4);
  const questions = msg.slice(12);

  // Find the question name
  let pos = 12;
  let nameParts = [];
  while (msg[pos] !== 0) {
    const len = msg[pos];
    nameParts.push(msg.slice(pos + 1, pos + 1 + len).toString());
    pos += len + 1;
  }
  pos += 1; // null terminator
  const qname = nameParts.join('.');
  const qtype = msg.readUInt16BE(pos);
  pos += 2;
  const qclass = msg.readUInt16BE(pos);

  if (qname === TARGET && qtype === 1) { // A record
    const resp = Buffer.alloc(512);
    let offset = 0;
    // Transaction ID
    msg.copy(resp, 0, 0, 2);
    offset += 2;
    // Flags: response, authoritative, no error
    resp[offset++] = 0x85;
    resp[offset++] = 0x80;
    // Question count: 1
    resp[offset++] = 0x00;
    resp[offset++] = 0x01;
    // Answer count: 1
    resp[offset++] = 0x00;
    resp[offset++] = 0x01;
    // Authority & Additional: 0
    resp[offset++] = 0x00;
    resp[offset++] = 0x00;
    resp[offset++] = 0x00;
    resp[offset++] = 0x00;
    // Copy original question
    const qlen = pos + 4 - 12;
    msg.copy(resp, offset, 12, pos + 4);
    offset += qlen;
    // Answer: name pointer 0xc00c
    resp[offset++] = 0xc0;
    resp[offset++] = 0x0c;
    // Type: A (1)
    resp[offset++] = 0x00;
    resp[offset++] = 0x01;
    // Class: IN (1)
    resp[offset++] = 0x00;
    resp[offset++] = 0x01;
    // TTL: 60 seconds
    resp[offset++] = 0x00;
    resp[offset++] = 0x00;
    resp[offset++] = 0x00;
    resp[offset++] = 0x3c;
    // Data length: 4 bytes (IPv4)
    resp[offset++] = 0x00;
    resp[offset++] = 0x04;
    // IP
    const parts = REDIRECT_IP.split('.');
    parts.forEach(p => resp[offset++] = parseInt(p));

    server.send(resp.slice(0, offset), rinfo.port, rinfo.address);
    console.log(`[DNS] ${qname} -> ${REDIRECT_IP}`);
  } else if (qname.includes('anansigame.org') || qname.includes('anansi')) {
    // Also redirect anansigame.org subdomains
    const resp = Buffer.alloc(512);
    let offset = 0;
    msg.copy(resp, 0, 0, 2);
    offset += 2;
    resp[offset++] = 0x85;
    resp[offset++] = 0x80;
    resp[offset++] = 0x00;
    resp[offset++] = 0x01;
    resp[offset++] = 0x00;
    resp[offset++] = 0x01;
    resp[offset++] = 0x00;
    resp[offset++] = 0x00;
    resp[offset++] = 0x00;
    resp[offset++] = 0x00;
    const qlen = pos + 4 - 12;
    msg.copy(resp, offset, 12, pos + 4);
    offset += qlen;
    resp[offset++] = 0xc0;
    resp[offset++] = 0x0c;
    resp[offset++] = 0x00;
    resp[offset++] = 0x01;
    resp[offset++] = 0x00;
    resp[offset++] = 0x01;
    resp[offset++] = 0x00;
    resp[offset++] = 0x00;
    resp[offset++] = 0x00;
    resp[offset++] = 0x3c;
    resp[offset++] = 0x00;
    resp[offset++] = 0x04;
    const parts = REDIRECT_IP.split('.');
    parts.forEach(p => resp[offset++] = parseInt(p));
    server.send(resp.slice(0, offset), rinfo.port, rinfo.address);
    console.log(`[DNS] ${qname} -> ${REDIRECT_IP}`);
  } else {
    // Forward to real DNS
    const realDns = Buffer.from([8,8,8,8]);
    server.send(msg, 53, realDns, (err) => {
      if (err) console.log('[DNS] Forward error:', err);
    });
  }
});

server.on('listening', () => {
  const addr = server.address();
  console.log(`[DNS] Server running on ${addr.address}:${addr.port}`);
  console.log(`[DNS] ${TARGET} -> ${REDIRECT_IP}`);
  console.log('[DNS] Set phone WiFi DNS to', REDIRECT_IP);
});

server.bind(PORT);
