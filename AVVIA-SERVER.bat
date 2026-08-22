@echo off
title Burraco Legends - server
cd /d "%~dp0"

echo.
echo   Avvio del tavolo...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   ============================================
  echo    Non trovo Node.js su questo computer.
  echo   ============================================
  echo.
  echo    Il server ha bisogno di Node per funzionare.
  echo    Scaricalo da:  https://nodejs.org
  echo    Prendi la versione "LTS", installala lasciando
  echo    tutte le impostazioni come sono, poi chiudi
  echo    questa finestra e ridai due clic qui sopra.
  echo.
  pause
  exit /b 1
)

rem La finestra del browser si apre da sola dopo un attimo, il tempo
rem che il server sia in piedi: se si apre subito trova la porta chiusa.
start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:8080"

node server\server.js

echo.
echo   Il server si e' fermato.
pause
