const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec, spawn } = require('child_process');

const TOR_PORT = 9050;
const TOR_CONTROL_PORT = 9051;
const TOR_DOWNLOAD_URL = 'https://archive.torproject.org/tor-package-archive/torbrowser/13.5.6/tor-expert-bundle-windows-x86_64-13.5.6.tar.gz';
const DOWNLOAD_PATH = path.join(app.getPath('userData'), 'tor.tar.gz');
const EXTRACT_DIR = path.join(app.getPath('userData'), 'tor');
const TOR_EXECUTABLE = path.join(EXTRACT_DIR, 'tor', 'tor.exe');

app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

function checkIfTorRunning(callback) {
    exec(`netstat -ano | findstr ${TOR_PORT}`, (error, stdout, stderr) => {
        callback(stdout.includes(TOR_PORT));
    });
}

function installAndRunTor(callback) {
    const file = fs.createWriteStream(DOWNLOAD_PATH);
    console.log(`Downloading Tor from : ${TOR_DOWNLOAD_URL}`);
    https.get(TOR_DOWNLOAD_URL, (response) => {
        if (response.statusCode !== 200) {
            console.error(`Error downloading Tor package. HTTP Code : ${response.statusCode}`);
            return;
        }

        response.pipe(file);
        file.on('finish', () => {
            file.close(() => {
                console.log('Tor download complete, creating extraction directory...');
                
                if (!fs.existsSync(EXTRACT_DIR)) {
                    fs.mkdirSync(EXTRACT_DIR, { recursive: true });
                    console.log('Extraction directory created.');
                }

                console.log('Extracting...');
                exec(`tar -xzvf ${DOWNLOAD_PATH} -C ${EXTRACT_DIR}`, (err) => {
                    if (err) {
                        console.error('Failed to extract Tor package :', err);
                        return;
                    }
                    console.log('Tor extraction successful.');
                    if (fs.existsSync(TOR_EXECUTABLE)) {
                        console.log('Tor found, starting...');
                        startTor(callback);
                    } else {
                        console.error('Tor executable not found after extraction.');
                    }
                });
            });
        });
    }).on('error', (err) => {
        console.error('Error downloading Tor :', err);
    });
}

function startTor(callback) {
    const torProcess = spawn(TOR_EXECUTABLE, ['--SocksPort', TOR_PORT, '--ControlPort', TOR_CONTROL_PORT], { detached: true });
    torProcess.stdout.on('data', (data) => {
        if (data.includes('Bootstrapped 100%')) {
            callback();
        }
    });

    torProcess.stderr.on('data', (data) => {
        console.error('Tor error:', data.toString());
    });

    torProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Tor exited with code ${code}`);
        }
    });
}

function configureTorProxy() {
    session.defaultSession.setProxy({
        proxyRules: `socks5://127.0.0.1:${TOR_PORT}`,
        pacScript: '',
        proxyBypassRules: ''
    });
}

function createWindow() {
    let win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });

    win.webContents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    win.loadURL('https://discord.com/app');
}

app.whenReady().then(() => {
    checkIfTorRunning((isTorRunning) => {
        if (isTorRunning) {
            configureTorProxy();
            createWindow();
        } else {
            installAndRunTor(() => {
                configureTorProxy();
                createWindow();
            });
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});