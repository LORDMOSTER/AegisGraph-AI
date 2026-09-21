@echo off
title DCWGT Backend Server
color 0A

echo ============================================================
echo   DCWGT Industrial Safety Engine -- FastAPI Backend
echo ============================================================
echo.

cd /d "%~dp0backend"

echo [1/2] Checking Python environment...
python --version
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH.
    pause
    exit /b 1
)

echo.
echo [2/2] Installing backend dependencies...
pip install -r requirements.txt --quiet
echo.
echo Starting FastAPI server on http://localhost:8000
echo API docs available at http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server.
echo ============================================================
echo.

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause
