@echo off
title Throne Game Server
echo ========================================
echo           THRONE - Game Server
echo ========================================
echo.

:: Start the Node.js server in background
echo Starting game server...
start /B cmd /c "cd /d %~dp0 && node server.js"

:: Wait a moment for server to start
timeout /t 2 /nobreak >nul

:: Start ngrok
echo Starting ngrok tunnel...
echo.
echo ========================================
echo  Share the https:// URL below with 
echo  your friends to play together!
echo ========================================
echo.

"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" http 3000
