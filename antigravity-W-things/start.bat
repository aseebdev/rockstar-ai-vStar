@echo off
setlocal enabledelayedexpansion

title Astra Local AI Server

echo ===================================================
echo               ASTRA LOCAL AI LAUNCHER
echo ===================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js (v18 or higher recommended) from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Check if .env file exists
if not exist ".env" (
    echo [INFO] .env file not found. Creating from .env.example...
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [INFO] Created .env file.
        echo [REMINDER] Please open .env in Notepad and paste your Astra API key!
        echo.
    ) else (
        echo [WARN] .env.example not found!
    )
)

:: 3. Check if dependencies are installed
if not exist "node_modules\express\package.json" (
    echo [INFO] Installing required dependencies (express, dotenv, cors)...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install npm dependencies. Check your internet connection.
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed successfully.
    echo.
)

:: 4. Prompt if key is still placeholder
findstr /C:"ASTRA_API_KEY=YOUR_API_KEY_HERE" .env >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [REMINDER] You have not pasted your Astra API key into .env yet!
    echo            Please open .env and paste your actual Astra API key.
    echo.
)

:: 5. Open browser after brief delay in background
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: 6. Start the Node.js server
echo [INFO] Starting Astra Local AI server...
echo.
node server/server.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server exited with code %ERRORLEVEL%.
    pause
)
