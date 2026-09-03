@echo off
color 0B
title Bawaslu Project - Server Status

echo ==============================================
echo   STATUS SERVER BAWASLU
echo ==============================================
echo.

:: Cek apakah ada proses Node.js yang berjalan
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [^>] Status: SERVER BERJALAN
    echo.
    echo     Proses Node.js yang aktif:
    tasklist /FI "IMAGENAME eq node.exe" /FO TABLE
    echo.
    
    :: Cek apakah ada log file
    if exist "server.log" (
        echo [^>] Log Server (5 baris terakhir):
        echo     ----------------------------------
        powershell -Command "Get-Content server.log -Tail 5"
        echo     ----------------------------------
        echo.
    )
    
    if exist "tunnel.log" (
        echo [^>] Log Tunnel (5 baris terakhir):
        echo     ----------------------------------
        powershell -Command "Get-Content tunnel.log -Tail 5"
        echo     ----------------------------------
        echo.
    )
    
    echo [^>] Akses lokal: http://localhost:8080
    echo.
) else (
    echo [!] Status: SERVER TIDAK BERJALAN
    echo.
    echo     Tidak ada proses Node.js yang aktif
    echo     Jalankan start.bat untuk memulai server
    echo.
)

echo ==============================================
pause
