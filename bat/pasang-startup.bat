@echo off
setlocal
title Pasang Autostart - Bawaslu Project
color 0A

echo =======================================================
echo     PASANG AUTOSTART WINDOWS - BAWASLU PROJECT
echo =======================================================
echo.
echo Script ini akan mendaftarkan project Bawaslu agar
echo OTOMATIS BERJALAN setiap kali komputer dinyalakan / login.
echo.

set "PROJ_DIR=%~dp0.."
set "TARGET_BAT=%~dp0autostart-bawaslu.bat"
set "SHORTCUT_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_FILE=%SHORTCUT_DIR%\BawasluServer.lnk"

if not exist "%TARGET_BAT%" (
    echo [ERROR] File autostart-bawaslu.bat tidak ditemukan di folder bat!
    pause
    exit /b 1
)

REM Buat shortcut .lnk di folder Startup Windows menggunakan PowerShell
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_FILE%'); $s.TargetPath = '%TARGET_BAT%'; $s.WorkingDirectory = (Resolve-Path '%PROJ_DIR%').Path; $s.Description = 'Autostart Server Bawaslu'; $s.Save()"

if not exist "%SHORTCUT_FILE%" goto failed_install

echo [SUKSES] Shortcut berhasil dipasang di Windows Startup:
echo          "%SHORTCUT_FILE%"
echo.
echo -------------------------------------------------------
echo  SEKARANG SERVER AKAN OTOMATIS BERJALAN DI LATAR BELAKANG
echo  SETIAP KALI KOMPUTER DINYALAKAN DAN LOGIN KE WINDOWS!
echo -------------------------------------------------------
echo.
echo Informasi URL Akses saat ini:
echo   - Lokal (Komputer ini) : http://localhost:8080
echo   - Jaringan WiFi/LAN    : http://192.168.17.223:8080
echo.
echo Catatan:
echo  - Server berjalan tanpa jendela CMD yang mengganggu aktivitas Anda.
echo  - Untuk membatalkan autostart kapan saja, jalankan: hapus-startup.bat
goto finish

:failed_install
echo [GAGAL] Gagal membuat shortcut di folder startup.
echo Alternatif manual:
echo   1. Tekan Win + R, ketik "shell:startup", tekan Enter.
echo   2. Salin shortcut file "bat\autostart-bawaslu.bat" ke dalam folder tersebut.

:finish
echo.
echo =======================================================
pause
