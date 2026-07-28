@echo off
title وكــــر الأوغـــاد - Sniffer Mode
color 0B

echo.
echo   ╔═══════════════════════════════════════════╗
echo   ║    وكــــر الأوغـــاد - Sniffer Mode      ║
echo   ║    تسجيل وتحليل جميع طلبات اللعبة         ║
echo   ╚═══════════════════════════════════════════╝
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [خطأ] Node.js غير مثبت!
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [*] جاري تثبيت المكتبات...
    call npm install
)

echo [*] جاري تشغيل Sniffer...
echo.
echo   الحالة:   http://127.0.0.1:8080/sniffer/status
echo   السجل:    captured_requests.log
echo   التفاصيل: captured_details.log
echo   العينات:  samples/
echo.
echo   للخروج:   Ctrl+C
echo.

node sniffer.js
pause
