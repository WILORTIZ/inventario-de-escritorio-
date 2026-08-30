# Sistema Empresarial de Gestión Física y Control de Vencimientos CDS

Sistema de control de inventarios, existencias, trazabilidad de movimientos y monitoreo de vencimientos desarrollado con arquitectura offline y empaquetado autónomo en **Electron + Node.js / Express + SQLite + SheetJS**.

---

## 🚀 Características Principales

1. **Gestión Integral de Inventario:**
   - Control estricto de existencias físicas en bodega central (CDS) y sedes operativas.
   - Catálogo maestro de productos con clasificación automática y asignación de ubicaciones (`ESTANTERIA + NIVEL`).
2. **Kardex y Trazabilidad Transaccional:**
   - Registro de Entradas, Entregas Operativas, Devoluciones, Ajustes y Disposición Final (Scrap).
   - Visualización de Código de Ítem y Nombre en todas las vistas y reportes.
3. **Control y Alerta de Vencimientos:**
   - Monitoreo de lotes de productos perecederos, químicos y sellantes.
   - Cálculo automático de días restantes y semáforo de caducidad.
4. **Módulo de Base de Datos y Copias de Seguridad:**
   - Descarga directa y respaldo binario SQLite (`.db`).
   - Exportación nativa multi-hoja en Excel (`.xlsx`) y formato `.json`.
   - Importador masivo desde Excel con soporte para cargue inicial o actualización de catálogo.
   - Subida y restauración directa de copias de seguridad `.db`.

---

## 🛠️ Requisitos e Instalación

### Modo Desarrollo:
```bash
# Clonar repositorio
git clone https://github.com/WILORTIZ/inventario-de-escritorio-.git

# Instalar dependencias
npm install

# Iniciar en modo desarrollo
npm start
```

### Compilar Ejecutables Autónomos (.exe para Windows):
```bash
npm run build
```
Los ejecutables se generan en la carpeta `dist/` y `Versiones_Compilacion/`.

---

## 📁 Estructura del Proyecto

* `main.js`: Proceso principal de Electron con manejador nativo de descargas y persistencia SQLite.
* `src/api/server.js`: Servidor Express local con API REST transaccional SQLite.
* `src/public/`: Interfaz de usuario interactiva (HTML5, Bootstrap 5, SheetJS).
* `inventario.db`: Base de datos SQLite inicial con catálogo oficial y existencias cargadas.
* `Inventario_Gio.xlsm`: Plantilla y libro de trabajo sincronizado con macros.
