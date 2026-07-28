// APK Patcher - تغيير رابط السيرفر في اللعبة الأصلية
// استعمال: node patch-apk.js <input.apk> <new-url> [output.apk]
// مثال: node patch-apk.js city_ar.apk "http://wogad-server.up.railway.app/"

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OLD_URL = 'http://city-arab.anansigame.org:8080/';
const LIBS = [
  'lib/armeabi/libcity_ar.so',
  'lib/armeabi-v7a/libcity_ar.so',
  'lib/arm64-v8a/libcity_ar.so',
];

async function patchApk(inputApk, newUrl, outputApk) {
  console.log(`🔧 APK Patcher - وكّر الأوغاد`);
  console.log(`📥 المدخل: ${inputApk}`);
  console.log(`🌐 الرابط الجديد: ${newUrl}`);
  console.log(`📤 المخرج: ${outputApk || inputApk.replace('.apk', '-patched.apk')}`);
  
  if (!outputApk) outputApk = inputApk.replace('.apk', '-patched.apk');
  
  // Check tools
  const hasApktool = execSync('where apktool 2>nul || echo no').toString().trim() !== 'no';
  const hasJava = execSync('where java 2>nul || echo no').toString().trim() !== 'no';
  
  if (!hasApktool) {
    console.log('❌ apktool غير موجود. حمله من: https://ibotpeaches.github.io/Apktool/');
    console.log('   أو تابع الخطوات اليدوية أدناه.');
    return manualInstructions(newUrl, inputApk);
  }
  
  const tmpDir = path.join(__dirname, 'tmp_apk_' + Date.now());
  
  try {
    // 1. فك APK
    console.log('\n1️⃣  فك APK...');
    execSync(`apktool d "${inputApk}" -o "${tmpDir}" -f`, { stdio: 'pipe' });
    
    // 2. تعديل الـ .so files
    console.log('2️⃣  تعديل ملفات .so...');
    let patched = 0;
    for (const lib of LIBS) {
      const libPath = path.join(tmpDir, lib);
      if (!fs.existsSync(libPath)) {
        console.log(`   ⏭️  ${lib} — غير موجود`);
        continue;
      }
      const bytes = fs.readFileSync(libPath);
      const text = bytes.toString('binary');
      const idx = text.indexOf(OLD_URL);
      if (idx === -1) {
        console.log(`   ⚠️  ${lib} — الرابط القديم غير موجود`);
        continue;
      }
      
      // Replace the URL
      const newBytes = Buffer.from(bytes);
      const newUrlBuf = Buffer.from(newUrl);
      if (newUrlBuf.length > OLD_URL.length) {
        console.log(`   ❌ الرابط الجديد أطول من القديم (${newUrlBuf.length} > ${OLD_URL.length})`);
        console.log(`      استخدم رابط أقصر من 37 حرف`);
        continue;
      }
      
      newUrlBuf.copy(newBytes, idx);
      // Pad remaining with nulls
      for (let i = idx + newUrlBuf.length; i < idx + OLD_URL.length; i++) {
        newBytes[i] = 0;
      }
      
      fs.writeFileSync(libPath, newBytes);
      console.log(`   ✅ ${lib} — تم التعديل`);
      patched++;
    }
    
    if (patched === 0) {
      console.log('❌ لم يتم تعديل أي ملف .so. الرابط القديم غير موجود.');
      cleanup(tmpDir);
      return;
    }
    
    // 3. إعادة بناء APK
    console.log('3️⃣  إعادة بناء APK...');
    execSync(`apktool b "${tmpDir}" -o "${outputApk}"`, { stdio: 'pipe' });
    
    // 4. توقيع APK
    console.log('4️⃣  توقيع APK...');
    if (hasJava) {
      const keystore = path.join(__dirname, 'debug.keystore');
      if (!fs.existsSync(keystore)) {
        // Create debug keystore
        execSync(
          `keytool -genkey -v -keystore "${keystore}" -alias debug -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Debug, OU=Debug, O=Debug, L=Debug, S=Debug, C=US"`,
          { stdio: 'pipe' }
        );
      }
      execSync(
        `jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore "${keystore}" -storepass android -keypass android "${outputApk}" debug`,
        { stdio: 'pipe' }
      );
    } else {
      // Try uber-apk-signer
      if (fs.existsSync('uber-apk-signer.jar')) {
        execSync(`java -jar uber-apk-signer.jar --apks "${outputApk}"`, { stdio: 'pipe' });
      } else {
        console.log('⚠️  ما في Java. APK غير موقع. استخدم هذا الموقع لتوقيعه:');
        console.log('   https://apkpure.com/apk-signer');
      }
    }
    
    console.log(`\n✅ تم بنجاح!`);
    console.log(`📱 ملف APK: ${outputApk}`);
    console.log(`🌐 السيرفر الجديد: ${newUrl}`);
    
    cleanup(tmpDir);
    
  } catch (e) {
    console.error('❌ خطأ:', e.message);
    cleanup(tmpDir);
  }
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e) {}
}

function manualInstructions(newUrl, inputApk) {
  console.log('\n📋 ** الطريقة اليدوية **');
  console.log('1. نزّل apktool من https://ibotpeaches.github.io/Apktool/install/');
  console.log('2. فك APK:');
  console.log(`   apktool d "${inputApk}" -o city_ar_decoded -f`);
  console.log('3. افتح ملفات .so بمحرر hex (مثل HxD) وابحث عن:');
  console.log(`   ${OLD_URL}`);
  console.log(`   واستبدله بـ: ${newUrl}`);
  console.log('   الملفات:');
  LIBS.forEach(l => console.log(`   - ${l}`));
  console.log('4. أعد بناء APK:');
  console.log(`   apktool b city_ar_decoded -o city_ar_patched.apk`);
  console.log('5. وقّع APK:');
  console.log('   https://apkpure.com/apk-signer');
  console.log('6. نزّل APK على جوالك وشغّله');
}

const inputApk = process.argv[2];
const newUrl = process.argv[3] || 'http://192.168.1.152:8080/';

if (!inputApk) {
  console.log('الاستعمال: node patch-apk.js <input.apk> [new-url]');
  console.log('مثال: node patch-apk.js city_ar.apk "http://192.168.1.152:8080/"');
  console.log('\nإذا ما عندك apktool، اتبع التعليمات اليدوية بالأسفل\n');
  manualInstructions(newUrl, 'input.apk');
  process.exit(1);
}

patchApk(inputApk, newUrl);
