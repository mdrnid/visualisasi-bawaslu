@echo off
cd /d "%~dp0.."
title Bawaslu Project - Starting...

:: Cek apakah node_modules sudah terinstall
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
)

:: Jalankan server di background dengan VBScript
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\start_server.vbs"
echo WshShell.Run "cmd /c cd /d ""%cd%"" && npm run dev > server.log 2>&1", 0, False >> "%temp%\start_server.vbs"
cscript //nologo "%temp%\start_server.vbs"
del "%temp%\start_server.vbs"

timeout /t 3 /nobreak > nul

:: Tampilkan info akses
cls
echo ==============================================
echo   SERVER BERJALAN!
echo ==============================================
echo.
echo [^>] Server started in background
echo.

:: Dapatkan dan tampilkan IP lokal
echo AKSES LOKAL (komputer ini):
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
echo ==============================================
echo.
echo [i] Log files: server.log
echo [i] Stop server: stop.bat
echo [i] Check IP: get-local-ip.bat
echo.
echo [!] Pastikan device lain terhubung WiFi SAMA
echo [!] Jika tidak bisa akses, cek Windows Firewall
echo.
timeout /t 10 /nobreak > nul

:: Tutup terminal otomatis
exit
