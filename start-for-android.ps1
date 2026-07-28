# سكريبت تشغيل سيرفر اللعبة للاندرويد
# وكــــر الأوغـــاد - Wild City Mafia Private Server

$ErrorActionPreference = "Stop"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$hostName = hostname
Write-Host "==============================" -ForegroundColor DarkYellow
Write-Host "  وكــــر الأوغـــاد" -ForegroundColor Yellow
Write-Host "  تشغيل للسيرفر المحلي" -ForegroundColor Yellow
Write-Host "==============================" -ForegroundColor DarkYellow
Write-Host ""

# Get local IP
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "127.0.0.1" }
Write-Host "[✓] IP المحلي: $ip" -ForegroundColor Green
Write-Host ""

# Kill old server if running
$oldPid = netstat -ano | Select-String ":8080.*LISTENING" | ForEach-Object { $_ -split '\s+' | Select-Object -Last 1 }
if ($oldPid) { taskkill /F /PID $oldPid 2>$null; Write-Host "[*] تم إيقاف السيرفر القديم" }

# Start game server
$gameJob = Start-Job -ScriptBlock {
    param($p, $d) Set-Location $d; node server.js
} -ArgumentList $ip, $scriptPath

Write-Host "[*] جاري تشغيل سيرفر اللعبة..."
Start-Sleep -Seconds 3

# Check if server is running
$check = netstat -ano | Select-String ":8080.*LISTENING"
if (-not $check) {
    Write-Host "[✗] فشل تشغيل السيرفر!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==============================" -ForegroundColor Green
Write-Host "  ✅ السيرفر شغال!" -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Green
Write-Host ""
Write-Host "  🖥️  للعب من المتصفح:" -ForegroundColor Cyan
Write-Host "     http://$ip`:8080" -ForegroundColor White
Write-Host ""
Write-Host "  📱 للعب من الأندرويد:" -ForegroundColor Cyan
Write-Host "     الطريقة 1: ثبت APK المعدل وعدل الرابط إلى:" -ForegroundColor White
Write-Host "     http://$ip`:8080/" -ForegroundColor Yellow
Write-Host ""
Write-Host "     الطريقة 2: استخدم DNS redirect (بدون تعديل APK):" -ForegroundColor White
Write-Host "     شغّل PowerShell كـ Administrator:" -ForegroundColor White
Write-Host "     node dns-redirect.js $ip" -ForegroundColor Yellow
Write-Host "     وغير DNS الجوال إلى: $ip" -ForegroundColor White
Write-Host ""
Write-Host "  🔍 Sniffer Mode (للتحليل):" -ForegroundColor Cyan
Write-Host "     .\start-sniffer.ps1" -ForegroundColor Yellow
Write-Host "     يسجل جميع الطلبات ويكشف الـ endpoints" -ForegroundColor White
Write-Host ""
Write-Host "  ⚡ لتعديل APK:" -ForegroundColor Cyan
Write-Host "     node patch-apk.js http://$ip`:8080/" -ForegroundColor Yellow
Write-Host ""
Write-Host "  📊 Dashboard:" -ForegroundColor Cyan
Write-Host "     http://$ip`:8080/health" -ForegroundColor White
Write-Host "     http://$ip`:8080/api/players" -ForegroundColor White
Write-Host ""
Write-Host "  للخروج: اضغط Ctrl+C" -ForegroundColor Red
Write-Host "==============================" -ForegroundColor DarkYellow

# Wait for Ctrl+C
while ($true) {
    Start-Sleep -Seconds 10
    # Check if server is still alive
    $check2 = netstat -ano | Select-String ":8080.*LISTENING"
    if (-not $check2) {
        Write-Host "[✗] السيرفر توقف!" -ForegroundColor Red
        break
    }
    # Show periodic status
    try {
        $h = (Invoke-WebRequest "http://127.0.0.1:8080/health" -UseBasicParsing).Content | ConvertFrom-Json
        Write-Host "[$(Get-Date -Format HH:mm:ss)] 🟢 لاعبين: $($h.players) | اشتغال: $([math]::Round($h.uptime))ث" -ForegroundColor DarkGray
    } catch {}
}
