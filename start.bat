@echo off
cd /d "%~dp0"
echo Starting web app at http://localhost:3000
echo Allow camera when the browser asks.
call npm start
