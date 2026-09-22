@echo off
rem Big Infinity Fighter - local server launcher (ES modules require HTTP access)
rem Double-click = start local server + open browser. Close this window to stop the server.
rem NOTE: keep this file pure ASCII + CRLF (UTF-8 Chinese broke cmd parsing before).
setlocal
title Big Infinity Fighter - game server
cd /d "%~dp0"

set PY=
where python >nul 2>nul && set PY=python
if not defined PY where py >nul 2>nul && set PY=py
if not defined PY (
  echo [ERROR] Python not found. Please install Python, or serve this folder with any static server,
  echo         then open http://127.0.0.1:8765 manually.
  pause
  exit /b 1
)

rem Port 8765 already listening? Check whether it is a healthy game server or a stranger.
rem (two fixed-string filters - findstr /r /c:"... .*..." regex proved unreliable here)
netstat -ano | findstr /c:":8765" | findstr /c:"LISTENING" >nul 2>nul
if not errorlevel 1 (
  powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:8765/' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    echo [INFO] A game server is already running on port 8765. Opening browser...
    start "" "http://127.0.0.1:8765"
    exit /b 0
  )
  echo [ERROR] Port 8765 is occupied by a program that is NOT serving this game:
  netstat -ano | findstr /c:":8765" | findstr /c:"LISTENING"
  echo Close that program first. Identify it by PID:  tasklist /fi "PID eq NUMBER"
  echo Then re-run this file.
  pause
  exit /b 1
)

echo Starting local server (no-cache) - the browser will open automatically.
echo Close this window to stop the server.
%PY% tools\server.py

echo.
echo [INFO] Server exited. Read the message above for the reason.
pause
