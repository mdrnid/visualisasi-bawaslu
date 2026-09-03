@echo off
color 0B
title Bawaslu Project - Local Network Access

echo ==============================================
echo   AKSES JARINGAN LOKAL (LAN/WIFI)
echo ==============================================
echo.

:: Dapatkan IP Address WiFi/Ethernet
echo [*] Mencari IP Address lokal...
echo.

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set "ip=%%a"
    setlocal enabledelayedexpansion
    set "ip=!ip:~1!"
    
    :: Filter IP lokal yang valid (192.168.x.x atau 10.x.x.x atau 172.16-31.x.x)
    echo !ip! | findstr /r "^192\.168\." >nul && (
        echo [^>] IP WiFi/LAN: !ip!
        echo     Akses dari HP/Laptop lain: http://!ip!:8080
        echo.
    )
    echo !ip! | findstr /r "^10\." >nul && (
        echo [^>] IP WiFi/LAN: !ip!
        echo     Akses dari HP/Laptop lain: http://!ip!:8080
        echo.
    )
    endlocal
)

echo ==============================================
echo   CARA MENGGUNAKAN:
echo ==============================================
echo.
echo 1. Pastikan server sudah berjalan (start.bat)
echo 2. Pastikan device lain terhubung WiFi yang sama
echo 3. Buka browser di HP/Laptop lain
echo 4. Ketik URL di atas
echo.
echo ==============================================
echo   TROUBLESHOOTING:
echo ==============================================
echo.
echo [!] Tidak bisa akses?
echo     - Cek Windows Firewall
echo     - Pastikan WiFi bukan "Public Network"
echo     - Gunakan "Private Network" di WiFi settings
echo.
echo [!] Cara disable firewall untuk port 8080:
echo     netsh advfirewall firewall add rule name="Bawaslu Server" dir=in action=allow protocol=TCP localport=8080
echo.
echo ==============================================

pause
