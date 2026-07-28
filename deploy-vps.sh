#!/bin/bash
# ============================================================
# سكريبت نشر السيرفر على VPS (Ubuntu/Debian)
# وكــــر الأوغـــاد - Wild City Mafia Private Server
# ============================================================
set -e

echo "============================================"
echo "  نصب خادم وكــــر الأوغـــاد"
echo "============================================"

# 1. تحديث الحزم
echo "[1/6] تحديث الحزم..."
apt update -y && apt upgrade -y

# 2. نصب Node.js 18+
echo "[2/6] نصب Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
fi
echo "Node.js: $(node --version)"

# 3. نصب Unzip (لفك APK)
echo "[3/6] نصب أدوات إضافية..."
apt install -y unzip wget curl ufw

# 4. فتح المنفذ
echo "[4/6] فتح المنفذ 8080..."
ufw allow 8080/tcp
ufw reload

# 5. نصب PM2 (مدير عمليات)
echo "[5/6] نصب PM2..."
npm install -g pm2

# 6. تحميل وتشغيل السيرفر
echo "[6/6] تجهيز السيرفر..."
cd /opt
mkdir -p wogad-server
cd wogad-server

# نسخ ملفات السيرفر هنا:
# استخدم SCP أو Git لنسخ الملفات
echo ""
echo "============================================"
echo "  هام: انسخ ملفات السيرفر إلى"
echo "  /opt/wogad-server/"
echo ""
echo "  ثم شغّل:"
echo "    cd /opt/wogad-server"
echo "    npm install"
echo "    pm2 start server.js --name wogad"
echo "    pm2 save"
echo "============================================"

# تشغيل تلقائي بعد إعادة التشغيل
pm2 startup systemd

echo ""
echo "✓ تم تجهيز الخادم!"
echo "  الرابط: http://YOUR_VPS_IP:8080"
echo ""
echo "  لتعديل APK:"
echo "    game-server/patch-apk.js"
echo "    غير الرابط إلى http://YOUR_VPS_IP:8080"
echo ""
echo "  لمشاهدة اللوج:"
echo "    pm2 logs wogad"
echo "============================================"
