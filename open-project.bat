@echo off
color 0D
title Bawaslu Project - Quick Open

echo ==============================================
echo   QUICK OPEN - BAWASLU PROJECT
echo ==============================================
echo.

echo [1/3] Membuka browser...
start http://localhost:8080

echo [2/3] Membuka folder project...
start .

echo [3/3] Cek status server...
echo.

:: Cek apakah server sudah jalan
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [✓] Server sudah berjalan di http://localhost:8080
) else (
    echo [!] Server belum berjalan
    echo.
    set /p start="    Jalankan server sekarang? (Y/N): "
    if /i "!start!"=="Y" (
        echo.
        echo     Memulai server...
        call start.bat
    )
)

echo.
echo ==============================================
echo.
pause
