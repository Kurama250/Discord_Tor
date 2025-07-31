const { app, BrowserWindow, session, ipcMain } = require('electron');
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

let loadingWindow = null;
let mainWindow = null;

function checkIfTorRunning(callback) {
    exec(`netstat -ano | findstr ${TOR_PORT}`, (error, stdout, stderr) => {
        callback(stdout.includes(TOR_PORT));
    });
}

function updateLoadingStatus(message) {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.webContents.send('update-status', message);
    }
}

function extractTarGzWindows(tarPath, extractTo, callback) {
    updateLoadingStatus('Extracting with 7-Zip...');
    
    exec('where 7z', (error) => {
        if (!error) {
            exec(`7z x "${tarPath}" -o"${extractTo}" -y`, (err) => {
                if (err) {
                    console.error('7-Zip extraction failed:', err);
                    extractWithTar(tarPath, extractTo, callback);
                } else {
                    callback(null);
                }
            });
        } else {
            extractWithTar(tarPath, extractTo, callback);
        }
    });
}

function extractWithTar(tarPath, extractTo, callback) {
    updateLoadingStatus('Extracting with tar...');
    
    const downloadPathQuoted = `"${tarPath}"`;
    const extractDirQuoted = `"${extractTo}"`;
    
    exec(`tar -xzvf ${downloadPathQuoted} -C ${extractDirQuoted}`, (err) => {
        if (err) {
            console.error('Tar extraction failed:', err);
            updateLoadingStatus('Error: Unable to extract Tor. Please install 7-Zip or tar.');
            callback(err);
            return;
        }
        callback(null);
    });
}

function installAndRunTor(callback) {
    updateLoadingStatus('Downloading Tor...');
    
    const file = fs.createWriteStream(DOWNLOAD_PATH);
    
    const request = https.get(TOR_DOWNLOAD_URL, (response) => {
        if (response.statusCode !== 200) {
            console.error(`Error downloading Tor package. HTTP Code : ${response.statusCode}`);
            updateLoadingStatus('Error downloading Tor');
            return;
        }

        response.pipe(file);
        file.on('finish', () => {
            file.close(() => {
                updateLoadingStatus('Download complete, extracting...');
                
                if (!fs.existsSync(EXTRACT_DIR)) {
                    fs.mkdirSync(EXTRACT_DIR, { recursive: true });
                }

                updateLoadingStatus('Extracting Tor package...');
                
                extractTarGzWindows(DOWNLOAD_PATH, EXTRACT_DIR, (err) => {
                    if (err) {
                        console.error('Extraction failed:', err);
                        updateLoadingStatus('Error extracting Tor');
                        return;
                    }
                    
                    updateLoadingStatus('Extraction complete, starting Tor...');
                    
                    const torExePath = path.join(EXTRACT_DIR, 'tor', 'tor.exe');
                    if (fs.existsSync(torExePath)) {
                        startTor(callback);
                    } else {
                        console.error('Tor executable not found after extraction.');
                        updateLoadingStatus('Tor executable not found after extraction');
                    }
                });
            });
        });
    }).on('error', (err) => {
        console.error('Error downloading Tor :', err);
        updateLoadingStatus('Connection error during download');
    });

    request.setTimeout(30000, () => {
        request.destroy();
        updateLoadingStatus('Download timeout. Please check your internet connection.');
    });
}

function startTor(callback) {
    updateLoadingStatus('Connecting to Tor network...');
    const torExePath = path.join(EXTRACT_DIR, 'tor', 'tor.exe');
    const torProcess = spawn(torExePath, ['--SocksPort', TOR_PORT, '--ControlPort', TOR_CONTROL_PORT], { detached: true });
    
    torProcess.stdout.on('data', (data) => {
        const output = data.toString();
        
        if (output.includes('Bootstrapped 100%')) {
            updateLoadingStatus('Tor connection established!');
            setTimeout(() => {
                callback();
            }, 1000);
        } else if (output.includes('Bootstrapped')) {
            updateLoadingStatus('Connecting to Tor network...');
        }
    });

    torProcess.stderr.on('data', (data) => {
        console.error('Tor error:', data.toString());
    });

    torProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Tor exited with code ${code}`);
            updateLoadingStatus('Error starting Tor');
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

function createLoadingWindow() {
    loadingWindow = new BrowserWindow({
        width: 500,
        height: 300,
        resizable: false,
        frame: false,
        transparent: true,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false
        },
        icon: path.join(__dirname, 'img', 'app-icon.ico'),
        center: true,
        skipTaskbar: false,
        alwaysOnTop: true,
        minimizable: false,
        maximizable: false,
        fullscreenable: false
    });

    loadingWindow.loadFile('loading.html');
    
    loadingWindow.once('ready-to-show', () => {
        loadingWindow.show();
        loadingWindow.focus();
    });
    
    loadingWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Loading window failed to load:', errorDescription);
    });
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'img', 'app-icon.ico'),
        title: 'Discord Tor'
    });

    mainWindow.webContents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    mainWindow.loadURL('https://discord.com/app');
    
    if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.close();
    }
}

app.whenReady().then(() => {
    createLoadingWindow();
    
    checkIfTorRunning((isTorRunning) => {
        if (isTorRunning) {
            updateLoadingStatus('Tor already running, connecting...');
            configureTorProxy();
            createMainWindow();
        } else {
            installAndRunTor(() => {
                configureTorProxy();
                createMainWindow();
            });
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});