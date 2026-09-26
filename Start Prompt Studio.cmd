@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0launcher.mjs"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Please download the Windows portable release, or install Node.js first.
    pause
    exit /b 1
  )
  node "%~dp0launcher.mjs"
)
if errorlevel 1 pause
