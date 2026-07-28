# دليل النشر السحابي - وكّر الأوغاد

## الطريقة 1: Railway.app (أسهل — مجاني)

1. ادخل على https://railway.app/new
2. اختار **Deploy from GitHub repo**
3. اربط حساب GitHub حقك
4. اختار المشروع (رفع مجلد `game-server` كامل)
5. Railway يكتشف `package.json` أوتوماتيك
6. إعدادات المشروع:
   - **Start Command**: `node server-cloud.js`
   - **Port**: `8080`
7. بعد النشر، راح يظهر رابط مثل: `https://wogad-server.up.railway.app`

## الطريقة 2: Render.com

1. ادخل https://render.com
2. New Web Service → Connect GitHub
3. اختار repo
4. الإعدادات:
   - **Name**: `wogad-server`
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server-cloud.js`
5. Advanced → Add Environment Variable:
   - `PORT`: `8080`
6. Create Web Service

## بعد النشر

### تعديل APK (عشان الجوال يتصل بالسيرفر)

#### الطريقة الأوتوماتيكية (إذا عندك apktool):
```bash
node patch-apk.js city_ar.apk "http://your-server-url:8080/"
```

#### الطريقة اليدوية (بدون apktool):
1. افتح ملف `libcity_ar.so` بمحرر Hex مثل HxD
2. ابحث عن: `http://city-arab.anansigame.org:8080/`
3. استبدله بـ: `http://your-server-url:8080/`
4. إذا الرابط الجديد أقصر، املأ الفراغ بـ 0x00
5. الملفات المطلوب تعديلها:
   - `lib/armeabi/libcity_ar.so`
   - `lib/armeabi-v7a/libcity_ar.so`
   - `lib/arm64-v8a/libcity_ar.so`
6. أعد تعبئة APK
7. وقّع APK (استخدم https://apkpure.com/apk-signer)
8. نزّل على جوالك وشغّل

### اختبار الاتصال
```bash
# من أي جهاز على النت، اختبر:
curl http://your-server-url:8080/health
# النتيجة: {"status":"ok","db":"firebase","project":"wogad-game"}
```
