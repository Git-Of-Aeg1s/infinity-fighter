@echo off
rem Big Infinity Fighter - local server launcher (ES modules require HTTP access)
rem Double-click = start local server + open browser. Close this window to stop the server.
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

echo Starting local server (no-cache): http://127.0.0.1:8765   (close this window to stop)
start "" "http://127.0.0.1:8765"
%PY% tools\server.py
