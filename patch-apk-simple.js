const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const OLD_URL = 'http://city-arab.anansigame.org:8080/';
const LIBS = ['lib/armeabi/libcity_ar.so', 'lib/armeabi-v7a/libcity_ar.so', 'lib/arm64-v8a/libcity_ar.so'];

if (args.length < 1) {
  console.log('الاستخدام: node patch-apk-simple.js <input.apk> [new-url]');
  console.log('مثال:    node patch-apk-simple.js wogad.apk http://192.168.1.152:8080/');
  process.exit(1);
}

const APK_PATH = args[0];
const NEW_URL = args[1] || 'http://192.168.1.152:8080/';

if (!fs.existsSync(APK_PATH)) {
  console.error(`الملف غير موجود: ${APK_PATH}`);
  process.exit(1);
}

if (NEW_URL.length > OLD_URL.length) {
  console.error(`الرابط الجديد أطول من القديم (${NEW_URL.length} > ${OLD_URL.length})`);
  console.error(`استخدم رابط أقصر (مثلاً: http://IP:8080/ بدون www)`);
  process.exit(1);
}

console.log(`📦 فتح APK: ${APK_PATH}`);
const zip = new AdmZip(APK_PATH);
let patched = 0;

for (const libPath of LIBS) {
  const entry = zip.getEntry(libPath);
  if (!entry) { console.log(`  ⏭️  ${libPath} — غير موجود`); continue; }

  const data = entry.getData();
  const text = data.toString('latin1');
  const idx = text.indexOf(OLD_URL);

  if (idx === -1) { console.log(`  ⚠️  ${libPath} — الرابط غير موجود`); continue; }

  console.log(`  🔍 ${libPath}: الرابط موجود @ offset ${idx}`);
  const oldBuf = Buffer.from(OLD_URL, 'latin1');
  const newBuf = Buffer.alloc(oldBuf.length, 0);
  Buffer.from(NEW_URL, 'latin1').copy(newBuf, 0);
  newBuf.copy(data, idx, 0, newBuf.length);
  zip.addFile(libPath, data);
  console.log(`  ✅ ${libPath} — تم التعديل`);
  patched++;
}

if (patched === 0) {
  console.error('❌ لم يتم تعديل أي ملف. الرابط القديم غير موجود.');
  process.exit(1);
}

const outputPath = APK_PATH.replace('.apk', '-patched.apk');
zip.writeZip(outputPath);
console.log(`\n✅ تم إنشاء APK معدّل: ${outputPath}`);
console.log(`🌐 الرابط الجديد: ${NEW_URL}`);
console.log(`\n📱 انسخ الملف للجوال وثبته.`);
console.log(`⚠️  قد تحتاج لتوقيع APK إذا الجهاز يمنع التثبيت.`);
console.log(`   استخدم: https://apkpure.com/apk-signer`);
