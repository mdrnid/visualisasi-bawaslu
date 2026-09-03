@echo off
color 0A
title Bawaslu Project - Start with Windows

echo ==============================================
echo   MENYALAKAN SERVER (WINDOW MODE)
echo ==============================================
echo.

:: Cek apakah node_modules sudah terinstall
if not exist "node_modules\" (
    echo [!] Installing dependencies...
    call npm install
    echo.
)

echo [1/1] Starting Web Server...
echo      Server: http://localhost:8080
echo.
start "Node Server Bawaslu" cmd /k "npm run dev"

timeout /t 5 /nobreak > nul

echo.
echo ==============================================
echo   SERVER STARTED!
echo ==============================================
echo.
echo [^>] Two terminal windows opened:
echo     1. Node Server Bawaslu - Local server
echo.
echo AKSES LOKAL:
echo   http://localhost:8080
echo.
echo AKSES DARI HP/LAPTOP LAIN (WiFi sama):

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set "ip=%%a"
    setlocal enabledelayedexpansion
    set "ip=!ip:~1!"
    echo !ip! | findstr /r "^192\.168\." >nul && echo   http://!ip!:8080
    echo !ip! | findstr /r "^10\." >nul && echo   http://!ip!:8080
    endlocal
)

echo.
echo [!] Pastikan device lain terhubung WiFi SAMA
echo [!] DON'T CLOSE the server windows!
echo [!] To stop: run stop.bat
echo.
pause
