@echo off
echo ================================================
echo   AI Job Finder v2 - Python Environment Setup
echo ================================================
echo.

cd /d "%~dp0backend-py"

echo [1/4] Creating virtual environment...
python -m venv venv
if errorlevel 1 (echo ERROR: python not found. Install Python 3.10+ first. & pause & exit /b 1)

echo [2/4] Activating venv...
call venv\Scripts\activate.bat

echo [3/4] Upgrading pip...
pip install --upgrade pip --quiet

echo [4/4] Installing httpx...
pip install "httpx[socks]" --quiet

echo.
echo ================================================
echo   Running connection tests...
echo ================================================
echo.

cd ..
python test-connections.py

echo.
pause
