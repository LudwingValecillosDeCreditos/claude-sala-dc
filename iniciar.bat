@echo off
title La Sala
cd /d "%~dp0server"
where node >nul 2>nul || (echo Falta Node.js: bajalo de https://nodejs.org y volve a abrir este archivo. & pause & exit /b 1)
node iniciar.js
pause
