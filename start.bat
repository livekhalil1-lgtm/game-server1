@echo off
title وكــــر الأوغـــاد - سيرفر اللعبة
color 0A

echo.
echo   ╔═══════════════════════════════════════════╗
echo   ║        وكــــر الأوغـــاد - Wild City      ║
echo   ║        خادم اللعبة الخاص                   ║
echo   ╚═══════════════════════════════════════════╝
echo.

REM Check if node is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [خطأ] Node.js غير مثبت! الرجاء تثبيت Node.js من
    echo        https://nodejs.org
    pause
    exit /b 1
)

echo [✓] Node.js مثبت: 
node --version

REM Install dependencies if needed
if not exist "node_modules" (
    echo [*] جاري تثبيت المكتبات...
    npm install
)

echo [*] جاري تشغيل الخادم...
echo.
echo   الرابط:   http://127.0.0.1:8080
echo   للخروج:   Ctrl+C
echo.
echo   وضع التحليل (Sniffer):
echo     استخدم start-sniffer.bat لتسجيل جميع الطلبات
echo.
echo   لاتصال APK المعدل:
echo     1- غير الـ DNS في الموبايل إلى IP جهازك
echo     2- أو استخدم patched APK
echo.

node server.js

pause
