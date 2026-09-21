@echo off
title DCWGT Frontend Server
color 0B

echo ============================================================
echo   DCWGT Industrial Safety Engine -- React Frontend
echo ============================================================
echo.

cd /d "%~dp0frontend"

echo [1/2] Checking Node.js environment...
node --version
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH.
    pause
    exit /b 1
)

echo.
echo [2/2] Installing dependencies (first run only)...
if not exist node_modules (
    echo node_modules not found -- running npm install...
    npm install
    if errorlevel 1 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
) else (
    echo node_modules already present, skipping install.
)

echo.
echo Starting Vite dev server on http://localhost:5173
echo Press Ctrl+C to stop the server.
echo ============================================================
echo.

npm run dev

pause
