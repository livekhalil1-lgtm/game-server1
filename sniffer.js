const express = require('express');
const fs = require('fs');
const path = require('path');
const { xorEncode, xorDecode, base64Encode, base64Decode } = require('./protocol');

const app = express();
const PORT = 8080;
const LOG_FILE = path.join(__dirname, 'captured_requests.log');
const DETAIL_LOG = path.join(__dirname, 'captured_details.log');

// Track all endpoints discovered
const discoveredEndpoints = new Set();
const endpointCounter = {};

// Clear logs on start
fs.writeFileSync(LOG_FILE, `=== Sniffer started ${new Date().toISOString()} ===\n`);
fs.writeFileSync(DETAIL_LOG, `=== Sniffer started ${new Date().toISOString()} ===\n`);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function logDetail(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(DETAIL_LOG, line + '\n');
}

// Catch ALL requests - no body parsers, we want raw data
app.use((req, res, next) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks);

    const path = req.path;
    const method = req.method;
    const ua = req.get('User-Agent') || 'none';
    const ct = req.get('Content-Type') || 'none';
    const cl = req.get('Content-Length') || '0';
    const rawHex = req.rawBody.length > 0 ? req.rawBody.slice(0, 100).toString('hex') : '(empty)';
    const rawAscii = req.rawBody.length > 0 ? req.rawBody.slice(0, 200).toString('ascii').replace(/[^\x20-\x7E]/g, '.') : '(empty)';

    // Track endpoint
    discoveredEndpoints.add(path);
    endpointCounter[path] = (endpointCounter[path] || 0) + 1;

    log(`[${method}] ${path} | UA: ${ua.slice(0,60)} | CT: ${ct} | Size: ${req.rawBody.length}`);
    logDetail(`\n=== ${method} ${path} ===`);
    logDetail(`Headers: UA=${ua} CT=${ct} CL=${cl}`);
    logDetail(`Raw Hex (first 100): ${rawHex}`);
    logDetail(`Raw ASCII (first 200): ${rawAscii}`);

    // Try to decode as XOR + Base64 (Android format)
    if (req.rawBody.length > 0) {
      // Method 1: Try as Base64 string (text/plain)
      try {
        const bodyStr = req.rawBody.toString('utf8').trim();
        const b64decoded = base64Decode(bodyStr);
        const xored = xorDecode(Buffer.from(b64decoded, 'binary'));
        const json = JSON.parse(xored);
        logDetail(`[DECODE:B64+XOR] Success! Keys: ${Object.keys(json).join(', ')}`);
        logDetail(`[DECODE:B64+XOR] Body: ${JSON.stringify(json).slice(0, 500)}`);
        req.decodedBody = json;
        req.useXor = true;
        req.useBase64 = true;
      } catch(e1) {
        // Method 2: Try as raw XOR bytes (application/octet-stream)
        try {
          const xored = xorDecode(req.rawBody);
          const json = JSON.parse(xored);
          logDetail(`[DECODE:RAW_XOR] Success! Keys: ${Object.keys(json).join(', ')}`);
          logDetail(`[DECODE:RAW_XOR] Body: ${JSON.stringify(json).slice(0, 500)}`);
          req.decodedBody = json;
          req.useXor = true;
        } catch(e2) {
          // Method 3: Try as plain JSON
          try {
            const json = JSON.parse(req.rawBody.toString('utf8'));
            logDetail(`[DECODE:JSON] Success! Keys: ${Object.keys(json).join(', ')}`);
            logDetail(`[DECODE:JSON] Body: ${JSON.stringify(json).slice(0, 500)}`);
            req.decodedBody = json;
          } catch(e3) {
            logDetail(`[DECODE:FAIL] Could not decode as B64+XOR, RAW XOR, or JSON`);
          }
        }
      }
    }

    // Save a sample of the first request for each endpoint
    const sampleFile = path.join(__dirname, 'samples', `${method}_${path.replace(/\//g, '_')}.bin`);
    if (!fs.existsSync(sampleFile)) {
      try {
        fs.mkdirSync(path.join(__dirname, 'samples'), { recursive: true });
        fs.writeFileSync(sampleFile, req.rawBody);
        logDetail(`[SAMPLE] Saved to samples/${method}_${path.replace(/\//g, '_')}.bin`);
      } catch(e) {}
    }

    next();
  });
});

// Root endpoint
app.post('*', (req, res) => {
  // Return generic success response so game doesn't crash
  const fakePlayer = {
    id: 999,
    name: 'Sniffer',
    level: 1,
    money: 1000,
    gold: 0,
    experience: 0,
    health: 100,
    maxHealth: 100,
    energy: 100,
    nerve: 100,
    strength: 10,
    defense: 10,
    nimble: 10,
    speed: 10,
    endurance: 10,
    city: 1,
    sessionToken: 'sniffer_tok'
  };

  const response = {
    code: 1,
    msg: 'ok',
    player: fakePlayer,
    sessionToken: 'sniffer_tok',
    session_token: 'sniffer_tok'
  };

  // Try to respond in same format as request
  if (req.useXor && req.useBase64) {
    res.type('text/plain');
    res.send(base64Encode(xorEncode(JSON.stringify(response))));
  } else if (req.useXor) {
    res.type('application/octet-stream');
    res.send(xorEncode(JSON.stringify(response)));
  } else {
    res.json(response);
  }
});

// GET endpoints
app.get('*', (req, res) => {
  log(`[GET] ${req.path} | Query: ${JSON.stringify(req.query)}`);
  res.json({ status: 'sniffer_running', endpoints: [...discoveredEndpoints].sort() });
});

// Status endpoint
app.get('/sniffer/status', (req, res) => {
  const sorted = [...discoveredEndpoints].sort();
  res.json({
    running: true,
    uptime: process.uptime(),
    endpoints_discovered: sorted.length,
    endpoints: sorted,
    counts: endpointCounter,
    log_file: LOG_FILE,
    sample_dir: path.join(__dirname, 'samples')
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n===========================================`);
  console.log(`🔍 REQUEST SNIFFER FOR ANDROID GAME`);
  console.log(`===========================================`);
  console.log(`Server: http://0.0.0.0:${PORT}`);
  console.log(`Status: http://localhost:${PORT}/sniffer/status`);
  console.log(`Log: ${LOG_FILE}`);
  console.log(`Samples: ${path.join(__dirname, 'samples')}/`);
  console.log(``);
  console.log(`📱 Connect your Android device:`);
  console.log(`   1. Set DNS to this PC's IP`);
  console.log(`   2. OR patch APK to point to http://YOUR_IP:${PORT}/`);
  console.log(`   3. Play the game`);
  console.log(`   4. Check the log for captured requests`);
  console.log(`===========================================\n`);
});
