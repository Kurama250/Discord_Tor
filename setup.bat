@echo off

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed on your system. Please install Node.js.
    exit /b 1
)

npm list fs-extra net user-agents electron electron-builder >nul 2>&1
if %errorlevel% neq 0 (
    echo fs-extra net user-agents electron electron-builder module is not installed. Installing them...
    npm install electron@34.3.0 electron-builder@24.2.0
    if %errorlevel% equ 0 (
        echo Installation of electron electron-builder completed successfully !
    ) else (
        echo An error occurred while installing the fs-extra net user-agents electron electron-builder modules.
    )
) else (
    echo electron electron-builder modules are already installed.
)

echo All necessary components are installed.
echo You can now proceed with your tasks.

pause
