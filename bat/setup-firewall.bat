@echo off
cd /d "%~dp0.."
color 0E
title Bawaslu Project - Firewall Setup

echo ==============================================
echo   SETUP WINDOWS FIREWALL UNTUK PORT 8080
echo ==============================================
echo.
echo Script ini akan:
echo - Membuka port 8080 di Windows Firewall
echo - Membolehkan akses dari jaringan lokal
echo.
echo [!] PERLU HAK ADMINISTRATOR
echo.
pause

:: Cek apakah running as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [X] ERROR: Script ini harus dijalankan sebagai Administrator!
    echo.
    echo Cara menjalankan sebagai Admin:
    echo 1. Klik kanan pada setup-firewall.bat
    echo 2. Pilih "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo.
echo [*] Menambahkan firewall rule...
echo.

:: Hapus rule lama jika ada
netsh advfirewall firewall delete rule name="Bawaslu Server Port 8080" >nul 2>&1

:: Tambah rule baru untuk inbound traffic
netsh advfirewall firewall add rule name="Bawaslu Server Port 8080" dir=in action=allow protocol=TCP localport=8080

if %errorLevel% equ 0 (
    echo.
    echo ==============================================
    echo   SUKSES!
    echo ==============================================
    echo.
    echo [^>] Port 8080 sudah dibuka di Windows Firewall
    echo [^>] Server sekarang bisa diakses dari device lain
    echo     di jaringan WiFi yang sama
    echo.
    echo LANGKAH SELANJUTNYA:
    echo 1. Jalankan: start.bat
    echo 2. Catat IP address yang muncul
    echo 3. Akses dari HP/laptop: http://[IP]:8080
    echo.
) else (
    echo.
    echo [X] GAGAL menambahkan firewall rule
    echo.
)

echo ==============================================
pause
