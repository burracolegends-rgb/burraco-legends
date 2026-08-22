@echo off
title Burraco Legends - pulisci le illustrazioni
cd /d "%~dp0"

echo.
echo   ============================================
echo    TOLGO LO SFONDO ALLE ILLUSTRAZIONI
echo   ============================================
echo.
echo   Prendo da:  illustrazioni\grezze
echo   Metto in:   illustrazioni\pulite
echo.

set PY=python
where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo   Non trovo Python. Scaricalo da https://python.org
    echo   Durante l'installazione spunta "Add Python to PATH".
    pause & exit /b 1
  )
  set PY=py
)

%PY% strumenti\rimuovi-sfondo.py
echo.
pause
