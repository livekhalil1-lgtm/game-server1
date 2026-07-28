const LOTR_KEY = "One ring to rule them all, one ring to find them, one ring to bring them all and in the darkness bind them.";

function xorEncode(data) {
  const key = Buffer.from(LOTR_KEY);
  const buf = Buffer.from(data, 'utf8');
  const result = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    result[i] = buf[i] ^ key[i % key.length];
  }
  return result;
}

function xorDecode(data) {
  const key = Buffer.from(LOTR_KEY);
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const result = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    result[i] = buf[i] ^ key[i % key.length];
  }
  return result.toString('utf8');
}

function base64Encode(buf) {
  return buf.toString('base64');
}

function base64Decode(str) {
  return Buffer.from(str, 'base64');
}

function wrapRequest(plainJson) {
  const xorBuf = xorEncode(JSON.stringify(plainJson));
  return base64Encode(xorBuf);
}

function unwrapRequest(base64Str) {
  const xorBuf = base64Decode(base64Str);
  const jsonStr = xorDecode(xorBuf);
  return JSON.parse(jsonStr);
}

function wrapResponse(plainJson) {
  const xorBuf = xorEncode(JSON.stringify(plainJson));
  return base64Encode(xorBuf);
}

function unwrapResponse(base64Str) {
  return unwrapRequest(base64Str);
}

function buildClientPacket(command, header) {
  return { command: command || {}, header: header || {} };
}

function parseClientPacket(body) {
  if (!body || typeof body !== 'object') return body;
  if (body.command || body.header) return body;
  return body;
}

module.exports = { xorEncode, xorDecode, base64Encode, base64Decode, wrapRequest, unwrapRequest, wrapResponse, unwrapResponse, buildClientPacket, parseClientPacket, LOTR_KEY };
