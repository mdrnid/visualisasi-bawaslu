@echo off
title Bawaslu Project - Restarting...

echo Restarting server...
echo.

:: Matikan proses Node.js jika ada
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [1/2] Stopping current server...
    taskkill /f /im node.exe > nul 2>&1
    timeout /t 2 /nobreak > nul
    echo      Done!
) else (
    echo [1/2] No server running...
)

echo.
echo [2/2] Starting server...
timeout /t 1 /nobreak > nul

:: Jalankan start.bat
call start.bat
