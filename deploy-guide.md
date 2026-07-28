# دليل نشر خادم وكـر الأوغـاد

## المشكلة: CURL بدون SSL
الـ APK الأصلي يستخدم **CURL 7.39.0 بدون SSL**. هذا يعني أن اللعبة لا تدعم HTTPS نهائياً.
الحل: تشغيل السيرفر على **HTTP فقط** (منفذ 8080).

---

## 🖥️ الخيار 1: تشغيل محلي (للاختبار)
```bash
# وندوز
start.bat

# لينكس/ماك
node server.js
```
- الرابط: `http://127.0.0.1:8080`
- الواجهة: افتح الرابط في المتصفح
- للموبايل: شغّل على نفس WiFi واستخدم `http://192.168.x.x:8080`

---

## ☁️ الخيار 2: VPS (للنشر الحقيقي)

### مزودين رخيصين يدعمون HTTP:
| المزود | السعر | الرابط |
|--------|-------|--------|
| RackNerd | $1.50/شهر | https://my.racknerd.com |
| Oracle Cloud | مجاناً للأبد | https://www.oracle.com/cloud/free/ |
| Hetzner | €3.29/شهر | https://www.hetzner.com |
| Hostinger | $2.99/شهر | https://www.hostinger.com |

### خطوات النشر السريع:
```bash
ssh root@YOUR_VPS_IP

# تحميل السكريبت (أو استخدم deploy-vps.sh)
apt update && apt install -y nodejs npm ufw
ufw allow 8080/tcp

# انسخ ملفات السيرفر إلى VPS (من جهازك)
scp -r game-server/* root@YOUR_VPS_IP:/opt/wogad/

# على الـ VPS
cd /opt/wogad
npm install
node server.js
```

### تشغيل دائم مع PM2:
```bash
npm install -g pm2
pm2 start server.js --name wogad
pm2 save
pm2 startup systemd
```

---

## 📱 الخيار 3: Cloudflare Tunnel (مجاني)
إذا كان مزود الخدمة يمنع HTTP:
```bash
# نصب cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64

# تشغيل Tunnel (بدون SSL!)
./cloudflared tunnel --url http://127.0.0.1:8080
```
رابط HTTP مجاني من Cloudflare. ضعه في APK.

---

## 📱 ربط APK مع السيرفر

### للعب المحلي:
```
http://192.168.1.xxx:8080/
```
غير `xxx` مع IP جهازك (استخدم `ipconfig` في وندوز أو `ifconfig` في لينكس).

### للعب عبر VPS:
```
http://YOUR_VPS_IP:8080/
```

### تعديل APK:
```bash
node patch-apk.js YOUR_SERVER_URL
```
أو استخدم `patch-apk-simple.js` لنسخة أسهل.

---

## 🏠 DNS محلي (بدون تعديل APK)
إذا تبي تلعب بدون تعديل APK:
```bash
# شغّل DNS redirect
node dns-redirect.js
```
غير DNS الموبايل إلى IP جهازك، واللعبة تتصل بسيرفرك المحلي مباشرة.

---

## 🔥 جدار الحماية
افتح المنفذ 8080:
```bash
# Ubuntu
ufw allow 8080/tcp

# CentOS
firewall-cmd --add-port=8080/tcp --permanent
firewall-cmd --reload

# Windows
New-NetFirewallRule -Name "Wogad8080" -DisplayName "Wogad 8080" -Protocol TCP -LocalPort 8080 -Action Allow
```

---

## 🛡️ nginx (للمستخدمين المتقدمين)
إذا كان عندك دومين وتحتاج SSL للمتصفح (الـ APK ما يحتاج SSL):
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

---

## ✅ التحقق من السيرفر
```bash
curl http://127.0.0.1:8080/health
# → {"status":"ok","players":X,"uptime":Y}
```

---

## ⚡ الأداء
- SQLite يتحمل 50-100 لاعب متزامن
- Player cache يقلل ضغط قاعدة البيانات
- Auto-persist كل 5 ثواني
- PM2 يعيد التشغيل تلقائياً عند crash
