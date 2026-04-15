@echo off
REM StockOS — Quick Start Script
REM Run this once to install dependencies and start dev server

echo.
echo  ========================================
echo    StockOS ERP - Vue 3 + Vite
echo  ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules\vue" (
  echo  [1/2] Installing dependencies...
  npm install
  if errorlevel 1 (
    echo  ERROR: npm install failed
    pause
    exit /b 1
  )
  echo  [1/2] Done.
) else (
  echo  [1/2] Dependencies already installed.
)

echo.
echo  [2/2] Starting development server...
echo.
echo  App will be available at: http://localhost:5173
echo  Press Ctrl+C to stop
echo.

npm run dev
