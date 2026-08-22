@echo off
title Burraco Legends - controllo
cd /d "%~dp0"

echo.
echo   ============================================
echo    CONTROLLO COMPLETO
echo   ============================================
echo.
echo   1. ricostruisce le pagine dal motore
echo   2. controlla che siano allineate
echo   3. prova tutte le regole del gioco
echo   4. prova il server
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Non trovo Node.js. Scaricalo da https://nodejs.org
  pause & exit /b 1
)
rem Python NON si controlla piu' qui: se manca, i controlli che ne hanno
rem bisogno si tirano da parte da soli e lo dicono. Prima invece si
rem fermava tutto, e chi voleva solo provare il gioco restava a piedi
rem per un programma che serve soltanto a rigenerare le pagine.

rem La prima volta serve scaricare jsdom, il browser finto con cui si
rem prova il tavolo davvero. Serve SOLO alle prove: il gioco e il server
rem non hanno nessuna dipendenza e funzionano anche senza. Lo si fa una
rem volta sola, poi la cartella node_modules resta qui.
if not exist "node_modules\jsdom" (
  echo   Prima volta: scarico il necessario per le prove. Un minuto circa.
  echo.
  call npm install
  echo.
)

call npm test
if errorlevel 1 (
  echo.
  echo   ============================================
  echo    QUALCOSA NON VA. Guarda sopra quale riga
  echo    dice FAIL: e' scritto in italiano.
  echo   ============================================
) else (
  echo.
  echo   ============================================
  echo    TUTTO A POSTO.
  echo   ============================================
)
echo.
pause
