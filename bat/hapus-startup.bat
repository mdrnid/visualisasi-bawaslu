@echo off
setlocal
title Hapus Autostart - Bawaslu Project
color 0C

echo =======================================================
echo     HAPUS AUTOSTART WINDOWS - BAWASLU PROJECT
echo =======================================================
echo.

set "SHORTCUT_FILE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\BawasluServer.lnk"

if not exist "%SHORTCUT_FILE%" goto not_found

del /f /q "%SHORTCUT_FILE%"
echo [SUKSES] Shortcut autostart berhasil dihapus dari Windows Startup!
echo.
echo Server Bawaslu tidak akan berjalan otomatis lagi saat komputer dinyalakan.
echo Anda tetap bisa menjalankannya via bawaslu.bat atau bat\start.bat.
goto finish

:not_found
echo [INFO] Shortcut autostart tidak ditemukan di folder Startup Windows.
echo Server saat ini tidak terdaftar di Windows Startup.

:finish
echo.
echo =======================================================
pause
