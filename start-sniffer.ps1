# سكريبت تشغيل Sniffer للاندرويد - تسجيل وتحليل طلبات اللعبة
# وكــــر الأوغـــاد - Wild City Mafia Private Server

$ErrorActionPreference = "Stop"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==============================" -ForegroundColor DarkYellow
Write-Host "  🔍 Sniffer Mode" -ForegroundColor Yellow
Write-Host "  وكــــر الأوغـــاد" -ForegroundColor Yellow
Write-Host "==============================" -ForegroundColor DarkYellow
Write-Host ""

# Get local IP
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "127.0.0.1" }
Write-Host "[✓] IP المحلي: $ip" -ForegroundColor Green
Write-Host ""

# Kill old server on port 8080 if running
$oldPid = netstat -ano | Select-String ":8080.*LISTENING" | ForEach-Object { $_ -split '\s+' | Select-Object -Last 1 }
if ($oldPid) { taskkill /F /PID $oldPid 2>$null; Write-Host "[*] تم إيقاف السيرفر القديم" }

# Start sniffer
$snifferJob = Start-Job -ScriptBlock {
    param($d) Set-Location $d; node sniffer.js
} -ArgumentList $scriptPath

Write-Host "[*] جاري تشغيل Sniffer..."
Start-Sleep -Seconds 2

# Check if sniffer is running
$check = netstat -ano | Select-String ":8080.*LISTENING"
if (-not $check) {
    Write-Host "[✗] فشل تشغيل Sniffer!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==============================" -ForegroundColor Green
Write-Host "  ✅ Sniffer شغال!" -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Green
Write-Host ""
Write-Host "  🖥️  لعرض الحالة:" -ForegroundColor Cyan
Write-Host "     http://$ip`:8080/sniffer/status" -ForegroundColor White
Write-Host ""
Write-Host "  📱 للعب من الأندرويد مع التسجيل:" -ForegroundColor Cyan
Write-Host "     استخدم DNS redirect أو patched APK" -ForegroundColor White
Write-Host "     http://$ip`:8080/" -ForegroundColor Yellow
Write-Host ""
Write-Host "  📊 الملفات:" -ForegroundColor Cyan
Write-Host "     السجل:      $scriptPath\captured_requests.log" -ForegroundColor White
Write-Host "     التفاصيل:   $scriptPath\captured_details.log" -ForegroundColor White
Write-Host "     العينات:    $scriptPath\samples\" -ForegroundColor White
Write-Host ""
Write-Host "  📋 لعرض النتائج:" -ForegroundColor Cyan
Write-Host "     Get-Content captured_requests.log" -ForegroundColor Yellow
Write-Host "     Get-Content captured_details.log" -ForegroundColor Yellow
Write-Host ""
Write-Host "  للخروج: اضغط Ctrl+C" -ForegroundColor Red
Write-Host "==============================" -ForegroundColor DarkYellow

while ($true) {
    Start-Sleep -Seconds 10
    $check2 = netstat -ano | Select-String ":8080.*LISTENING"
    if (-not $check2) {
        Write-Host "[✗] Sniffer توقف!" -ForegroundColor Red
        break
    }
    try {
        $s = (Invoke-WebRequest "http://127.0.0.1:8080/sniffer/status" -UseBasicParsing).Content | ConvertFrom-Json
        Write-Host "[$(Get-Date -Format HH:mm:ss)] 🔍 Endpoints: $($s.endpoints_discovered) | اشتغال: $([math]::Round($s.uptime))ث" -ForegroundColor DarkGray
    } catch {}
}
