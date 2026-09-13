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
echo   [1] Start Server (Background - Auto Close)
echo   [2] Start Server (Window Mode - Show Logs)
echo   [3] Start Server (Local Only - No Tunnel)
echo.
echo   [4] Stop Server
echo   [5] Restart Server
echo.
echo   [6] View Server Status
echo   [7] View Logs
echo.
echo   [8] Get Local IP Address (LAN/WiFi)
echo   [9] Setup Firewall (Run as Admin)
echo.
echo   [B] Open in Browser (localhost:8080)
echo.
echo   [0] Exit
echo.
echo  ==============================================
echo.
set /p choice="  Pilih menu (0-9/B): "

if /i "%choice%"=="1" goto start_background
if /i "%choice%"=="2" goto start_window
if /i "%choice%"=="3" goto start_local
if /i "%choice%"=="4" goto stop_server
if /i "%choice%"=="5" goto restart_server
if /i "%choice%"=="6" goto view_status
if /i "%choice%"=="7" goto view_logs
if /i "%choice%"=="8" goto get_ip
if /i "%choice%"=="9" goto setup_firewall
if /i "%choice%"=="B" goto open_browser
if /i "%choice%"=="0" goto exit
goto menu

:start_background
cls
echo.
echo Starting server in background...
echo.
call "%~dp0start.bat"
goto menu

:start_window
cls
call "%~dp0start-window.bat"
goto wait_and_menu

:start_local
cls
call "%~dp0start-local.bat"
goto wait_and_menu

:stop_server
cls
call "%~dp0stop.bat"
goto wait_and_menu

:restart_server
cls
call "%~dp0restart.bat"
goto wait_and_menu

:view_status
cls
call "%~dp0status.bat"
goto wait_and_menu

:view_logs
cls
call "%~dp0view-logs.bat"
goto wait_and_menu

:get_ip
cls
call "%~dp0get-local-ip.bat"
goto wait_and_menu

:setup_firewall
cls
echo.
echo [!] Script firewall memerlukan hak Administrator
echo     Window baru akan terbuka...
echo.
timeout /t 2 /nobreak > nul
powershell -Command "Start-Process '%~dp0setup-firewall.bat' -Verb RunAs"
echo.
echo Setelah selesai setup firewall, tekan tombol apapun...
pause > nul
goto menu

:open_browser
start http://localhost:8080
echo.
echo Browser opened at http://localhost:8080
timeout /t 2 /nobreak > nul
goto menu

:wait_and_menu
echo.
echo Press any key to return to menu...
pause > nul
goto menu

:exit
cls
echo.
echo  ==============================================
echo    Thank you for using Bawaslu Project!
echo  ==============================================
echo.
timeout /t 2 /nobreak > nul
exit
