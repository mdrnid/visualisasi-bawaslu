@echo off
setlocal
cd /d "%~dp0.."
title Server Bawaslu - Autostart

REM Cek apakah server sudah aktif di port 8080
netstat -ano | findstr :8080 | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 exit /b 0

REM Jalankan di background secara silent (tanpa jendela CMD mengambang)
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\start_bawaslu.vbs"
echo WshShell.CurrentDirectory = "%~dp0.." >> "%temp%\start_bawaslu.vbs"
echo WshShell.Run "cmd /c node server.js >> server.log 2>&1", 0, False >> "%temp%\start_bawaslu.vbs"
cscript //nologo "%temp%\start_bawaslu.vbs"
del "%temp%\start_bawaslu.vbs"

exit /b 0
