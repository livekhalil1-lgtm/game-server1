const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const APK_PATH = 'C:\\WINDOWS\\TEMP\\opencode\\game.apk';
const PATCHED_APK_PATH = 'C:\\WINDOWS\\TEMP\\opencode\\game-patched.apk';
const OLD_URL = 'http://city-arab.anansigame.org:8080/';
const NEW_URL = 'https://wog.up.railway.app/';
const ENTRY_NAME = 'lib/armeabi/libcity_ar.so';

// Read APK
const zip = new AdmZip(APK_PATH);
const entry = zip.getEntry(ENTRY_NAME);

if (!entry) {
  console.error('ERROR: Could not find ' + ENTRY_NAME + ' in APK');
  process.exit(1);
}

const data = entry.getData();
const text = data.toString('ascii');
const idx = text.indexOf(OLD_URL);

if (idx === -1) {
  console.error('ERROR: Could not find URL "' + OLD_URL + '" in ' + ENTRY_NAME);
  process.exit(1);
}

console.log('Found URL at offset ' + idx);
console.log('Old URL: "' + OLD_URL + '" (' + OLD_URL.length + ' chars)');
console.log('New URL: "' + NEW_URL + '" (' + NEW_URL.length + ' chars)');

// Replace the URL with new URL + null padding
const oldBuf = Buffer.from(OLD_URL, 'ascii');
const newBuf = Buffer.alloc(oldBuf.length, 0); // Fill with nulls
const newUrlBuf = Buffer.from(NEW_URL, 'ascii');
newUrlBuf.copy(newBuf, 0);

// Overwrite in the data buffer
newBuf.copy(data, idx, 0, newBuf.length);

// Replace the ZIP entry
zip.addFile(ENTRY_NAME, data);

// Write patched APK
zip.writeZip(PATCHED_APK_PATH);
console.log('Patched APK written to ' + PATCHED_APK_PATH);

// Verify
const verifyZip = new AdmZip(PATCHED_APK_PATH);
const verifyEntry = verifyZip.getEntry(ENTRY_NAME);
const verifyData = verifyEntry.getData();
const verifyText = verifyData.toString('ascii');
const verifyIdx = verifyText.indexOf(OLD_URL);
const verifyNewIdx = verifyText.indexOf(NEW_URL);

if (verifyNewIdx !== -1) {
  console.log('VERIFY: New URL found at offset ' + verifyNewIdx + ' ✅');
} else {
  console.log('VERIFY: New URL NOT found ❌');
}

if (verifyIdx === -1) {
  console.log('VERIFY: Old URL no longer present ✅');
} else {
  console.log('VERIFY: Old URL still present at offset ' + verifyIdx + ' ❌');
}
