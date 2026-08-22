@echo off
title Burraco Legends - tavolo aperto al mondo
cd /d "%~dp0"

echo.
echo   ============================================
echo    BURRACO LEGENDS - GIOCA CON UN AMICO
echo   ============================================
echo.

rem ---------- serve Node ----------
where node >nul 2>nul
if errorlevel 1 (
  echo   Non trovo Node.js.
  echo   Scaricalo da https://nodejs.org - prendi la versione LTS.
  echo.
  pause & exit /b 1
)

rem ---------- serve cloudflared ----------
rem NON lo scarico io di nascosto: un programma che si scarica da solo
rem altri programmi e li esegue e' esattamente la cosa da non fare.
rem Lo cerco, e se manca dico dove prenderlo.
rem Le virgolette NON vanno dentro la variabile: si mettono quando la si
rem usa. Se dentro CF ci finiscono, "%CF%"=="" diventa ""C:\...""=="" e
rem cmd non capisce piu' la riga: chiude la finestra di colpo, senza dire
rem niente. E' gia' successo.
set "CF="
if exist "%~dp0cloudflared.exe" set "CF=%~dp0cloudflared.exe"
if not defined CF (
  where cloudflared >nul 2>nul
  if not errorlevel 1 set "CF=cloudflared"
)

if not defined CF (
  echo   ============================================
  echo    MANCA UN FILE, UNA VOLTA SOLA
  echo   ============================================
  echo.
  echo    Serve "cloudflared", il programma che apre la porta
  echo    verso l'esterno. E' di Cloudflare, gratuito, e non
  echo    chiede nessuna registrazione.
  echo.
  echo    1. Vai su:
  echo       https://github.com/cloudflare/cloudflared/releases/latest
  echo.
  echo    2. Scarica il file:
  echo       cloudflared-windows-amd64.exe
  echo.
  echo    3. Rinominalo in:  cloudflared.exe
  echo.
  echo    4. Mettilo in questa cartella, accanto a questo file.
  echo.
  echo    Poi ridai due clic qui sopra. Il download si fa una
  echo    volta sola: le prossime volte parte tutto da solo.
  echo.
  pause & exit /b 1
)

rem ---------- il server, in una finestra sua ----------
echo   Accendo il server...
start "Burraco Legends - server" cmd /c "node server\server.js & pause"

rem gli do il tempo di partire, senno il tunnel non trova nessuno
timeout /t 3 >nul

echo.
echo   ============================================
echo    ORA APRO LA PORTA VERSO L'ESTERNO
echo   ============================================
echo.
echo    Fra un attimo qui sotto comparira' un indirizzo
echo    che finisce con  .trycloudflare.com
echo.
echo    QUELLO mandi al tuo amico.
echo.
echo    Tienile aperte tutte e due le finestre: se le chiudi,
echo    il tavolo si spegne.
echo.
echo   --------------------------------------------
echo.

"%CF%" tunnel --url http://localhost:8080

echo.
echo   Il tunnel si e' chiuso. Chiudi anche la finestra del server.
pause
