@echo off
REM ==== SETTINGS ====
set PORT=3000
set NGROK_PATH=D:\Ngrok\ngrok.exe
set SERVER_PATH=D:\Git\arduino-esp32-test\backend
set URL_FILE=%SERVER_PATH%\ngrok_url.txt
set MAX_TRIES=30
REM ==================

REM (optional) start your backend in another window
REM start "Backend Server" cmd /k "cd /d %SERVER_PATH% && npm start"
REM timeout /t 3 >nul

REM start ngrok in its own window; keep it running
start "ngrok Tunnel" cmd /k ""%NGROK_PATH%" http %PORT% --log=stdout"

echo Waiting for ngrok tunnel (up to %MAX_TRIES% seconds)...
set URL=

for /L %%T in (1,1,%MAX_TRIES%) do (
    REM query ngrok's local API and extract the first https public_url
    for /f "delims=" %%U in ('
        powershell -NoProfile -Command ^
          "(Invoke-RestMethod http://127.0.0.1:4040/api/tunnels -ErrorAction SilentlyContinue).tunnels ^
           | ? { $_.public_url -like 'https*' } ^
           | Select-Object -First 1 -ExpandProperty public_url"
    ') do (
        set "URL=%%U"
    )

    if defined URL goto :got_url
    REM not ready yet; wait 1 sec and try again
    timeout /t 1 >nul
)

echo Failed to get ngrok URL after %MAX_TRIES% seconds.
echo (Check NGROK_PATH, authtoken, internet connectivity, or firewall.)
pause
exit /b 1

:got_url
echo %URL% > "%URL_FILE%"
echo Public URL: %URL%
echo URL saved to %URL_FILE%
pause