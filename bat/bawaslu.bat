@echo off
cd /d "%~dp0.."
color 0F
title Bawaslu Project - Control Panel

:menu
cls
echo.
echo  ==============================================
echo    BAWASLU PROJECT - CONTROL PANEL
echo  ==============================================
echo.
echo   [1] Start Server (Latar Belakang / Background)
echo   [2] Stop Server (Hentikan Server)
echo   [3] Restart Server
echo.
echo   [4] Cek IP Address Lokal (WiFi/LAN)
echo   [5] Pasang Autostart (Jalan Otomatis Saat PC Nyala)
echo   [6] Hapus Autostart (Matikan Autostart)
echo.
echo   [B] Buka di Browser (localhost:8080)
echo.
echo   [0] Keluar
echo.
echo  ==============================================
echo.
set /p choice="  Pilih menu (0-6/B): "

if /i "%choice%"=="1" goto start_background
if /i "%choice%"=="2" goto stop_server
if /i "%choice%"=="3" goto restart_server
if /i "%choice%"=="4" goto get_ip
if /i "%choice%"=="5" goto install_startup
if /i "%choice%"=="6" goto remove_startup
if /i "%choice%"=="B" goto open_browser
if /i "%choice%"=="0" goto exit
goto menu

:start_background
cls
call "%~dp0start.bat"
goto menu

:stop_server
cls
call "%~dp0stop.bat"
goto wait_and_menu

:restart_server
cls
echo Restarting server...
call "%~dp0stop.bat"
timeout /t 1 /nobreak > nul
call "%~dp0start.bat"
goto menu

:get_ip
cls
call "%~dp0get-local-ip.bat"
goto wait_and_menu

:install_startup
cls
call "%~dp0pasang-startup.bat"
goto menu

:remove_startup
cls
call "%~dp0hapus-startup.bat"
goto menu

:open_browser
start http://localhost:8080
echo.
echo Browser opened at http://localhost:8080
timeout /t 2 /nobreak > nul
goto menu

:wait_and_menu
echo.
echo Tekan sembarang tombol untuk kembali ke menu...
pause > nul
goto menu

:exit
cls
echo.
echo  ==============================================
echo    Terima kasih telah menggunakan Bawaslu Project!
echo  ==============================================
echo.
timeout /t 2 /nobreak > nul
exit
