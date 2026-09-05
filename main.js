const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function setupDatabasePath() {
    try {
        if (app.isPackaged) {
            const userDataPath = app.getPath('userData');
            if (!fs.existsSync(userDataPath)) {
                fs.mkdirSync(userDataPath, { recursive: true });
            }
            const dbDest = path.join(userDataPath, 'inventario.db');
            
            // Si la base de datos de usuario no existe aún, copiamos la inicial empaquetada
            if (!fs.existsSync(dbDest)) {
                const bundledDbPath = path.join(process.resourcesPath, 'inventario.db');
                const localDbPath = path.join(__dirname, 'inventario.db');
                
                if (fs.existsSync(bundledDbPath)) {
                    fs.copyFileSync(bundledDbPath, dbDest);
                } else if (fs.existsSync(localDbPath)) {
                    fs.copyFileSync(localDbPath, dbDest);
                }
            }
            process.env.DB_PATH = dbDest;
        } else {
            process.env.DB_PATH = path.join(__dirname, 'inventario.db');
        }
        console.log(`[Database Path] ${process.env.DB_PATH}`);
    } catch (e) {
        console.error('Error configurando ruta de base de datos:', e);
    }
}

function startInternalServer() {
    return new Promise((resolve) => {
        setupDatabasePath();
        try {
            require('./src/api/server.js');
            // Damos 500ms para asegurar que el socket HTTP esté listo
            setTimeout(resolve, 600);
        } catch (err) {
            console.error('Error al iniciar el servidor interno:', err);
            resolve();
        }
    });
}

async function createWindow() {
    await startInternalServer();

    mainWindow = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1080,
        minHeight: 700,
        title: "INVENTARIO - Sistema Empresarial de Gestión Física y Vencimientos CDS",
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Manejador nativo de descargas para Electron
    mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
        const downloadsFolder = app.getPath('downloads');
        let targetFilePath = path.join(downloadsFolder, item.getFilename());
        
        // Si ya existe, agregar sufijo numerico para no sobreescribir sin aviso
        let counter = 1;
        const ext = path.extname(targetFilePath);
        const base = path.basename(targetFilePath, ext);
        while (fs.existsSync(targetFilePath)) {
            targetFilePath = path.join(downloadsFolder, `${base}_(${counter})${ext}`);
            counter++;
        }

        item.setSavePath(targetFilePath);

        item.once('done', (event, state) => {
            if (state === 'completed') {
                console.log(`[Descarga Exitosa] Guardado en: ${targetFilePath}`);
            } else {
                console.error(`[Error de Descarga] Estado: ${state}`);
            }
        });
    });

    mainWindow.loadURL('http://localhost:3000');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(createWindow);

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}
