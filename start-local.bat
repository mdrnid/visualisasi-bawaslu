@echo off
color 0B
title Bawaslu Project - Local Server Only

echo ==============================================
echo   SERVER LOKAL BAWASLU (TANPA TUNNEL)
echo ==============================================
echo.

:: Cek apakah node_modules sudah terinstall
if not exist "node_modules\" (
    echo [!] Node modules belum terinstall!
    echo [*] Menjalankan npm install...
    echo.
    call npm install
    echo.
)

echo [*] Menyalakan Web Server Lokal...
echo     Server akan berjalan di http://localhost:8080
echo.
echo ==============================================
echo   SERVER BERJALAN!
echo ==============================================
echo.
echo [^>] Akses: http://localhost:8080
echo [^>] Tekan Ctrl+C untuk menghentikan server
echo.
echo ==============================================
echo.

:: Jalankan server di terminal yang sama
npm run dev
