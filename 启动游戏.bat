@echo off
rem Big Infinity Fighter - local server launcher (ES modules require HTTP access)
rem Double-click = start local server + open browser. Close this window to stop the server.
rem NOTE 1: keep this file pure ASCII + CRLF (UTF-8 Chinese broke cmd parsing before).
rem NOTE 2: port conflicts are solved inside tools/server.py (auto-fallback 8766+ and
rem         reuse of an already-running game server), so no netstat pre-check here.
rem NOTE 3: we must verify python can REALLY run - the Microsoft Store "python.exe"
rem         alias stub is found by "where" but only prints "Python was not found"
rem         / opens the Store (this looked like a mysterious startup error).
setlocal
title Big Infinity Fighter - game server
cd /d "%~dp0"

set PY=
call :find_python
if not defined PY (
  echo [ERROR] Python 3 was not found on this computer.
  echo         ^(Or "python" is the fake Microsoft Store alias stub - it cannot run code.^)
  echo Fix  : install Python from https://www.python.org/downloads/
  echo        and tick "Add python.exe to PATH" in the installer, then re-run this file.
  echo Alternatively: serve this folder with any static server and open
  echo                http://127.0.0.1:8765 in the browser.
  pause
  exit /b 1
)

echo Starting local server (no-cache) - the browser will open automatically.
echo If port 8765 is busy, a free port is picked automatically - read the URL below.
echo Close this window to stop the server.
%PY% tools\server.py

echo.
echo [INFO] Server exited. Read the message above for the reason.
pause
exit /b 0

:find_python
rem Find a python that can actually execute code: skips the WindowsApps alias stub
rem (prints store message, exits non-zero with args) and skips Python 2.
where python >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; sys.exit(sys.version_info[0] < 3)" >nul 2>nul
  if not errorlevel 1 (
    set PY=python
    exit /b 0
  )
)
where py >nul 2>nul
if not errorlevel 1 (
  py -c "import sys; sys.exit(sys.version_info[0] < 3)" >nul 2>nul
  if not errorlevel 1 (
    set PY=py
    exit /b 0
  )
)
exit /b 0
