@echo off
REM CLV Prediction Web App - Quick Start Script for Windows

echo =========================================
echo CLV Prediction Web Application
echo =========================================
echo.

REM Check if running in correct directory
if not exist "requirements.txt" (
    echo ERROR: requirements.txt not found!
    echo Please run this script from the clv_project directory
    pause
    exit /b 1
)

REM Determine Python command to use
set USE_VENV=0
if exist "venv\Scripts\python.exe" (
    echo Local virtual environment found.
    set PYTHON_CMD=venv\Scripts\python.exe
    set USE_VENV=1
) else (
    REM Check if Python is installed globally
    python --version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python is not installed or not in PATH, and no venv found.
        echo Please install Python 3.8+ from https://www.python.org/ or create a venv.
        pause
        exit /b 1
    )
    set PYTHON_CMD=python
)

echo Using Python command:
%PYTHON_CMD% --version
echo.

REM Install dependencies using -m pip
echo Installing/verifying dependencies...
%PYTHON_CMD% -m pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo =========================================
echo Starting Web Application
echo =========================================
echo.
echo Opening http://localhost:5000 in your browser...
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the Flask app
%PYTHON_CMD% -X utf8 app.py

