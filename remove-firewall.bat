@echo off
color 0C
title Bawaslu Project - Remove Firewall Rule

echo ==============================================
echo   HAPUS FIREWALL RULE PORT 8080
echo ==============================================
echo.
echo Script ini akan menghapus firewall rule
echo untuk port 8080 (menutup akses dari luar)
echo.
pause

:: Cek apakah running as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [X] ERROR: Script ini harus dijalankan sebagai Administrator!
    echo.
    echo Cara menjalankan sebagai Admin:
    echo 1. Klik kanan pada remove-firewall.bat
    echo 2. Pilih "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo.
echo [*] Menghapus firewall rule...
echo.

netsh advfirewall firewall delete rule name="Bawaslu Server Port 8080"

if %errorLevel% equ 0 (
    echo.
    echo ==============================================
    echo   SUKSES!
    echo ==============================================
    echo.
    echo [^>] Firewall rule untuk port 8080 telah dihapus
    echo [^>] Server tidak bisa diakses dari device lain
    echo     (hanya localhost yang bisa akses)
    echo.
) else (
    echo.
    echo [!] Rule tidak ditemukan atau sudah dihapus
    echo.
)

echo ==============================================
pause
