# Guía de Despliegue, Empaquetado y Compilación - INVENTARIO CDS

Esta guía detalla el procedimiento paso a paso para configurar el entorno de desarrollo, ejecutar la aplicación localmente, empaquetar ejecutables portables e instaladores de Windows (NSIS) y realizar actualizaciones en caliente en puestos de trabajo cliente.

---

## 1. Requisitos Previos del Sistema

Antes de iniciar, asegúrese de contar con los siguientes componentes en el equipo de desarrollo/compilación:

- **Sistema Operativo:** Windows 10 / 11 (64-bit) o Windows Server 2016+.
- **Node.js:** Versión LTS recomendada `v20.x` o superior (mínimo `v18.0.0`).
- **NPM:** `v9.x` o `v10.x` (incluido con Node.js).
- **Git:** Para control de versiones (`git version 2.40+`).
- **Herramientas de Compilación C++ (Opcional, para reconstrucción nativa de `better-sqlite3` si fuese necesario):**
  ```powershell
  npm install -g --production windows-build-tools
  ```

---

## 2. Configuración Inicial del Entorno

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/WILORTIZ/inventario-de-escritorio-.git
   cd inventario-de-escritorio-
   ```

2. **Instalación de dependencias de Node.js:**
   ```bash
   npm install
   ```
   > **Nota:** Si ocurre algún conflicto con librerías nativas de SQLite, ejecutar:
   > ```bash
   > npx electron-rebuild
   > ```

---

## 3. Ejecución en Modo Desarrollo

Para lanzar la aplicación con recarga y consola de depuración abierta:

```bash
npm start
```

- Esto inicia el proceso principal de Electron (`electron main.js`).
- El servidor HTTP Express se enlaza automáticamente al puerto dinámico o `3000`.
- Se abrirá la ventana gráfica de 1400x900px centrada en pantalla.

---

## 4. Scripts Disponibles en `package.json`

| Comando | Descripción |
| :--- | :--- |
| `npm start` | Inicia la aplicación en modo desarrollo directo con Electron. |
| `npm run pack:dir` | Genera la versión desempaquetada lista para ejecución rápida en `dist/win-unpacked/`. |
| `npm run build` | Compila y genera el Instalador NSIS (`.exe`) y el Portable en la carpeta `dist/`. |
| `npm test` | Ejecuta la suite de pruebas unitarias y de integración. |

---

## 5. Proceso de Compilación y Generación de Binarios

### 5.1. Generación de Directorio Desempaquetado (`pack:dir`)
Ideal para pruebas rápidas de distribución sin esperar el proceso de compresión de NSIS:

```powershell
npm run pack:dir
```
**Resultado:** Se crea la carpeta `dist/win-unpacked/` que contiene el ejecutable `INVENTARIO CDS.exe` y todos sus recursos binarios.

### 5.2. Generación del Instalador Oficial de Producción (`build`)
Para generar los archivos instalables que se entregan al cliente final:

```powershell
npm run build
```

**Artefactos Generados en `dist/`:**
1. **Instalador Asistido:** `INVENTARIO CDS Setup 1.5.0.exe` (Permite elegir ruta de instalación o instalar por usuario).
2. **Ejecutable Portable:** `INVENTARIO CDS 1.5.0.exe` (No requiere instalación, corre directo desde memoria USB o disco local).
3. **Paquete ASAR de Recursos:** `dist/win-unpacked/resources/app.asar`.

---

## 6. Procedimiento de Actualización Rápida en Clientes

Cuando solo se han modificado archivos de frontend (`public/`), rutas de Express (`server/`) o scripts de Electron (`main.js`), no es estrictamente necesario reinstalar todo el software en cada equipo:

### Método 1: Reemplazo del Archivo `app.asar` (Recomendado - 5 segundos)
1. En el equipo de desarrollo, ejecute:
   ```powershell
   npm run pack:dir
   ```
2. Copie el archivo generado en:
   `dist/win-unpacked/resources/app.asar`
3. En el equipo del cliente, cierre la aplicación y pegue el nuevo `app.asar` en:
   `C:\Users\<Usuario>\AppData\Local\Programs\INVENTARIO CDS\resources\app.asar`
4. Abra la aplicación: los cambios estarán aplicados al 100% manteniendo intacta la base de datos de usuario.

### Método 2: Ejecución del Nuevo Instalador
1. Ejecute `INVENTARIO CDS Setup 1.5.0.exe`.
2. El instalador detecta la versión previa y actualiza los binarios automáticamente sin borrar `%APPDATA%\INVENTARIO CDS\inventario.db`.

---

## 7. Configuración de `electron-builder`

El comportamiento de empaquetado se encuentra definido en `package.json`:

```json
"build": {
  "appId": "com.inventariocds.app",
  "productName": "INVENTARIO CDS",
  "directories": {
    "output": "dist"
  },
  "files": [
    "main.js",
    "preload.js",
    "server/**/*",
    "public/**/*",
    "package.json"
  ],
  "extraResources": [
    {
      "from": "assets/icons",
      "to": "icons"
    }
  ],
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      },
      {
        "target": "portable",
        "arch": ["x64"]
      }
    ],
    "icon": "public/favicon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "INVENTARIO CDS"
  }
}
```

---

## 8. Solución de Problemas Frecuentes (Troubleshooting)

### Error: `Node-gyp` o `better-sqlite3 / sqlite3` mismatch
- **Causa:** La versión de Node.js del sistema no coincide con la versión interna de Node.js embebida en Electron.
- **Solución:**
  ```powershell
  npm install -D electron-rebuild
  npx electron-rebuild -f -w sqlite3
  ```

### Error: La base de datos no guarda datos en producción
- **Causa:** Intentar escribir en `Program Files` (solo lectura).
- **Solución:** Asegurarse de que `database.js` use `app.getPath('userData')` para ubicar `inventario.db` dentro de `%APPDATA%`.
