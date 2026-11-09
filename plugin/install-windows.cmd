@echo off
setlocal
set "NODE_EXE="
for %%N in (node.exe) do set "NODE_EXE=%%~$PATH:N"
if not defined NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE_EXE (
  echo Node.js 22 or newer was not found. Install it from https://nodejs.org/ then retry.
  pause
  exit /b 1
)
"%NODE_EXE%" "%~dp0install-local.cjs"
set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%
