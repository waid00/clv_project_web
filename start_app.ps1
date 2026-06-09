# CLV Prediction Web App - Quick Start Script for PowerShell

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "CLV Prediction Web Application" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running in correct directory
if (-not (Test-Path "requirements.txt")) {
    Write-Host "ERROR: requirements.txt not found!" -ForegroundColor Red
    Write-Host "Please run this script from the clv_project directory" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Determine Python command to use
$pythonCmd = "python"
if (Test-Path "venv\Scripts\python.exe") {
    Write-Host "Local virtual environment found." -ForegroundColor Green
    $pythonCmd = "venv\Scripts\python.exe"
} else {
    try {
        $pythonVersion = python --version 2>&1
        Write-Host "Python found in PATH: $pythonVersion" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Python is not installed or not in PATH, and no venv found." -ForegroundColor Red
        Write-Host "Please install Python 3.8+ from https://www.python.org/" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host ""

# Install dependencies using python -m pip
Write-Host "Installing dependencies..." -ForegroundColor Cyan
& $pythonCmd -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Starting Web Application" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Opening http://localhost:5000 in your browser..." -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start the Flask app
& $pythonCmd -X utf8 app.py

