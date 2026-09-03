@echo off
color 0E
title Bawaslu Project - View Logs

echo ==============================================
echo   LOG VIEWER BAWASLU
echo ==============================================
echo.
echo Pilih log yang ingin dilihat:
echo.
echo [1] Server Log (Node.js)
echo [2] Tunnel Log (SSH)
echo [3] Kedua-duanya
echo.
set /p choice="Pilih (1/2/3): "

echo.
echo ==============================================

if "%choice%"=="1" (
    if exist "server.log" (
        echo   SERVER LOG (Tekan Ctrl+C untuk keluar)
        echo ==============================================
        echo.
        powershell -Command "Get-Content server.log -Wait"
    ) else (
        echo [!] File server.log tidak ditemukan
        echo     Server mungkin belum pernah dijalankan di background mode
    )
)

if "%choice%"=="2" (
    if exist "tunnel.log" (
        echo   TUNNEL LOG (Tekan Ctrl+C untuk keluar)
        echo ==============================================
        echo.
        powershell -Command "Get-Content tunnel.log -Wait"
    ) else (
        echo [!] File tunnel.log tidak ditemukan
        echo     Tunnel mungkin belum pernah dijalankan di background mode
    )
)

if "%choice%"=="3" (
    echo   SEMUA LOG (Tekan Ctrl+C untuk keluar)
    echo ==============================================
    echo.
    start "Server Log" cmd /k "powershell -Command Get-Content server.log -Wait"
    start "Tunnel Log" cmd /k "powershell -Command Get-Content tunnel.log -Wait"
    echo Dua window baru telah dibuka untuk melihat log
    echo.
)

pause
