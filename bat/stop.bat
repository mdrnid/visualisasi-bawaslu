@echo off
cd /d "%~dp0.."
title Bawaslu Project - Stopping...

:: Cek apakah ada proses Node.js yang berjalan
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Stopping Node.js processes...
    taskkill /f /im node.exe > nul 2>&1
    timeout /t 1 /nobreak > nul
    echo.
    echo Server stopped successfully!
    echo.
) else (
    echo No server is running.
    echo.
)

timeout /t 2 /nobreak > nul
exit
