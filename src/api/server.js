const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'inventario.db');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Helper para consultas Promise
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
    });
});

// Inicializador de base de datos SQLite autocontenida (0 configuraciones requeridas)
const db = new sqlite3.Database(DB_PATH, async (err) => {
    if (err) {
        console.error('Error al conectar con SQLite:', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite:', DB_PATH);
        await runDatabaseMigrations();
    }
});

// ==============================================================
// SISTEMA DE MIGRACIONES AUTOMÁTICAS Y SEGURAS (PARA CUALQUIER PC / ACTUALIZACIÓN)
// ==============================================================
async function runDatabaseMigrations() {
    console.log('[MIGRACIONES] Verificando esquema y ejecutando migraciones automáticas...');
    try {
        // 1. Creación de tablas base si no existen
        await dbRun(`
            CREATE TABLE IF NOT EXISTS items (
                codigo INTEGER PRIMARY KEY,
                nombre TEXT NOT NULL,
                categoria TEXT NOT NULL,
                subcategoria TEXT DEFAULT 'General',
                unidad_medida TEXT NOT NULL,
                marca TEXT DEFAULT 'Generico',
                referencia TEXT DEFAULT '-',
                ubicacion_cds TEXT DEFAULT 'A1',
                aplica_vencimiento INTEGER DEFAULT 0,
                fecha_vencimiento_default TEXT,
                stock_minimo INTEGER DEFAULT 0,
                estado TEXT DEFAULT 'Activo',
                observaciones TEXT,
                fecha_registro TEXT,
                sede TEXT DEFAULT 'Sede Suroriental',
                tipo_inventario TEXT DEFAULT 'CDS'
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS bodegas (
                codigo TEXT PRIMARY KEY,
                nombre TEXT NOT NULL UNIQUE,
                ubicacion TEXT,
                responsable TEXT,
                estado TEXT DEFAULT 'Activa',
                observaciones TEXT,
                es_central INTEGER DEFAULT 0,
                sede TEXT DEFAULT 'Sede Suroriental',
                tipo_inventario TEXT DEFAULT 'CDS'
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS proyectos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL UNIQUE,
                responsable TEXT,
                estado TEXT DEFAULT 'Activo',
                observaciones TEXT,
                sede TEXT DEFAULT 'Sede Suroriental',
                tipo_inventario TEXT DEFAULT 'CDS'
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS movimientos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                n_movimiento TEXT NOT NULL UNIQUE,
                fecha TEXT NOT NULL,
                hora TEXT NOT NULL,
                tipo_movimiento TEXT NOT NULL,
                codigo_item INTEGER NOT NULL,
                nombre_item TEXT NOT NULL,
                cantidad REAL NOT NULL,
                unidad TEXT NOT NULL,
                bodega_origen TEXT,
                bodega_destino TEXT,
                causal_condicion TEXT,
                ubicacion_cds TEXT,
                proyecto_destino TEXT,
                responsable TEXT,
                persona_recibe_devuelve TEXT,
                documento_referencia TEXT,
                observaciones TEXT,
                fecha_vencimiento_lote TEXT,
                sede TEXT DEFAULT 'Sede Suroriental',
                tipo_inventario TEXT DEFAULT 'CDS',
                creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (codigo_item) REFERENCES items(codigo)
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS control_vencimientos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo_item INTEGER NOT NULL,
                nombre_item TEXT NOT NULL,
                bodega TEXT DEFAULT 'CDS',
                fecha_ingreso TEXT NOT NULL,
                fecha_vencimiento TEXT NOT NULL,
                cant_inicial REAL NOT NULL,
                cant_disponible REAL NOT NULL,
                estado TEXT,
                observaciones TEXT,
                n_movimiento_origen TEXT,
                sede TEXT DEFAULT 'Sede Suroriental',
                tipo_inventario TEXT DEFAULT 'CDS',
                FOREIGN KEY (codigo_item) REFERENCES items(codigo)
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS sedes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE NOT NULL,
                nombre TEXT NOT NULL,
                direccion TEXT,
                responsable TEXT,
                estado TEXT DEFAULT 'Activa'
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS tipos_inventario (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE NOT NULL,
                nombre TEXT NOT NULL,
                descripcion TEXT
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS traslados_pendientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                n_traslado TEXT NOT NULL UNIQUE,
                fecha_solicitud TEXT NOT NULL,
                hora_solicitud TEXT NOT NULL,
                sede_origen TEXT NOT NULL,
                tipo_inventario_origen TEXT NOT NULL,
                bodega_origen TEXT NOT NULL DEFAULT 'CDS',
                sede_destino TEXT NOT NULL,
                tipo_inventario_destino TEXT NOT NULL,
                bodega_destino TEXT NOT NULL DEFAULT 'CDS',
                codigo_item INTEGER NOT NULL,
                nombre_item TEXT NOT NULL,
                cantidad REAL NOT NULL,
                unidad TEXT NOT NULL,
                responsable_solicita TEXT NOT NULL,
                responsable_recibe TEXT,
                documento_referencia TEXT,
                observaciones TEXT,
                estado TEXT DEFAULT 'PENDIENTE',
                fecha_resolucion TEXT,
                motivo_rechazo TEXT,
                n_movimiento_salida TEXT,
                n_movimiento_entrada TEXT,
                creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (codigo_item) REFERENCES items(codigo)
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS listas_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,
                valor TEXT NOT NULL,
                orden INTEGER DEFAULT 0
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cedula TEXT UNIQUE,
                username TEXT UNIQUE,
                password TEXT NOT NULL,
                nombre TEXT NOT NULL,
                apellido TEXT NOT NULL DEFAULT '',
                correo TEXT NOT NULL DEFAULT '',
                sede TEXT NOT NULL DEFAULT 'Sede Suroriental',
                rol TEXT NOT NULL DEFAULT 'ADMINISTRADOR DE SEDE',
                estado TEXT DEFAULT 'Activo',
                permisos TEXT DEFAULT 'SEDE_ALL',
                permisos_adicionales TEXT DEFAULT '[]',
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS permisos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE NOT NULL,
                nombre TEXT NOT NULL,
                descripcion TEXT DEFAULT '',
                categoria TEXT DEFAULT 'GENERAL',
                estado TEXT DEFAULT 'Activo',
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS causales_movimientos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo_movimiento TEXT NOT NULL,
                nombre TEXT NOT NULL,
                descripcion TEXT DEFAULT '',
                estado TEXT DEFAULT 'Activo',
                orden INTEGER DEFAULT 0,
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Comprobación y migración de columnas en tablas existentes de versiones previas
        const columnasPorTabla = {
            items: [
                { name: 'sede', type: "TEXT DEFAULT 'Sede Suroriental'" },
                { name: 'tipo_inventario', type: "TEXT DEFAULT 'CDS'" },
                { name: 'subcategoria', type: "TEXT DEFAULT 'General'" },
                { name: 'marca', type: "TEXT DEFAULT 'Generico'" },
                { name: 'referencia', type: "TEXT DEFAULT '-'" },
                { name: 'aplica_vencimiento', type: "INTEGER DEFAULT 0" },
                { name: 'fecha_vencimiento_default', type: "TEXT" },
                { name: 'stock_minimo', type: "INTEGER DEFAULT 0" },
                { name: 'estado', type: "TEXT DEFAULT 'Activo'" },
                { name: 'observaciones', type: "TEXT" },
                { name: 'fecha_registro', type: "TEXT" }
            ],
            bodegas: [
                { name: 'sede', type: "TEXT DEFAULT 'Sede Suroriental'" },
                { name: 'tipo_inventario', type: "TEXT DEFAULT 'CDS'" },
                { name: 'es_central', type: "INTEGER DEFAULT 0" },
                { name: 'ubicacion', type: "TEXT" },
                { name: 'responsable', type: "TEXT" },
                { name: 'estado', type: "TEXT DEFAULT 'Activa'" },
                { name: 'observaciones', type: "TEXT" }
            ],
            proyectos: [
                { name: 'sede', type: "TEXT DEFAULT 'Sede Suroriental'" },
                { name: 'tipo_inventario', type: "TEXT DEFAULT 'CDS'" },
                { name: 'responsable', type: "TEXT" },
                { name: 'estado', type: "TEXT DEFAULT 'Activo'" },
                { name: 'observaciones', type: "TEXT" }
            ],
            movimientos: [
                { name: 'sede', type: "TEXT DEFAULT 'Sede Suroriental'" },
                { name: 'tipo_inventario', type: "TEXT DEFAULT 'CDS'" },
                { name: 'bodega_origen', type: "TEXT" },
                { name: 'bodega_destino', type: "TEXT" },
                { name: 'causal_condicion', type: "TEXT" },
                { name: 'ubicacion_cds', type: "TEXT" },
                { name: 'proyecto_destino', type: "TEXT" },
                { name: 'responsable', type: "TEXT" },
                { name: 'persona_recibe_devuelve', type: "TEXT" },
                { name: 'documento_referencia', type: "TEXT" },
                { name: 'observaciones', type: "TEXT" },
                { name: 'fecha_vencimiento_lote', type: "TEXT" },
                { name: 'creado_en', type: "DATETIME" }
            ],
            control_vencimientos: [
                { name: 'sede', type: "TEXT DEFAULT 'Sede Suroriental'" },
                { name: 'tipo_inventario', type: "TEXT DEFAULT 'CDS'" },
                { name: 'bodega', type: "TEXT DEFAULT 'CDS'" },
                { name: 'n_movimiento_origen', type: "TEXT" },
                { name: 'observaciones', type: "TEXT" },
                { name: 'estado', type: "TEXT" }
            ],
            usuarios: [
                { name: 'cedula', type: "TEXT" },
                { name: 'apellido', type: "TEXT NOT NULL DEFAULT ''" },
                { name: 'correo', type: "TEXT NOT NULL DEFAULT ''" },
                { name: 'sede', type: "TEXT NOT NULL DEFAULT 'Sede Suroriental'" },
                { name: 'rol', type: "TEXT NOT NULL DEFAULT 'ADMINISTRADOR DE SEDE'" },
                { name: 'estado', type: "TEXT DEFAULT 'Activo'" },
                { name: 'permisos', type: "TEXT DEFAULT 'SEDE_ALL'" },
                { name: 'permisos_adicionales', type: "TEXT DEFAULT '[]'" },
                { name: 'fecha_creacion', type: "DATETIME" }
            ]
        };

        for (const [tableName, cols] of Object.entries(columnasPorTabla)) {
            const existingCols = await dbAll(`PRAGMA table_info(${tableName})`);
            const colNames = existingCols.map(c => c.name);
            for (const col of cols) {
                if (!colNames.includes(col.name)) {
                    console.log(`[MIGRACIONES] Añadiendo columna faltante '${col.name}' a '${tableName}'...`);
                    try {
                        await dbRun(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type}`);
                    } catch (errCol) {
                        console.warn(`[MIGRACIONES] Nota al alterar ${tableName}.${col.name}:`, errCol.message);
                    }
                }
            }
        }

        // 3. Normalización de valores NULL en registros antiguos
        await dbRun(`UPDATE items SET sede = 'Sede Suroriental' WHERE sede IS NULL OR sede = ''`);
        await dbRun(`UPDATE items SET tipo_inventario = 'CDS' WHERE tipo_inventario IS NULL OR tipo_inventario = ''`);
        await dbRun(`UPDATE movimientos SET sede = 'Sede Suroriental' WHERE sede IS NULL OR sede = ''`);
        await dbRun(`UPDATE movimientos SET tipo_inventario = 'CDS' WHERE tipo_inventario IS NULL OR tipo_inventario = ''`);
        await dbRun(`UPDATE bodegas SET sede = 'Sede Suroriental' WHERE sede IS NULL OR sede = ''`);
        await dbRun(`UPDATE bodegas SET tipo_inventario = 'CDS' WHERE tipo_inventario IS NULL OR tipo_inventario = ''`);
        await dbRun(`UPDATE proyectos SET sede = 'Sede Suroriental' WHERE sede IS NULL OR sede = ''`);
        await dbRun(`UPDATE proyectos SET tipo_inventario = 'CDS' WHERE tipo_inventario IS NULL OR tipo_inventario = ''`);
        await dbRun(`UPDATE control_vencimientos SET sede = 'Sede Suroriental' WHERE sede IS NULL OR sede = ''`);
        await dbRun(`UPDATE control_vencimientos SET tipo_inventario = 'CDS' WHERE tipo_inventario IS NULL OR tipo_inventario = ''`);
        await dbRun(`UPDATE usuarios SET sede = 'Sede Suroriental' WHERE sede IS NULL OR sede = ''`);
        await dbRun(`UPDATE usuarios SET permisos_adicionales = '[]' WHERE permisos_adicionales IS NULL OR permisos_adicionales = ''`);

        // Comprobar bodega central
        const centralCheck = await dbGet(`SELECT COUNT(*) as total, SUM(es_central) as centralCount FROM bodegas`);
        if (centralCheck && centralCheck.total > 0 && (!centralCheck.centralCount || centralCheck.centralCount === 0)) {
            await dbRun(`UPDATE bodegas SET es_central = 1 WHERE codigo = 'BOD-001' OR rowid = 1`);
        }

        // 4. Índices
        await dbRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_cedula ON usuarios(cedula)`);
        await dbRun(`CREATE INDEX IF NOT EXISTS idx_items_sede_tipo ON items(sede, tipo_inventario)`);
        await dbRun(`CREATE INDEX IF NOT EXISTS idx_mov_sede_tipo ON movimientos(sede, tipo_inventario)`);
        await dbRun(`CREATE INDEX IF NOT EXISTS idx_causales_tipo ON causales_movimientos(tipo_movimiento, estado)`);

        // 5. Precarga de Datos Maestros (Solo si las tablas están vacías)
        // Sedes
        const sedesBase = [
            ['SUR', 'Sede Suroriental', 'Sector Suroriental', 'Administrador Regional', 'Activa'],
            ['MED', 'Sede Medellín', 'Medellín Centro Operativo', 'Administrador Regional', 'Activa']
        ];
        for (const s of sedesBase) {
            await dbRun(`INSERT OR IGNORE INTO sedes (codigo, nombre, direccion, responsable, estado) VALUES (?, ?, ?, ?, ?)`, s);
        }

        // Tipos de Inventario
        const tiposBase = [
            ['CDS', 'Inventario CDS', 'Inventario y Almacenamiento Central CDS'],
            ['MOVILIDAD', 'Inventario Movilidad', 'Inventario Operativo de Movilidad y Transporte']
        ];
        for (const t of tiposBase) {
            await dbRun(`INSERT OR IGNORE INTO tipos_inventario (codigo, nombre, descripcion) VALUES (?, ?, ?)`, t);
        }

        // Bodegas iniciales
        const bodegasCount = await dbGet(`SELECT COUNT(*) as count FROM bodegas`);
        if (!bodegasCount || bodegasCount.count === 0) {
            const bodegas = [
                ['BOD-001', 'CDS', 'Sede Principal / Almacén Central', 'Administrador CDS', 'Activa', 'Centro de Distribución y Almacenamiento Principal (Control Oficial)', 1],
                ['BOD-002', 'AOM', 'Sede Operativa AOM', 'Líder Operativo AOM', 'Activa', 'Bodega de Operaciones y Mantenimiento', 0],
                ['BOD-003', 'PROYECTOS', 'Frentes de Obra e Infraestructura', 'Coordinador de Proyectos', 'Activa', 'Destino de materiales y herramientas para proyectos', 0],
                ['BOD-004', 'DISPOSICION FINAL', 'Área de Bajas y Scrap', 'Control Calidad / SST', 'Activa', 'Destino exclusivo de bajas por ítems dañados, gastados o vencidos', 0],
                ['BOD-005', 'MOVILIDAD', 'Vehículos y Flota Operativa', 'Logística / Transporte', 'Activa', 'Bodega operativa para gestión de movilidad y transporte', 0],
                ['BOD-006', 'TRASLADOS', 'Tránsito y Reubicación', 'Logística / Despachos', 'Activa', 'Bodega temporal para traslados y movimientos intersedes', 0]
            ];
            for (const b of bodegas) {
                await dbRun(`INSERT OR IGNORE INTO bodegas (codigo, nombre, ubicacion, responsable, estado, observaciones, es_central) VALUES (?, ?, ?, ?, ?, ?, ?)`, b);
            }
        }

        // Listas Config maestras
        const listasPorDefecto = [
            ['categoria', 'Herramientas', 1],
            ['categoria', 'Tornilleria', 2],
            ['categoria', 'Materiales', 3],
            ['categoria', 'Consumibles', 4],
            ['categoria', 'Repuestos', 5],
            ['categoria', 'Elementos electricos', 6],
            ['categoria', 'Elementos de seguridad', 7],
            ['categoria', 'Cableado', 8],
            ['categoria', 'Otros', 9],
            ['unidad_medida', 'Unidad', 1],
            ['unidad_medida', 'Caja', 2],
            ['unidad_medida', 'Paquete', 3],
            ['unidad_medida', 'Metro', 4],
            ['unidad_medida', 'Kilogramo', 5],
            ['unidad_medida', 'Litro', 6],
            ['unidad_medida', 'Rollo', 7],
            ['unidad_medida', 'Otro', 8],
            ['ubicacion_cds', 'A1', 1],
            ['ubicacion_cds', 'A2', 2],
            ['ubicacion_cds', 'A3', 3],
            ['ubicacion_cds', 'A4', 4],
            ['ubicacion_cds', 'A5', 5],
            ['ubicacion_cds', 'B1', 6],
            ['ubicacion_cds', 'B2', 7],
            ['ubicacion_cds', 'B3', 8],
            ['ubicacion_cds', 'B4', 9],
            ['ubicacion_cds', 'B5', 10],
            ['ubicacion_cds', 'C1', 11],
            ['ubicacion_cds', 'C2', 12],
            ['ubicacion_cds', 'C3', 13],
            ['ubicacion_cds', 'C4', 14],
            ['ubicacion_cds', 'C5', 15],
            ['ubicacion_cds', 'D1', 16],
            ['ubicacion_cds', 'D2', 17],
            ['ubicacion_cds', 'D3', 18],
            ['ubicacion_cds', 'D4', 19],
            ['ubicacion_cds', 'D5', 20],
            ['ubicacion_cds', 'T1', 21],
            ['ubicacion_cds', 'T2', 22],
            ['ubicacion_cds', 'T3', 23],
            ['ubicacion_cds', 'T4', 24],
            ['ubicacion_cds', 'T5', 25],
            ['causal_disposicion', 'Dañado', 1],
            ['causal_disposicion', 'Gastado Interno', 2],
            ['causal_disposicion', 'Vencido', 3],
            ['causal_disposicion', 'Deterioro Operativo / Merma', 4],
            ['causal_disposicion', 'Inutilizable / Scrap', 5]
        ];
        for (const tipo of ['categoria', 'unidad_medida', 'ubicacion_cds', 'causal_disposicion']) {
            const countRow = await dbGet(`SELECT COUNT(*) as count FROM listas_config WHERE tipo = ?`, [tipo]);
            if (!countRow || countRow.count === 0) {
                for (const l of listasPorDefecto.filter(item => item[0] === tipo)) {
                    await dbRun(`INSERT INTO listas_config (tipo, valor, orden) VALUES (?, ?, ?)`, l);
                }
            }
        }

        // Permisos del sistema
        const defaultPermisos = [
            ['ACCESO_MULTI_SEDE', 'Acceso Multi-Sedes (Ver Todas las Sedes)', 'Permite alternar entre sedes y realizar transacciones en cualquier sede.', 'SEDES'],
            ['CREAR_ITEMS', 'Creación de Ítems', 'Permite registrar nuevos productos en el catálogo maestro.', 'CATALOGO'],
            ['GESTIONAR_TRASLADOS', 'Aprobación de Traslados', 'Permite emitir, aceptar o rechazar traslados entre bodegas centrales.', 'TRASLADOS'],
            ['ELIMINAR_MOVIMIENTOS', 'Eliminar / Deshacer Movimientos', 'Permite anular transacciones del libro diario de movimientos.', 'MOVIMIENTOS'],
            ['EXPORTAR_BACKUPS', 'Copias de Seguridad (Backups)', 'Permite exportar y restaurar la base de datos SQLite y respaldos.', 'SISTEMA'],
            ['ADMINISTRAR_BODEGAS', 'Configurar Bodegas y Proyectos', 'Permite crear y gestionar bodegas satélites y frentes de obra.', 'BODEGAS']
        ];
        for (const p of defaultPermisos) {
            await dbRun(`INSERT OR IGNORE INTO permisos (codigo, nombre, descripcion, categoria) VALUES (?, ?, ?, ?)`, p);
        }

        // Causales de movimientos
        const causalesCount = await dbGet(`SELECT COUNT(*) as count FROM causales_movimientos`);
        if (!causalesCount || causalesCount.count === 0) {
            const defaultCausales = [
                ['ENTRADA', 'COMPRA / PROVEEDOR', 'Ingreso por compra a proveedor', 'Activo', 1],
                ['ENTRADA', 'INVENTARIO INICIAL', 'Cargue inicial o conteo de arranque', 'Activo', 2],
                ['ENTRADA', 'DOTACION / HERRAMIENTAS NUEVAS', 'Ingreso de dotación o herramientas nuevas', 'Activo', 3],
                ['ENTRADA', 'DONACION / OTRO INGRESO', 'Otros ingresos y donaciones', 'Activo', 4],
                ['ENTREGA', 'USO EN OBRA / PROYECTO', 'Despacho para ejecución de obra o proyecto', 'Activo', 1],
                ['ENTREGA', 'DOTACION PERSONAL', 'Entrega de dotación a personal', 'Activo', 2],
                ['ENTREGA', 'MANTENIMIENTO OPERATIVO', 'Uso en mantenimiento correctivo o preventivo', 'Activo', 3],
                ['ENTREGA', 'CONSUMO GENERAL', 'Consumo operativo general', 'Activo', 4],
                ['DEVOLUCION', 'SOBRANTE DE OBRA', 'Material sobrante devuelto por proyecto', 'Activo', 1],
                ['DEVOLUCION', 'CAMBIO DE MATERIAL', 'Devolución por cambio de referencia', 'Activo', 2],
                ['DEVOLUCION', 'DESPACHO ERRADO', 'Retorno por error en despacho inicial', 'Activo', 3],
                ['DEVOLUCION', 'HERRAMIENTA REINTEGRADA', 'Reintegro de herramienta al almacén', 'Activo', 4],
                ['DEVOLUCION', 'OTRA DEVOLUCION', 'Otras causales de devolución', 'Activo', 5],
                ['DISPOSICION FINAL', 'DAÑADO / ROTO', 'Baja por daño físico o rotura', 'Activo', 1],
                ['DISPOSICION FINAL', 'CADUCADO / VENCIDO', 'Baja por fecha de vencimiento cumplida', 'Activo', 2],
                ['DISPOSICION FINAL', 'OBSOLETO / SCRAP', 'Material en desuso o scrap', 'Activo', 3],
                ['DISPOSICION FINAL', 'DEFECTUOSO DE FABRICA', 'Falla de fabricación irreparable', 'Activo', 4],
                ['DISPOSICION FINAL', 'DESGASTE NO REPARABLE', 'Fin de vida útil por desgaste', 'Activo', 5],
                ['AJUSTE POSITIVO', 'CONTEO FISICO / AUDITORIA', 'Ajuste positivo por auditoría física', 'Activo', 1],
                ['AJUSTE POSITIVO', 'SOBRANTE DETECTADO EN BODEGA', 'Sobrante no registrado', 'Activo', 2],
                ['AJUSTE POSITIVO', 'CORRECCION DE SALDO', 'Corrección contable de saldo', 'Activo', 3],
                ['AJUSTE NEGATIVO', 'CONTEO FISICO / AUDITORIA', 'Ajuste negativo por auditoría física', 'Activo', 1],
                ['AJUSTE NEGATIVO', 'FALTANTE DETECTADO EN BODEGA', 'Faltante no justificado', 'Activo', 2],
                ['AJUSTE NEGATIVO', 'MERMA / EVAPORACION', 'Pérdida natural por evaporación o merma', 'Activo', 3],
                ['AJUSTE NEGATIVO', 'CORRECCION DE SALDO', 'Corrección contable de saldo', 'Activo', 4]
            ];
            for (const c of defaultCausales) {
                await dbRun(`INSERT INTO causales_movimientos (tipo_movimiento, nombre, descripcion, estado, orden) VALUES (?, ?, ?, ?, ?)`, c);
            }
        }

        // Usuarios iniciales (Preservando usuarios existentes)
        const adminRow = await dbGet(`SELECT * FROM usuarios WHERE cedula = '123456' OR cedula = 'admin' OR LOWER(username) = 'administrador'`);
        if (!adminRow) {
            await dbRun(`
                INSERT INTO usuarios (cedula, username, password, nombre, apellido, correo, sede, rol, estado, permisos, permisos_adicionales)
                VALUES ('123456', 'administrador', '123456', 'Administrador', 'General', 'admin@inventario.com', 'Sede Suroriental', 'ADMINISTRADOR', 'Activo', 'ALL', '[]')
            `);
        } else if (!adminRow.cedula || adminRow.cedula === 'admin') {
            await dbRun(`UPDATE usuarios SET cedula = '123456', apellido = 'General', correo = 'admin@inventario.com', sede = 'Sede Suroriental', permisos_adicionales = '[]' WHERE id = ?`, [adminRow.id]);
        }

        const gioRow = await dbGet(`SELECT * FROM usuarios WHERE cedula = '1130683079'`);
        if (!gioRow) {
            await dbRun(`
                INSERT INTO usuarios (cedula, username, password, nombre, apellido, correo, sede, rol, estado, permisos, permisos_adicionales)
                VALUES ('1130683079', 'gio', '8080809', 'Giobani', 'Lopez', 'cawy9499@gmail.com', 'Sede Suroriental', 'ADMINISTRADOR DE SEDE', 'Activo', 'SEDE_ALL', '[]')
            `);
        }

        console.log('[MIGRACIONES] ✅ Base de datos y migraciones completadas exitosamente sin alterar datos existentes.');
    } catch (err) {
        console.error('[MIGRACIONES] ❌ Error ejecutando migraciones:', err);
    }
}

// ==========================================
// 0. AUTENTICACIÓN SEGURA, USUARIOS Y ROLES (PROTECCIÓN ANTI-INYECCIÓN Y BRUTE FORCE)
// ==========================================

// Control de intentos fallidos (Protección Anti-Fuerza Bruta)
const loginRateLimit = new Map();

function checkLoginRateLimit(key) {
    const now = Date.now();
    const entry = loginRateLimit.get(key);
    if (!entry) return { allowed: true };

    const lockDuration = 5 * 60 * 1000; // 5 minutos de bloqueo
    if (entry.attempts >= 5) {
        const timePassed = now - entry.lastAttempt;
        if (timePassed < lockDuration) {
            const minutesLeft = Math.ceil((lockDuration - timePassed) / 60000);
            return { allowed: false, error: `Demasiados intentos fallidos. Por seguridad, la cuenta está bloqueada temporalmente. Intente nuevamente en ${minutesLeft} minuto(s).` };
        } else {
            loginRateLimit.delete(key);
            return { allowed: true };
        }
    }
    return { allowed: true };
}

function registerFailedLogin(key) {
    const now = Date.now();
    const entry = loginRateLimit.get(key) || { attempts: 0, lastAttempt: now };
    entry.attempts += 1;
    entry.lastAttempt = now;
    loginRateLimit.set(key, entry);
}

function clearFailedLogin(key) {
    loginRateLimit.delete(key);
}

// Helpers de Seguridad Criptográfica (PBKDF2 + Timing-Safe Equal)
function createPasswordHash(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}$${hash}`;
}

function verifyPassword(inputPassword, storedPassword) {
    if (typeof inputPassword !== 'string' || typeof storedPassword !== 'string') return false;
    if (!inputPassword || !storedPassword) return false;

    // Compatibilidad transparente con contraseñas en texto plano (ej. usuario inicial)
    if (!storedPassword.includes('$')) {
        return inputPassword === storedPassword;
    }

    try {
        const [salt, hash] = storedPassword.split('$');
        if (!salt || !hash) return false;
        const computed = crypto.pbkdf2Sync(inputPassword, salt, 10000, 64, 'sha512').toString('hex');
        const computedBuf = Buffer.from(computed);
        const hashBuf = Buffer.from(hash);
        if (computedBuf.length !== hashBuf.length) return false;
        return crypto.timingSafeEqual(computedBuf, hashBuf);
    } catch (e) {
        return false;
    }
}

app.post('/api/auth/login', async (req, res) => {
    try {
        const rawCedula = req.body.cedula || req.body.username;
        const password = req.body.password;

        // 1. Validación estricta de tipos de datos (Previene Type Confusion, Inyecciones de Objetos / NoSQL)
        if (typeof rawCedula !== 'string' || typeof password !== 'string' || !rawCedula || !password) {
            return res.status(400).json({ success: false, error: 'Debe ingresar su número de cédula y contraseña.' });
        }

        const cleanCedula = rawCedula.trim();
        const clientIp = req.ip || req.connection.remoteAddress || 'local';
        const rateLimitKey = `${clientIp}_${cleanCedula.toLowerCase()}`;

        // 2. Control de Fuerza Bruta / Rate Limiting
        const rateCheck = checkLoginRateLimit(rateLimitKey);
        if (!rateCheck.allowed) {
            return res.status(429).json({ success: false, error: rateCheck.error });
        }

        // 3. Sanitización de caracteres permitidos (Cédula o Alfanumérico)
        const cedulaRegex = /^[a-zA-Z0-9_.\-@]{3,50}$/;
        if (!cedulaRegex.test(cleanCedula)) {
            registerFailedLogin(rateLimitKey);
            return res.status(401).json({ success: false, error: 'Número de cédula o contraseña incorrectos.' });
        }

        if (password.length > 128) {
            registerFailedLogin(rateLimitKey);
            return res.status(401).json({ success: false, error: 'Número de cédula o contraseña incorrectos.' });
        }

        // 4. Consulta SQL 100% parametrizada (Busca por Cédula o por Username)
        const user = await dbGet(`
            SELECT id, cedula, username, password, nombre, apellido, correo, sede, rol, estado, permisos, permisos_adicionales 
            FROM usuarios 
            WHERE LOWER(cedula) = LOWER(?) OR LOWER(username) = LOWER(?)
        `, [cleanCedula, cleanCedula]);

        if (!user) {
            registerFailedLogin(rateLimitKey);
            return res.status(401).json({ success: false, error: 'Número de cédula o contraseña incorrectos.' });
        }

        if (user.estado !== 'Activo') {
            return res.status(403).json({ success: false, error: 'El usuario se encuentra inactivo. Contacte al administrador del sistema.' });
        }

        // 5. Verificación segura de clave con tiempo constante
        const isPasswordValid = verifyPassword(password, user.password);
        if (!isPasswordValid) {
            registerFailedLogin(rateLimitKey);
            return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos.' });
        }

        // Si la contraseña aún estaba en texto plano, actualizarla a hash PBKDF2 de forma transparente
        if (!user.password.includes('$')) {
            const secureHash = createPasswordHash(password);
            await dbRun(`UPDATE usuarios SET password = ? WHERE id = ?`, [secureHash, user.id]);
        }

        // Limpiar registro de intentos fallidos al tener éxito
        clearFailedLogin(rateLimitKey);

        const { password: _, ...userSafe } = user;
        try {
            userSafe.permisos_adicionales = JSON.parse(userSafe.permisos_adicionales || '[]');
        } catch (e) {
            userSafe.permisos_adicionales = [];
        }

        res.json({
            success: true,
            message: `Bienvenido, ${user.nombre} ${user.apellido || ''}`.trim(),
            user: userSafe
        });
    } catch (err) {
        console.error('Error en /api/auth/login:', err);
        res.status(500).json({ success: false, error: 'Error interno en el servicio de autenticación.' });
    }
});

// Listar todos los usuarios
app.get('/api/usuarios', async (req, res) => {
    try {
        const users = await dbAll(`
            SELECT id, cedula, username, nombre, apellido, correo, sede, rol, estado, permisos, permisos_adicionales, fecha_creacion 
            FROM usuarios 
            ORDER BY id ASC
        `);
        const formatted = users.map(u => {
            try {
                u.permisos_adicionales = JSON.parse(u.permisos_adicionales || '[]');
            } catch (e) {
                u.permisos_adicionales = [];
            }
            return u;
        });
        res.json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Crear nuevo usuario
app.post('/api/usuarios', async (req, res) => {
    try {
        const { cedula, nombre, apellido, correo, sede, rol, password, permisos_adicionales } = req.body;

        if (!cedula || !nombre || !password) {
            return res.status(400).json({ success: false, error: 'Cédula, nombre y contraseña son requeridos.' });
        }

        const cleanCedula = String(cedula).trim();
        const cleanNombre = String(nombre).trim();
        const cleanApellido = String(apellido || '').trim();
        const cleanCorreo = String(correo || '').trim();
        const cleanSede = String(sede || 'Sede Suroriental').trim();
        const cleanRol = String(rol || 'ADMINISTRADOR DE SEDE').trim();

        // Validar que la cédula sea única
        const existing = await dbGet(`SELECT id FROM usuarios WHERE LOWER(cedula) = LOWER(?)`, [cleanCedula]);
        if (existing) {
            return res.status(400).json({ success: false, error: 'Ya existe un usuario registrado con esta cédula.' });
        }

        const hashedPassword = createPasswordHash(String(password));
        const permisosBase = cleanRol === 'ADMINISTRADOR' ? 'ALL' : 'SEDE_ALL';
        const permisosExtrasStr = JSON.stringify(Array.isArray(permisos_adicionales) ? permisos_adicionales : []);

        const result = await dbRun(`
            INSERT INTO usuarios (cedula, username, password, nombre, apellido, correo, sede, rol, estado, permisos, permisos_adicionales)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Activo', ?, ?)
        `, [cleanCedula, cleanCedula, hashedPassword, cleanNombre, cleanApellido, cleanCorreo, cleanSede, cleanRol, permisosBase, permisosExtrasStr]);

        res.json({ success: true, message: 'Usuario creado exitosamente.', id: result.lastID });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Actualizar usuario (Cédula inmutable)
app.put('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, apellido, correo, sede, rol, estado, password } = req.body;

        const user = await dbGet(`SELECT id FROM usuarios WHERE id = ?`, [id]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
        }

        const cleanNombre = String(nombre || '').trim();
        const cleanApellido = String(apellido || '').trim();
        const cleanCorreo = String(correo || '').trim();
        const cleanSede = String(sede || 'Sede Suroriental').trim();
        const cleanRol = String(rol || 'ADMINISTRADOR DE SEDE').trim();
        const cleanEstado = String(estado || 'Activo').trim();
        const permisosBase = cleanRol === 'ADMINISTRADOR' ? 'ALL' : 'SEDE_ALL';

        if (password && String(password).trim().length > 0) {
            const hashedPassword = createPasswordHash(String(password));
            await dbRun(`
                UPDATE usuarios 
                SET nombre = ?, apellido = ?, correo = ?, sede = ?, rol = ?, estado = ?, permisos = ?, password = ?
                WHERE id = ?
            `, [cleanNombre, cleanApellido, cleanCorreo, cleanSede, cleanRol, cleanEstado, permisosBase, hashedPassword, id]);
        } else {
            await dbRun(`
                UPDATE usuarios 
                SET nombre = ?, apellido = ?, correo = ?, sede = ?, rol = ?, estado = ?, permisos = ?
                WHERE id = ?
            `, [cleanNombre, cleanApellido, cleanCorreo, cleanSede, cleanRol, cleanEstado, permisosBase, id]);
        }

        res.json({ success: true, message: 'Usuario actualizado exitosamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Asignar o actualizar permisos adicionales de un usuario
app.put('/api/usuarios/:id/permisos', async (req, res) => {
    try {
        const { id } = req.params;
        const { permisos_adicionales } = req.body;

        const user = await dbGet(`SELECT id FROM usuarios WHERE id = ?`, [id]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
        }

        const permisosExtrasStr = JSON.stringify(Array.isArray(permisos_adicionales) ? permisos_adicionales : []);
        await dbRun(`UPDATE usuarios SET permisos_adicionales = ? WHERE id = ?`, [permisosExtrasStr, id]);

        res.json({ success: true, message: 'Permisos adicionales actualizados con éxito.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoints de Sedes y Tipos de Inventario
app.get('/api/sedes', async (req, res) => {
    try {
        const sedes = await dbAll(`SELECT * FROM sedes ORDER BY id ASC`);
        res.json({ success: true, data: sedes });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/tipos-inventario', async (req, res) => {
    try {
        const tipos = await dbAll(`SELECT * FROM tipos_inventario ORDER BY id ASC`);
        res.json({ success: true, data: tipos });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// ENDPOINTS DE CAUSALES Y MOTIVOS DE MOVIMIENTO
// ==========================================
app.get('/api/causales', async (req, res) => {
    try {
        const { tipo_movimiento, estado } = req.query;
        let query = `SELECT * FROM causales_movimientos WHERE 1=1`;
        const params = [];
        if (tipo_movimiento && tipo_movimiento !== 'ALL') {
            query += ` AND tipo_movimiento = ?`;
            params.push(tipo_movimiento);
        }
        if (estado && estado !== 'ALL') {
            query += ` AND estado = ?`;
            params.push(estado);
        }
        query += ` ORDER BY tipo_movimiento ASC, orden ASC, id ASC`;
        const causales = await dbAll(query, params);
        res.json({ success: true, count: causales.length, data: causales });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/causales', async (req, res) => {
    try {
        const { tipo_movimiento, nombre, descripcion, orden, estado } = req.body;
        if (!tipo_movimiento || !nombre) {
            return res.status(400).json({ success: false, error: 'El tipo de movimiento y el nombre de la causal son requeridos.' });
        }
        const ordVal = parseInt(orden || 1, 10);
        const estVal = estado || 'Activo';
        await dbRun(`
            INSERT INTO causales_movimientos (tipo_movimiento, nombre, descripcion, orden, estado)
            VALUES (?, ?, ?, ?, ?)
        `, [tipo_movimiento.trim().toUpperCase(), nombre.trim().toUpperCase(), (descripcion || '').trim(), ordVal, estVal]);
        res.json({ success: true, message: 'Causal / Motivo registrado correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/causales/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo_movimiento, nombre, descripcion, orden, estado } = req.body;
        const existing = await dbGet(`SELECT * FROM causales_movimientos WHERE id = ?`, [id]);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'La causal no existe.' });
        }
        await dbRun(`
            UPDATE causales_movimientos 
            SET tipo_movimiento = ?, nombre = ?, descripcion = ?, orden = ?, estado = ?
            WHERE id = ?
        `, [
            (tipo_movimiento || existing.tipo_movimiento).trim().toUpperCase(),
            (nombre || existing.nombre).trim().toUpperCase(),
            (descripcion !== undefined ? descripcion : existing.descripcion).trim(),
            orden !== undefined ? parseInt(orden, 10) : existing.orden,
            estado || existing.estado,
            id
        ]);
        res.json({ success: true, message: 'Causal / Motivo actualizado correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/causales/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await dbRun(`DELETE FROM causales_movimientos WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Causal / Motivo eliminado exitosamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// ENDPOINTS DE PERMISOS DEL SISTEMA
// ==========================================
app.get('/api/permisos', async (req, res) => {
    try {
        const permisos = await dbAll(`SELECT * FROM permisos WHERE estado = 'Activo' ORDER BY id ASC`);
        res.json({ success: true, count: permisos.length, data: permisos });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/permisos', async (req, res) => {
    try {
        const { codigo, nombre, descripcion, categoria } = req.body;
        if (!codigo || !nombre) {
            return res.status(400).json({ success: false, error: 'Código y nombre de permiso son requeridos.' });
        }
        await dbRun(`
            INSERT INTO permisos (codigo, nombre, descripcion, categoria)
            VALUES (?, ?, ?, ?)
        `, [codigo.trim().toUpperCase(), nombre.trim(), (descripcion || '').trim(), (categoria || 'GENERAL').trim().toUpperCase()]);
        res.json({ success: true, message: 'Permiso creado exitosamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 1. ENDPOINTS DE KPIS Y RESUMEN EJECUTIVO
// ==========================================
app.get('/api/kpis', async (req, res) => {
    try {
        const { sede, tipo_inventario } = req.query;

        // Catálogo Maestro Unificado: Total de ítems activos registrados en la empresa
        const totalItems = (await dbGet(`SELECT COUNT(*) as count FROM items WHERE estado = 'Activo'`)).count;
        
        // Movimientos y Stock Físico filtrados por la Sede y Tipo de Inventario activos
        let movWhere = `WHERE 1=1`;
        let movParams = [];
        let mJoin = '';
        let mJoinParams = [];

        if (sede && sede !== 'ALL') {
            movWhere += ` AND sede = ?`;
            movParams.push(sede);
            mJoin += ` AND m.sede = ?`;
            mJoinParams.push(sede);
        }
        if (tipo_inventario && tipo_inventario !== 'ALL') {
            movWhere += ` AND tipo_inventario = ?`;
            movParams.push(tipo_inventario);
            mJoin += ` AND m.tipo_inventario = ?`;
            mJoinParams.push(tipo_inventario);
        }

        const stockCDSData = await dbGet(`
            SELECT 
                SUM(
                    (CASE WHEN tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'AJUSTE POSITIVO', 'ENTRADA POR TRASLADO') AND (bodega_destino = 'CDS' OR bodega_destino IS NULL) THEN cantidad ELSE 0 END) -
                    (CASE WHEN tipo_movimiento IN ('ENTREGA', 'DISPOSICION FINAL', 'AJUSTE NEGATIVO', 'SALIDA POR TRASLADO') AND (bodega_origen = 'CDS' OR bodega_origen IS NULL) THEN cantidad ELSE 0 END)
                ) as total_stock
            FROM movimientos
            ${movWhere}
        `, movParams);
        const totalStockCDS = stockCDSData ? (stockCDSData.total_stock || 0) : 0;

        const totalMovimientos = (await dbGet(`SELECT COUNT(*) as count FROM movimientos ${movWhere}`, movParams)).count;

        // Vencimientos
        const today = new Date().toISOString().split('T')[0];
        let cvWhere = `WHERE bodega = 'CDS' AND cant_disponible > 0 AND fecha_vencimiento <= ?`;
        let cvParams = [today];
        if (sede && sede !== 'ALL') {
            cvWhere += ` AND (sede = ? OR sede IS NULL)`;
            cvParams.push(sede);
        }
        if (tipo_inventario && tipo_inventario !== 'ALL') {
            cvWhere += ` AND (tipo_inventario = ? OR tipo_inventario IS NULL)`;
            cvParams.push(tipo_inventario);
        }
        const vencidosQuery = await dbGet(`SELECT COUNT(*) as count FROM control_vencimientos ${cvWhere}`, cvParams);
        const itemsVencidos = vencidosQuery ? (vencidosQuery.count || 0) : 0;

        const proximoMes = new Date();
        proximoMes.setDate(proximoMes.getDate() + 30);
        const proximoMesStr = proximoMes.toISOString().split('T')[0];

        let cvProxWhere = `WHERE bodega = 'CDS' AND cant_disponible > 0 AND fecha_vencimiento > ? AND fecha_vencimiento <= ?`;
        let cvProxParams = [today, proximoMesStr];
        if (sede && sede !== 'ALL') {
            cvProxWhere += ` AND (sede = ? OR sede IS NULL)`;
            cvProxParams.push(sede);
        }
        if (tipo_inventario && tipo_inventario !== 'ALL') {
            cvProxWhere += ` AND (tipo_inventario = ? OR tipo_inventario IS NULL)`;
            cvProxParams.push(tipo_inventario);
        }
        const proximosVencerQuery = await dbGet(`SELECT COUNT(*) as count FROM control_vencimientos ${cvProxWhere}`, cvProxParams);
        const itemsProximosVencer = proximosVencerQuery ? (proximosVencerQuery.count || 0) : 0;

        // Stock bajo en la Sede/Inventario actual
        let stockBajoQueryStr = `
            SELECT 
                i.codigo,
                i.stock_minimo,
                COALESCE(SUM(
                    (CASE WHEN m.tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'AJUSTE POSITIVO', 'ENTRADA POR TRASLADO') AND (m.bodega_destino = 'CDS' OR m.bodega_destino IS NULL) THEN m.cantidad ELSE 0 END) -
                    (CASE WHEN m.tipo_movimiento IN ('ENTREGA', 'DISPOSICION FINAL', 'AJUSTE NEGATIVO', 'SALIDA POR TRASLADO') AND (m.bodega_origen = 'CDS' OR m.bodega_origen IS NULL) THEN m.cantidad ELSE 0 END)
                ), 0) as stock_actual
            FROM items i
            LEFT JOIN movimientos m ON i.codigo = m.codigo_item ${mJoin}
            WHERE i.estado = 'Activo'
            GROUP BY i.codigo HAVING stock_actual <= i.stock_minimo
        `;
        const stockBajoQuery = await dbAll(stockBajoQueryStr, mJoinParams);
        const itemsStockBajo = stockBajoQuery.length;

        // Stock por categoría en la Sede/Inventario actual
        let catQueryStr = `
            SELECT 
                i.categoria,
                COUNT(DISTINCT i.codigo) as total_items,
                COALESCE(SUM(
                    (CASE WHEN m.tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'AJUSTE POSITIVO', 'ENTRADA POR TRASLADO') AND (m.bodega_destino = 'CDS' OR m.bodega_destino IS NULL) THEN m.cantidad ELSE 0 END) -
                    (CASE WHEN m.tipo_movimiento IN ('ENTREGA', 'DISPOSICION FINAL', 'AJUSTE NEGATIVO', 'SALIDA POR TRASLADO') AND (m.bodega_origen = 'CDS' OR m.bodega_origen IS NULL) THEN m.cantidad ELSE 0 END)
                ), 0) as stock_total
            FROM items i
            LEFT JOIN movimientos m ON i.codigo = m.codigo_item ${mJoin}
            WHERE i.estado = 'Activo'
            GROUP BY i.categoria ORDER BY stock_total DESC
        `;
        const categoriasStock = await dbAll(catQueryStr, mJoinParams);

        // Movimientos recientes
        let ultimosMovStr = `SELECT * FROM movimientos WHERE 1=1`;
        let ultimosParams = [];
        if (sede && sede !== 'ALL') {
            ultimosMovStr += ` AND sede = ?`;
            ultimosParams.push(sede);
        }
        if (tipo_inventario && tipo_inventario !== 'ALL') {
            ultimosMovStr += ` AND tipo_inventario = ?`;
            ultimosParams.push(tipo_inventario);
        }
        ultimosMovStr += ` ORDER BY id DESC LIMIT 5`;
        const ultimosMovimientos = await dbAll(ultimosMovStr, ultimosParams);

        res.json({
            success: true,
            kpis: {
                totalItems,
                totalStockCDS,
                itemsVencidos,
                itemsProximosVencer,
                totalMovimientos,
                itemsStockBajo
            },
            categoriasStock,
            ultimosMovimientos
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 2. INVENTARIO FÍSICO OFICIAL
// ==========================================
app.get('/api/inventario', async (req, res) => {
    try {
        const { sede, tipo_inventario, categoria, estadoStock, search } = req.query;

        let mJoin = '';
        let mJoinParams = [];
        if (sede && sede !== 'ALL') {
            mJoin += ` AND m.sede = ?`;
            mJoinParams.push(sede);
        }
        if (tipo_inventario && tipo_inventario !== 'ALL') {
            mJoin += ` AND m.tipo_inventario = ?`;
            mJoinParams.push(tipo_inventario);
        }

        let query = `
            SELECT 
                i.codigo,
                i.nombre,
                i.categoria,
                i.subcategoria,
                i.unidad_medida,
                i.ubicacion_cds,
                i.aplica_vencimiento,
                i.stock_minimo,
                i.estado as item_estado,
                COALESCE(SUM(CASE WHEN m.tipo_movimiento IN ('ENTRADA', 'ENTRADA POR TRASLADO') AND (m.bodega_destino = 'CDS' OR m.bodega_destino IS NULL) THEN m.cantidad ELSE 0 END), 0) AS entradas,
                COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'DEVOLUCION' AND m.bodega_destino = 'CDS' THEN m.cantidad ELSE 0 END), 0) AS devoluciones,
                COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'ENTREGA' AND m.bodega_destino = 'CDS' THEN m.cantidad ELSE 0 END), 0) AS entregas_recibidas,
                COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'AJUSTE POSITIVO' AND (m.bodega_destino = 'CDS' OR m.bodega_destino IS NULL) THEN m.cantidad ELSE 0 END), 0) AS ajustes_pos,
                COALESCE(SUM(CASE WHEN m.tipo_movimiento IN ('ENTREGA', 'SALIDA POR TRASLADO') AND (m.bodega_origen = 'CDS' OR m.bodega_origen IS NULL) THEN m.cantidad ELSE 0 END), 0) AS entregas_enviadas,
                COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'DISPOSICION FINAL' AND (m.bodega_origen = 'CDS' OR m.bodega_origen IS NULL) THEN m.cantidad ELSE 0 END), 0) AS disp_final,
                COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'AJUSTE NEGATIVO' AND (m.bodega_origen = 'CDS' OR m.bodega_origen IS NULL) THEN m.cantidad ELSE 0 END), 0) AS ajustes_neg
            FROM items i
            LEFT JOIN movimientos m ON i.codigo = m.codigo_item ${mJoin}
            WHERE 1=1
        `;

        const params = [...mJoinParams];
        if (categoria && categoria !== 'ALL') {
            query += ` AND i.categoria = ?`;
            params.push(categoria);
        }
        if (search) {
            query += ` AND (CAST(i.codigo AS TEXT) LIKE ? OR i.nombre LIKE ? OR i.ubicacion_cds LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ` GROUP BY i.codigo ORDER BY i.codigo ASC`;

        const rows = await dbAll(query, params);

        const result = rows.map(r => {
            const existencia = (r.entradas + r.devoluciones + r.entregas_recibidas + r.ajustes_pos) - 
                               (r.entregas_enviadas + r.disp_final + r.ajustes_neg);
            
            let estado_stock = 'STOCK NORMAL';
            let badge_class = 'bg-success';

            if (existencia < 0) {
                estado_stock = 'ERROR: SOBREGIRO';
                badge_class = 'bg-danger';
            } else if (existencia === 0) {
                estado_stock = 'SIN EXISTENCIAS';
                badge_class = 'bg-secondary';
            } else if (existencia <= r.stock_minimo) {
                estado_stock = 'STOCK BAJO';
                badge_class = 'bg-warning text-dark';
            }

            return {
                ...r,
                existencia,
                estado_stock,
                badge_class
            };
        });

        const filtered = estadoStock && estadoStock !== 'ALL' 
            ? result.filter(item => item.estado_stock === estadoStock)
            : result;

        res.json({ success: true, count: filtered.length, data: filtered });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 3. CATÁLOGO DE ITEMS (CRUD + VALIDACIÓN 100% NUMÉRICO)
// ==========================================
app.get('/api/items', async (req, res) => {
    try {
        const { search, categoria, estado } = req.query;
        let query = `SELECT * FROM items WHERE 1=1`;
        const params = [];

        if (search) {
            query += ` AND (CAST(codigo AS TEXT) LIKE ? OR nombre LIKE ? OR marca LIKE ? OR ubicacion_cds LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (categoria && categoria !== 'ALL') {
            query += ` AND categoria = ?`;
            params.push(categoria);
        }
        if (estado && estado !== 'ALL') {
            query += ` AND estado = ?`;
            params.push(estado);
        }

        query += ` ORDER BY codigo ASC`;
        const items = await dbAll(query, params);
        res.json({ success: true, count: items.length, data: items });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Sugerencia consecutivo
app.get('/api/items/next-code', async (req, res) => {
    try {
        const row = await dbGet(`SELECT MAX(codigo) as max_code FROM items`);
        const nextCode = (row.max_code || 1000) + 1;
        res.json({ success: true, nextCode });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Crear ítem (100% Numérico, Stock Inicial = 0)
app.post('/api/items', async (req, res) => {
    try {
        let {
            codigo,
            nombre,
            categoria,
            subcategoria,
            unidad_medida,
            marca,
            referencia,
            ubicacion_cds,
            aplica_vencimiento,
            stock_minimo,
            estado,
            observaciones,
            sede,
            tipo_inventario
        } = req.body;

        if (!/^\d+$/.test(String(codigo).trim())) {
            return res.status(400).json({ 
                success: false, 
                error: 'El código del ítem debe ser 100% numérico, sin letras, guiones ni espacios.' 
            });
        }
        const numericCode = parseInt(codigo, 10);

        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre del ítem es obligatorio.' });
        }

        const existing = await dbGet(`SELECT codigo FROM items WHERE codigo = ?`, [numericCode]);
        if (existing) {
            return res.status(400).json({ success: false, error: `El código ${numericCode} ya se encuentra registrado en el catálogo.` });
        }

        const todayStr = new Date().toISOString().split('T')[0];

        await dbRun(`
            INSERT INTO items (
                codigo, nombre, categoria, subcategoria, unidad_medida, marca, referencia,
                ubicacion_cds, aplica_vencimiento, stock_minimo, estado, observaciones, fecha_registro,
                sede, tipo_inventario
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            numericCode,
            nombre.trim().toUpperCase(),
            categoria || 'Materiales',
            subcategoria || 'General',
            unidad_medida || 'Unidad',
            marca || 'Generico',
            referencia || '-',
            ubicacion_cds || 'A1',
            aplica_vencimiento ? 1 : 0,
            parseInt(stock_minimo || 0, 10),
            estado || 'Activo',
            observaciones || 'Alta en catálogo',
            todayStr,
            sede || 'Sede Suroriental',
            tipo_inventario || 'CDS'
        ]);

        res.json({ success: true, message: 'Ítem creado exitosamente con existencia inicial en 0.', codigo: numericCode });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Actualizar ítem
app.put('/api/items/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        const {
            nombre,
            categoria,
            subcategoria,
            unidad_medida,
            marca,
            referencia,
            ubicacion_cds,
            aplica_vencimiento,
            stock_minimo,
            estado,
            observaciones,
            sede,
            tipo_inventario
        } = req.body;

        await dbRun(`
            UPDATE items SET
                nombre = ?,
                categoria = ?,
                subcategoria = ?,
                unidad_medida = ?,
                marca = ?,
                referencia = ?,
                ubicacion_cds = ?,
                aplica_vencimiento = ?,
                stock_minimo = ?,
                estado = ?,
                observaciones = ?,
                sede = COALESCE(?, sede),
                tipo_inventario = COALESCE(?, tipo_inventario)
            WHERE codigo = ?
        `, [
            nombre.trim().toUpperCase(),
            categoria,
            subcategoria,
            unidad_medida,
            marca,
            referencia,
            ubicacion_cds,
            aplica_vencimiento ? 1 : 0,
            parseInt(stock_minimo || 0, 10),
            estado,
            observaciones,
            sede || null,
            tipo_inventario || null,
            codigo
        ]);

        res.json({ success: true, message: 'Ítem actualizado exitosamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 4. MOVIMIENTOS DE INVENTARIO (TRANSACCIONAL)
// ==========================================
app.get('/api/movimientos', async (req, res) => {
    try {
        const { sede, tipo_inventario, tipo, bodega, search, fechaInicio, fechaFin } = req.query;
        let query = `SELECT * FROM movimientos WHERE 1=1`;
        const params = [];

        if (sede && sede !== 'ALL') {
            query += ` AND sede = ?`;
            params.push(sede);
        }
        if (tipo_inventario && tipo_inventario !== 'ALL') {
            query += ` AND tipo_inventario = ?`;
            params.push(tipo_inventario);
        }
        if (tipo && tipo !== 'ALL') {
            query += ` AND tipo_movimiento = ?`;
            params.push(tipo);
        }
        if (bodega && bodega !== 'ALL') {
            query += ` AND (bodega_origen = ? OR bodega_destino = ?)`;
            params.push(bodega, bodega);
        }
        if (fechaInicio) {
            query += ` AND fecha >= ?`;
            params.push(fechaInicio);
        }
        if (fechaFin) {
            query += ` AND fecha <= ?`;
            params.push(fechaFin);
        }
        if (search) {
            query += ` AND (n_movimiento LIKE ? OR CAST(codigo_item AS TEXT) LIKE ? OR nombre_item LIKE ? OR responsable LIKE ? OR proyecto_destino LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY id DESC LIMIT 500`;
        const movs = await dbAll(query, params);
        res.json({ success: true, count: movs.length, data: movs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Consultar stock de un ítem en una bodega específica
app.get('/api/inventario/stock-bodega', async (req, res) => {
    try {
        const { codigo_item, bodega, sede, tipo_inventario } = req.query;
        if (!codigo_item) {
            return res.status(400).json({ success: false, error: 'Código de ítem requerido.' });
        }
        const bodegaTarget = (bodega && bodega !== 'ALL') ? bodega : 'CDS';
        let stock = 0;
        let sedeFilter = '';
        let sedeParams = [];
        if (sede && sede !== 'ALL') {
            sedeFilter += ` AND sede = ?`;
            sedeParams.push(sede);
        }
        if (tipo_inventario && tipo_inventario !== 'ALL') {
            sedeFilter += ` AND tipo_inventario = ?`;
            sedeParams.push(tipo_inventario);
        }

        if (bodegaTarget === 'CDS') {
            const stockData = await dbGet(`
                SELECT 
                    COALESCE(SUM(
                        (CASE WHEN tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'AJUSTE POSITIVO') AND (bodega_destino = 'CDS' OR bodega_destino IS NULL) THEN cantidad ELSE 0 END) -
                        (CASE WHEN tipo_movimiento IN ('ENTREGA', 'DISPOSICION FINAL', 'AJUSTE NEGATIVO') AND (bodega_origen = 'CDS' OR bodega_origen IS NULL) THEN cantidad ELSE 0 END)
                    ), 0) as stock
                FROM movimientos WHERE codigo_item = ? ${sedeFilter}
            `, [codigo_item, ...sedeParams]);
            stock = stockData ? stockData.stock : 0;
        } else {
            const stockData = await dbGet(`
                SELECT 
                    COALESCE(SUM(
                        (CASE WHEN bodega_destino = ? THEN cantidad ELSE 0 END) -
                        (CASE WHEN bodega_origen = ? THEN cantidad ELSE 0 END)
                    ), 0) as stock
                FROM movimientos 
                WHERE codigo_item = ? AND (bodega_destino = ? OR bodega_origen = ?) ${sedeFilter}
            `, [bodegaTarget, codigo_item, bodegaTarget, bodegaTarget, ...sedeParams]);
            stock = stockData ? stockData.stock : 0;
        }
        res.json({ success: true, codigo_item: parseInt(codigo_item, 10), bodega: bodegaTarget, stock });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Registrar movimiento
app.post('/api/movimientos', async (req, res) => {
    try {
        const {
            tipo_movimiento,
            codigo_item,
            cantidad,
            bodega_origen,
            bodega_destino,
            causal_condicion,
            ubicacion_cds,
            proyecto_destino,
            responsable,
            persona_recibe_devuelve,
            documento_referencia,
            observaciones,
            fecha_vencimiento_lote,
            fecha,
            hora,
            sede,
            tipo_inventario
        } = req.body;

        const cantNum = parseFloat(cantidad);
        if (!cantNum || cantNum <= 0) {
            return res.status(400).json({ success: false, error: 'La cantidad debe ser un número mayor a cero.' });
        }

        const item = await dbGet(`SELECT * FROM items WHERE codigo = ?`, [codigo_item]);
        if (!item) {
            return res.status(400).json({ success: false, error: `El ítem con código ${codigo_item} no existe en el catálogo.` });
        }

        const movSede = sede || item.sede || 'Sede Suroriental';
        const movTipoInv = tipo_inventario || item.tipo_inventario || 'CDS';

        // Validación estricta de existencias para Salidas y Devoluciones por bodega de origen
        const esSalidaODevolucion = ['ENTREGA', 'DISPOSICION FINAL', 'AJUSTE NEGATIVO', 'DEVOLUCION'].includes(tipo_movimiento);
        if (esSalidaODevolucion) {
            const origenActual = (tipo_movimiento === 'DEVOLUCION') 
                ? (bodega_origen && bodega_origen !== 'ALL' ? bodega_origen : 'PROYECTOS')
                : (bodega_origen && bodega_origen !== 'ALL' ? bodega_origen : 'CDS');
            
            let stockDisponible = 0;
            if (origenActual === 'CDS') {
                const stockData = await dbGet(`
                    SELECT 
                        COALESCE(SUM(
                            (CASE WHEN tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'AJUSTE POSITIVO', 'ENTRADA POR TRASLADO') AND (bodega_destino = 'CDS' OR bodega_destino IS NULL) THEN cantidad ELSE 0 END) -
                            (CASE WHEN tipo_movimiento IN ('ENTREGA', 'DISPOSICION FINAL', 'AJUSTE NEGATIVO', 'SALIDA POR TRASLADO') AND (bodega_origen = 'CDS' OR bodega_origen IS NULL) THEN cantidad ELSE 0 END)
                        ), 0) as stock
                    FROM movimientos WHERE codigo_item = ? AND sede = ? AND tipo_inventario = ?
                `, [codigo_item, movSede, movTipoInv]);
                stockDisponible = stockData ? stockData.stock : 0;
            } else {
                const stockData = await dbGet(`
                    SELECT 
                        COALESCE(SUM(
                            (CASE WHEN bodega_destino = ? THEN cantidad ELSE 0 END) -
                            (CASE WHEN bodega_origen = ? THEN cantidad ELSE 0 END)
                        ), 0) as stock
                    FROM movimientos 
                    WHERE codigo_item = ? AND (bodega_destino = ? OR bodega_origen = ?) AND sede = ? AND tipo_inventario = ?
                `, [origenActual, codigo_item, origenActual, origenActual, movSede, movTipoInv]);
                stockDisponible = stockData ? stockData.stock : 0;
            }

            if (stockDisponible <= 0) {
                const accion = tipo_movimiento === 'DEVOLUCION' ? 'la devolución' : 'la salida';
                return res.status(400).json({ 
                    success: false, 
                    error: `No se puede realizar ${accion}. La bodega de origen "${origenActual}" en ${movSede} no tiene existencias disponibles del ítem "${item.nombre}" (Stock disponible: 0 ${item.unidad_medida}).` 
                });
            }

            if (stockDisponible < cantNum) {
                const accion = tipo_movimiento === 'DEVOLUCION' ? 'devolver' : 'retirar';
                return res.status(400).json({ 
                    success: false, 
                    error: `Stock insuficiente en la bodega de origen "${origenActual}" (${movSede}). Stock disponible: ${stockDisponible} ${item.unidad_medida}. Intentó ${accion}: ${cantNum} ${item.unidad_medida}.` 
                });
            }
        }

        const lastMov = await dbGet(`SELECT id FROM movimientos ORDER BY id DESC LIMIT 1`);
        const nextId = (lastMov ? lastMov.id : 0) + 1;
        const n_movimiento = `MOV-${String(nextId).padStart(5, '0')}`;

        const now = new Date();
        const movFecha = fecha || now.toISOString().split('T')[0];
        const movHora = hora || now.toTimeString().split(' ')[0].substring(0, 5);

        await dbRun(`
            INSERT INTO movimientos (
                n_movimiento, fecha, hora, tipo_movimiento, codigo_item, nombre_item, cantidad, unidad,
                bodega_origen, bodega_destino, causal_condicion, ubicacion_cds, proyecto_destino,
                responsable, persona_recibe_devuelve, documento_referencia, observaciones, fecha_vencimiento_lote,
                sede, tipo_inventario
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            n_movimiento,
            movFecha,
            movHora,
            tipo_movimiento,
            item.codigo,
            item.nombre,
            cantNum,
            item.unidad_medida,
            bodega_origen || null,
            bodega_destino || (tipo_movimiento === 'ENTRADA' ? 'CDS' : null),
            causal_condicion || (tipo_movimiento === 'ENTRADA' ? 'NUEVO / INICIAL' : null),
            ubicacion_cds || item.ubicacion_cds,
            proyecto_destino || 'Operacion Central',
            responsable || 'Administrador CDS',
            persona_recibe_devuelve || null,
            documento_referencia || 'REG-AUTOMATICO',
            observaciones || null,
            fecha_vencimiento_lote || null,
            movSede,
            movTipoInv
        ]);

        if (tipo_movimiento === 'ENTRADA' && item.aplica_vencimiento && fecha_vencimiento_lote) {
            const hoyStr = now.toISOString().split('T')[0];
            const diffDias = Math.ceil((new Date(fecha_vencimiento_lote) - new Date(hoyStr)) / (1000 * 60 * 60 * 24));
            let estadoVenc = 'VIGENTE';
            if (diffDias <= 0) estadoVenc = '¡VENCIDO!';
            else if (diffDias <= 30) estadoVenc = 'PROXIMO A VENCER';

            await dbRun(`
                INSERT INTO control_vencimientos (
                    codigo_item, nombre_item, bodega, fecha_ingreso, fecha_vencimiento,
                    cant_inicial, cant_disponible, estado, observaciones, n_movimiento_origen,
                    sede, tipo_inventario
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                item.codigo,
                item.nombre,
                bodega_destino || 'CDS',
                movFecha,
                fecha_vencimiento_lote,
                cantNum,
                cantNum,
                estadoVenc,
                `Lote ingresado vía ${n_movimiento}`,
                n_movimiento,
                movSede,
                movTipoInv
            ]);
        }

        res.json({ 
            success: true, 
            message: `Movimiento ${n_movimiento} registrado con éxito en ${movSede} (${movTipoInv}).`,
            n_movimiento
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Obtener el último movimiento registrado
app.get('/api/movimientos/ultimo', async (req, res) => {
    try {
        const { sede, tipo_inventario } = req.query;
        let query = `SELECT * FROM movimientos WHERE 1=1`;
        let params = [];
        if (sede && sede !== 'ALL') {
            query += ` AND sede = ?`;
            params.push(sede);
        }
        if (tipo_inventario && tipo_inventario !== 'ALL') {
            query += ` AND tipo_inventario = ?`;
            params.push(tipo_inventario);
        }
        query += ` ORDER BY id DESC LIMIT 1`;
        const lastMov = await dbGet(query, params);
        if (!lastMov) {
            return res.status(404).json({ success: false, error: 'No hay movimientos registrados en la base de datos.' });
        }
        res.json({ success: true, data: lastMov });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Función auxiliar para revertir y eliminar un movimiento de forma segura
async function eliminarMovimientoPorId(movId) {
    const lastMov = await dbGet(`SELECT id, n_movimiento FROM movimientos ORDER BY id DESC LIMIT 1`);
    if (!lastMov) {
        throw new Error('No hay movimientos registrados para eliminar.');
    }
    if (parseInt(lastMov.id, 10) !== parseInt(movId, 10)) {
        throw new Error(`Solo se permite eliminar y revertir el último movimiento registrado (${lastMov.n_movimiento}) para garantizar la coherencia y trazabilidad del kardex.`);
    }

    const mov = await dbGet(`SELECT * FROM movimientos WHERE id = ?`, [movId]);
    if (!mov) {
        throw new Error(`El movimiento con ID ${movId} no fue encontrado.`);
    }

    const item = await dbGet(`SELECT * FROM items WHERE codigo = ?`, [mov.codigo_item]);
    const unidad = item ? item.unidad_medida : (mov.unidad || 'Unidad');
    const nombreItem = item ? item.nombre : mov.nombre_item;

    // Si el movimiento incrementó stock en CDS (ENTRADA, DEVOLUCION, AJUSTE POSITIVO, ENTRADA POR TRASLADO),
    // al eliminarlo se restará stock. Debemos verificar que no quede en sobregiro negativo.
    const esIngresoCDS = (['ENTRADA', 'ENTRADA POR TRASLADO'].includes(mov.tipo_movimiento) && (mov.bodega_destino === 'CDS' || !mov.bodega_destino)) ||
                         (mov.tipo_movimiento === 'DEVOLUCION' && mov.bodega_destino === 'CDS') ||
                         (mov.tipo_movimiento === 'AJUSTE POSITIVO' && (mov.bodega_destino === 'CDS' || !mov.bodega_destino));

    if (esIngresoCDS) {
        const stockActualData = await dbGet(`
            SELECT 
                COALESCE(SUM(
                    (CASE WHEN tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'AJUSTE POSITIVO', 'ENTRADA POR TRASLADO') AND (bodega_destino = 'CDS' OR bodega_destino IS NULL) THEN cantidad ELSE 0 END) -
                    (CASE WHEN tipo_movimiento IN ('ENTREGA', 'DISPOSICION FINAL', 'AJUSTE NEGATIVO', 'SALIDA POR TRASLADO') AND (bodega_origen = 'CDS' OR bodega_origen IS NULL) THEN cantidad ELSE 0 END)
                ), 0) as stock
            FROM movimientos WHERE codigo_item = ?
        `, [mov.codigo_item]);

        const stockActual = stockActualData ? stockActualData.stock : 0;
        if (stockActual < mov.cantidad) {
            throw new Error(`No se puede eliminar la entrada ${mov.n_movimiento}. El ítem "${nombreItem}" tiene stock actual de ${stockActual} ${unidad}, el cual es menor a los ${mov.cantidad} ${unidad} que se ingresaron (ya fueron despachados o consumidos en movimientos posteriores).`);
        }
    }

    // Iniciar transacción de eliminación
    await dbRun('BEGIN TRANSACTION');
    try {
        // Si generó lote en control_vencimientos, eliminarlo
        await dbRun(`DELETE FROM control_vencimientos WHERE n_movimiento_origen = ?`, [mov.n_movimiento]);

        // Si fue una baja de vencimiento (DISPOSICION FINAL), restaurar cant_disponible si aún existe el lote
        if (mov.tipo_movimiento === 'DISPOSICION FINAL' && mov.observaciones && mov.observaciones.includes('Baja asistida')) {
            await dbRun(`
                UPDATE control_vencimientos 
                SET cant_disponible = cant_disponible + ?, estado = '¡VENCIDO!' 
                WHERE codigo_item = ? AND estado = 'DADO DE BAJA'
            `, [mov.cantidad, mov.codigo_item]);
        }

        // Eliminar el movimiento
        await dbRun(`DELETE FROM movimientos WHERE id = ?`, [mov.id]);

        await dbRun('COMMIT');
        return mov;
    } catch (e) {
        await dbRun('ROLLBACK');
        throw e;
    }
}

// Eliminar último movimiento
app.delete('/api/movimientos/ultimo', async (req, res) => {
    try {
        const lastMov = await dbGet(`SELECT id FROM movimientos ORDER BY id DESC LIMIT 1`);
        if (!lastMov) {
            return res.status(404).json({ success: false, error: 'No hay movimientos registrados para eliminar.' });
        }

        const eliminado = await eliminarMovimientoPorId(lastMov.id);
        res.json({
            success: true,
            message: `Último movimiento (${eliminado.n_movimiento} - ${eliminado.tipo_movimiento} ${eliminado.cantidad} ${eliminado.unidad}) eliminado y revertido exitosamente.`,
            data: eliminado
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// Eliminar un movimiento por ID
app.delete('/api/movimientos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const eliminado = await eliminarMovimientoPorId(id);
        res.json({
            success: true,
            message: `Movimiento ${eliminado.n_movimiento} (${eliminado.tipo_movimiento}) eliminado y revertido exitosamente.`,
            data: eliminado
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==========================================
// 5. CONTROL DE VENCIMIENTOS Y ASISTENTE DE BAJAS
// ==========================================
app.get('/api/vencimientos', async (req, res) => {
    try {
        const { sede, tipo_inventario } = req.query;
        const today = new Date().toISOString().split('T')[0];
        let where = `WHERE cv.cant_disponible > 0`;
        let params = [];
        if (sede && sede !== 'ALL') {
            where += ` AND (cv.sede = ? OR cv.sede IS NULL)`;
            params.push(sede);
        }
        if (tipo_inventario && tipo_inventario !== 'ALL') {
            where += ` AND (cv.tipo_inventario = ? OR cv.tipo_inventario IS NULL)`;
            params.push(tipo_inventario);
        }

        const rows = await dbAll(`
            SELECT cv.*, i.ubicacion_cds, i.unidad_medida 
            FROM control_vencimientos cv
            JOIN items i ON cv.codigo_item = i.codigo
            ${where}
            ORDER BY cv.fecha_vencimiento ASC
        `, params);

        const formatted = rows.map(r => {
            const diffDias = Math.ceil((new Date(r.fecha_vencimiento) - new Date(today)) / (1000 * 60 * 60 * 24));
            let estado = 'VIGENTE';
            let badge_class = 'bg-success';

            if (diffDias <= 0) {
                estado = '¡VENCIDO!';
                badge_class = 'bg-danger';
            } else if (diffDias <= 30) {
                estado = 'PROXIMO A VENCER';
                badge_class = 'bg-warning text-dark';
            }

            return {
                ...r,
                dias_restantes: diffDias,
                estado_actualizado: estado,
                badge_class
            };
        });

        res.json({ success: true, count: formatted.length, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Bajas automáticas masivas (frmBajasVencidos)
app.post('/api/vencimientos/bajas-automaticas', async (req, res) => {
    try {
        const { lotesIds, responsable, observaciones } = req.body;

        if (!lotesIds || !Array.isArray(lotesIds) || lotesIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Debe seleccionar al menos un lote vencido para dar de baja.' });
        }

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

        let bajasRealizadas = 0;

        for (const id of lotesIds) {
            const lote = await dbGet(`SELECT * FROM control_vencimientos WHERE id = ?`, [id]);
            if (lote && lote.cant_disponible > 0) {
                const lastMov = await dbGet(`SELECT id FROM movimientos ORDER BY id DESC LIMIT 1`);
                const nextId = (lastMov ? lastMov.id : 0) + 1;
                const n_movimiento = `MOV-${String(nextId).padStart(5, '0')}`;

                const item = await dbGet(`SELECT * FROM items WHERE codigo = ?`, [lote.codigo_item]);

                await dbRun(`
                    INSERT INTO movimientos (
                        n_movimiento, fecha, hora, tipo_movimiento, codigo_item, nombre_item, cantidad, unidad,
                        bodega_origen, bodega_destino, causal_condicion, ubicacion_cds, proyecto_destino,
                        responsable, persona_recibe_devuelve, documento_referencia, observaciones
                    ) VALUES (?, ?, ?, 'DISPOSICION FINAL', ?, ?, ?, ?, 'CDS', 'DISPOSICION FINAL', 'Vencido', ?, 'Bajas Scrap', ?, 'Control Calidad', 'BAJA-AUTO-VENC', ?)
                `, [
                    n_movimiento,
                    todayStr,
                    timeStr,
                    lote.codigo_item,
                    lote.nombre_item,
                    lote.cant_disponible,
                    item ? item.unidad_medida : 'Unidad',
                    item ? item.ubicacion_cds : 'A1',
                    responsable || 'Administrador CDS',
                    observaciones || `Baja masiva por caducidad (Lote ${lote.n_movimiento_origen || lote.id})`
                ]);

                await dbRun(`
                    UPDATE control_vencimientos SET cant_disponible = 0, estado = 'DADO DE BAJA' WHERE id = ?
                `, [id]);

                bajasRealizadas++;
            }
        }

        res.json({ 
            success: true, 
            message: `Se trasladaron exitosamente ${bajasRealizadas} lotes a la bodega DISPOSICIÓN FINAL.` 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 6. BODEGAS, PROYECTOS Y CONFIGURACIONES
// ==========================================
app.get('/api/bodegas/siguiente-codigo', async (req, res) => {
    try {
        const bodegas = await dbAll(`SELECT codigo FROM bodegas`);
        let maxNum = 0;
        bodegas.forEach(b => {
            if (b.codigo) {
                const match = b.codigo.match(/\d+/);
                if (match) {
                    const num = parseInt(match[0], 10);
                    if (num > maxNum) maxNum = num;
                }
            }
        });
        const nextNum = maxNum + 1;
        const siguienteCodigo = `BOD-${String(nextNum).padStart(3, '0')}`;
        const esPrimera = bodegas.length === 0;
        res.json({ success: true, siguienteCodigo, esPrimera });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/bodegas', async (req, res) => {
    try {
        const { sede, tipo_inventario } = req.query;
        let query = `SELECT rowid, * FROM bodegas WHERE 1=1`;
        const params = [];

        if (sede && sede !== 'TODAS' && sede !== 'ALL') {
            query += ` AND (sede = ? OR sede = 'TODAS' OR sede = 'ALL' OR sede IS NULL)`;
            params.push(sede);
        }
        if (tipo_inventario && tipo_inventario !== 'TODOS' && tipo_inventario !== 'ALL') {
            query += ` AND (tipo_inventario = ? OR tipo_inventario = 'TODOS' OR tipo_inventario = 'ALL' OR tipo_inventario IS NULL)`;
            params.push(tipo_inventario);
        }

        query += ` ORDER BY es_central DESC, codigo ASC`;
        const bodegas = await dbAll(query, params);

        // Asegurar que al menos la primera bodega sea reconocida como central si no estuviera marcado
        const data = bodegas.map((b, idx) => ({
            ...b,
            es_central: b.es_central === 1 || b.codigo === 'BOD-001' || (idx === 0 && !bodegas.some(x => x.es_central === 1)) ? 1 : 0
        }));
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/bodegas', async (req, res) => {
    try {
        let { codigo, nombre, ubicacion, responsable, estado, observaciones, sede, tipo_inventario, isEdit } = req.body;
        
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre de la bodega es obligatorio.' });
        }

        nombre = nombre.trim().toUpperCase();
        const sedeVal = sede || 'Sede Suroriental';
        const tipoInvVal = tipo_inventario || 'CDS';

        if (isEdit || isEdit === '1' || isEdit === true) {
            // Edición de bodega: el código NO se permite modificar
            if (!codigo) {
                return res.status(400).json({ success: false, error: 'Código de bodega requerido para modificar.' });
            }
            const existing = await dbGet(`SELECT * FROM bodegas WHERE codigo = ?`, [codigo]);
            if (!existing) {
                return res.status(404).json({ success: false, error: 'La bodega especificada no existe.' });
            }

            await dbRun(`
                UPDATE bodegas 
                SET nombre = ?, ubicacion = ?, responsable = ?, estado = ?, observaciones = ?, sede = ?, tipo_inventario = ?
                WHERE codigo = ?
            `, [nombre, ubicacion || '', responsable || '', estado || 'Activa', observaciones || '', sedeVal, tipoInvVal, codigo]);

            res.json({ 
                success: true, 
                message: `Bodega ${codigo} (${nombre}) modificada exitosamente.`,
                codigo 
            });
        } else {
            // Creación de bodega: código autoincrementable automático
            const totalBodegas = await dbGet(`SELECT COUNT(*) as count FROM bodegas`);
            const esPrimera = (!totalBodegas || totalBodegas.count === 0);

            // Calcular código autoincrementable de forma estricta en servidor
            const bodegas = await dbAll(`SELECT codigo FROM bodegas`);
            let maxNum = 0;
            bodegas.forEach(b => {
                if (b.codigo) {
                    const match = b.codigo.match(/\d+/);
                    if (match) {
                        const num = parseInt(match[0], 10);
                        if (num > maxNum) maxNum = num;
                    }
                }
            });
            const nextCodigo = `BOD-${String(maxNum + 1).padStart(3, '0')}`;
            const esCentral = esPrimera ? 1 : 0;

            await dbRun(`
                INSERT INTO bodegas (codigo, nombre, ubicacion, responsable, estado, observaciones, es_central, sede, tipo_inventario)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [nextCodigo, nombre, ubicacion || '', responsable || '', estado || 'Activa', observaciones || '', esCentral, sedeVal, tipoInvVal]);

            res.json({ 
                success: true, 
                message: `Bodega ${nextCodigo} (${nombre}) creada exitosamente${esPrimera ? ' como BODEGA CENTRAL' : ''}.`,
                codigo: nextCodigo,
                es_central: esCentral
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Eliminar bodega (Prohibido para Bodega Central)
app.delete('/api/bodegas/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        const bodega = await dbGet(`SELECT * FROM bodegas WHERE codigo = ?`, [codigo]);
        if (!bodega) {
            return res.status(404).json({ success: false, error: 'La bodega especificada no existe.' });
        }

        // REGLA CRÍTICA: La Bodega Central NO se puede eliminar
        if (bodega.es_central === 1 || bodega.codigo === 'BOD-001') {
            return res.status(403).json({ 
                success: false, 
                error: 'La BODEGA CENTRAL es la base operativa de control y no puede ser eliminada. Solo se permite su modificación.' 
            });
        }

        // Validar si tiene transacciones en movimientos
        const movCount = await dbGet(`
            SELECT COUNT(*) as count FROM movimientos 
            WHERE bodega_origen = ? OR bodega_destino = ?
        `, [bodega.nombre, bodega.nombre]);

        if (movCount && movCount.count > 0) {
            return res.status(400).json({ 
                success: false, 
                error: `No es posible eliminar la bodega "${bodega.nombre}" porque tiene ${movCount.count} transacciones registradas en el Libro Diario. Si no desea utilizarla, puede modificar su estado a "Inactiva".` 
            });
        }

        // Validar si tiene lotes en control de vencimientos
        const lotesCount = await dbGet(`
            SELECT COUNT(*) as count FROM control_vencimientos 
            WHERE bodega = ?
        `, [bodega.nombre]);

        if (lotesCount && lotesCount.count > 0) {
            return res.status(400).json({ 
                success: false, 
                error: `No es posible eliminar la bodega "${bodega.nombre}" porque tiene lotes en el Control de Vencimientos.` 
            });
        }

        await dbRun(`DELETE FROM bodegas WHERE codigo = ?`, [codigo]);
        res.json({ success: true, message: `Bodega ${bodega.codigo} - ${bodega.nombre} eliminada correctamente.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/proyectos', async (req, res) => {
    try {
        const { sede, tipo_inventario } = req.query;
        let query = `SELECT * FROM proyectos WHERE 1=1`;
        const params = [];

        if (sede && sede !== 'TODAS' && sede !== 'ALL') {
            query += ` AND (sede = ? OR sede = 'TODAS' OR sede = 'ALL' OR sede IS NULL)`;
            params.push(sede);
        }
        if (tipo_inventario && tipo_inventario !== 'TODOS' && tipo_inventario !== 'ALL') {
            query += ` AND (tipo_inventario = ? OR tipo_inventario = 'TODOS' OR tipo_inventario = 'ALL' OR tipo_inventario IS NULL)`;
            params.push(tipo_inventario);
        }

        query += ` ORDER BY nombre ASC`;
        const proyectos = await dbAll(query, params);
        res.json({ success: true, data: proyectos });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/proyectos', async (req, res) => {
    try {
        const { id, nombre, responsable, estado, observaciones, sede, tipo_inventario } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'Nombre del proyecto es obligatorio.' });
        }

        const sedeVal = sede || 'Sede Suroriental';
        const tipoInvVal = tipo_inventario || 'CDS';

        if (id) {
            await dbRun(`
                UPDATE proyectos 
                SET nombre = ?, responsable = ?, estado = ?, observaciones = ?, sede = ?, tipo_inventario = ? 
                WHERE id = ?
            `, [nombre.trim(), responsable, estado || 'Activo', observaciones, sedeVal, tipoInvVal, id]);
        } else {
            await dbRun(`
                INSERT INTO proyectos (nombre, responsable, estado, observaciones, sede, tipo_inventario)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [nombre.trim(), responsable, estado || 'Activo', observaciones, sedeVal, tipoInvVal]);
        }
        res.json({ success: true, message: 'Proyecto guardado correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/proyectos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const proyecto = await dbGet(`SELECT * FROM proyectos WHERE id = ?`, [id]);
        if (!proyecto) {
            return res.status(404).json({ success: false, error: 'El proyecto especificado no existe.' });
        }

        // Validar si tiene transacciones en movimientos
        const movCount = await dbGet(`
            SELECT COUNT(*) as count FROM movimientos 
            WHERE proyecto_destino = ?
        `, [proyecto.nombre]);

        if (movCount && movCount.count > 0) {
            return res.status(400).json({ 
                success: false, 
                error: `No es posible eliminar el proyecto "${proyecto.nombre}" porque tiene ${movCount.count} entregas o despachos registrados en el historial de movimientos. Si ya finalizó, puede cambiar su estado a "Inactivo".` 
            });
        }

        await dbRun(`DELETE FROM proyectos WHERE id = ?`, [id]);
        res.json({ success: true, message: `Proyecto "${proyecto.nombre}" eliminado correctamente.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ------------------------------------------
// CRUD DE CATEGORÍAS
// ------------------------------------------
app.get('/api/categorias', async (req, res) => {
    try {
        const categorias = await dbAll(`
            SELECT l.id, l.valor as nombre, l.orden,
                   (SELECT COUNT(*) FROM items i WHERE LOWER(TRIM(i.categoria)) = LOWER(TRIM(l.valor))) as total_items
            FROM listas_config l
            WHERE l.tipo = 'categoria'
            ORDER BY l.orden ASC, l.valor ASC
        `);
        res.json({ success: true, data: categorias });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/categorias', async (req, res) => {
    try {
        let { nombre, orden } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre de la categoría es obligatorio.' });
        }
        nombre = nombre.trim();

        // Verificar si ya existe
        const existing = await dbGet(`SELECT * FROM listas_config WHERE tipo = 'categoria' AND LOWER(valor) = LOWER(?)`, [nombre]);
        if (existing) {
            return res.status(400).json({ success: false, error: `La categoría "${nombre}" ya existe.` });
        }

        if (orden === undefined || orden === null || isNaN(parseInt(orden, 10))) {
            const maxOrdenRow = await dbGet(`SELECT MAX(orden) as max_ord FROM listas_config WHERE tipo = 'categoria'`);
            orden = (maxOrdenRow && maxOrdenRow.max_ord ? maxOrdenRow.max_ord : 0) + 1;
        }

        await dbRun(`INSERT INTO listas_config (tipo, valor, orden) VALUES ('categoria', ?, ?)`, [nombre, parseInt(orden, 10)]);
        res.json({ success: true, message: `Categoría "${nombre}" creada exitosamente.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/categorias/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let { nombre, orden } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre de la categoría es obligatorio.' });
        }
        nombre = nombre.trim();

        const currentCat = await dbGet(`SELECT * FROM listas_config WHERE id = ? AND tipo = 'categoria'`, [id]);
        if (!currentCat) {
            return res.status(404).json({ success: false, error: 'La categoría especificada no existe.' });
        }

        // Verificar si otro registro ya tiene ese nombre
        const dup = await dbGet(`SELECT * FROM listas_config WHERE tipo = 'categoria' AND LOWER(valor) = LOWER(?) AND id != ?`, [nombre, id]);
        if (dup) {
            return res.status(400).json({ success: false, error: `Ya existe otra categoría con el nombre "${nombre}".` });
        }

        const oldNombre = currentCat.valor;
        const ordVal = (orden !== undefined && !isNaN(parseInt(orden, 10))) ? parseInt(orden, 10) : currentCat.orden;

        await dbRun(`UPDATE listas_config SET valor = ?, orden = ? WHERE id = ?`, [nombre, ordVal, id]);

        // Actualización en cascada para ítems existentes
        if (oldNombre !== nombre) {
            await dbRun(`UPDATE items SET categoria = ? WHERE LOWER(TRIM(categoria)) = LOWER(TRIM(?))`, [nombre, oldNombre]);
        }

        res.json({ success: true, message: `Categoría "${nombre}" modificada exitosamente.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/categorias/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const cat = await dbGet(`SELECT * FROM listas_config WHERE id = ? AND tipo = 'categoria'`, [id]);
        if (!cat) {
            return res.status(404).json({ success: false, error: 'La categoría no existe.' });
        }

        // Validar si hay ítems usando esta categoría
        const itemsCount = await dbGet(`SELECT COUNT(*) as count FROM items WHERE LOWER(TRIM(categoria)) = LOWER(TRIM(?))`, [cat.valor]);
        if (itemsCount && itemsCount.count > 0) {
            return res.status(400).json({
                success: false,
                error: `No es posible eliminar la categoría "${cat.valor}" porque tiene ${itemsCount.count} ítems asociados en el inventario. Modifique o reasigne dichos ítems antes de proceder.`
            });
        }

        await dbRun(`DELETE FROM listas_config WHERE id = ?`, [id]);
        res.json({ success: true, message: `Categoría "${cat.valor}" eliminada exitosamente.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ------------------------------------------
// CRUD DE UBICACIONES FÍSICAS (CDS)
// ------------------------------------------
app.get('/api/ubicaciones', async (req, res) => {
    try {
        const ubicaciones = await dbAll(`
            SELECT l.id, l.valor as nombre, l.orden,
                   (SELECT COUNT(*) FROM items i WHERE LOWER(TRIM(i.ubicacion_cds)) = LOWER(TRIM(l.valor))) as total_items
            FROM listas_config l
            WHERE l.tipo = 'ubicacion_cds'
            ORDER BY l.orden ASC, l.valor ASC
        `);
        res.json({ success: true, data: ubicaciones });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/ubicaciones', async (req, res) => {
    try {
        let { nombre, orden } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre o código de ubicación es obligatorio.' });
        }
        nombre = nombre.trim().toUpperCase();

        // Verificar si ya existe
        const existing = await dbGet(`SELECT * FROM listas_config WHERE tipo = 'ubicacion_cds' AND LOWER(valor) = LOWER(?)`, [nombre]);
        if (existing) {
            return res.status(400).json({ success: false, error: `La ubicación "${nombre}" ya existe en el sistema.` });
        }

        if (orden === undefined || orden === null || isNaN(parseInt(orden, 10))) {
            const maxOrdenRow = await dbGet(`SELECT MAX(orden) as max_ord FROM listas_config WHERE tipo = 'ubicacion_cds'`);
            orden = (maxOrdenRow && maxOrdenRow.max_ord ? maxOrdenRow.max_ord : 0) + 1;
        }

        await dbRun(`INSERT INTO listas_config (tipo, valor, orden) VALUES ('ubicacion_cds', ?, ?)`, [nombre, parseInt(orden, 10)]);
        res.json({ success: true, message: `Ubicación "${nombre}" creada exitosamente.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/ubicaciones/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let { nombre, orden } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre o código de ubicación es obligatorio.' });
        }
        nombre = nombre.trim().toUpperCase();

        const currentUbi = await dbGet(`SELECT * FROM listas_config WHERE id = ? AND tipo = 'ubicacion_cds'`, [id]);
        if (!currentUbi) {
            return res.status(404).json({ success: false, error: 'La ubicación especificada no existe.' });
        }

        // Verificar si otro registro ya tiene ese nombre
        const dup = await dbGet(`SELECT * FROM listas_config WHERE tipo = 'ubicacion_cds' AND LOWER(valor) = LOWER(?) AND id != ?`, [nombre, id]);
        if (dup) {
            return res.status(400).json({ success: false, error: `Ya existe otra ubicación con el nombre "${nombre}".` });
        }

        const oldNombre = currentUbi.valor;
        const ordVal = (orden !== undefined && !isNaN(parseInt(orden, 10))) ? parseInt(orden, 10) : currentUbi.orden;

        await dbRun(`UPDATE listas_config SET valor = ?, orden = ? WHERE id = ?`, [nombre, ordVal, id]);

        // Actualización en cascada para ítems existentes
        if (oldNombre !== nombre) {
            await dbRun(`UPDATE items SET ubicacion_cds = ? WHERE LOWER(TRIM(ubicacion_cds)) = LOWER(TRIM(?))`, [nombre, oldNombre]);
        }

        res.json({ success: true, message: `Ubicación "${nombre}" modificada exitosamente.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/ubicaciones/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const ubi = await dbGet(`SELECT * FROM listas_config WHERE id = ? AND tipo = 'ubicacion_cds'`, [id]);
        if (!ubi) {
            return res.status(404).json({ success: false, error: 'La ubicación no existe.' });
        }

        // Validar si hay ítems usando esta ubicación
        const itemsCount = await dbGet(`SELECT COUNT(*) as count FROM items WHERE LOWER(TRIM(ubicacion_cds)) = LOWER(TRIM(?))`, [ubi.valor]);
        if (itemsCount && itemsCount.count > 0) {
            return res.status(400).json({
                success: false,
                error: `No es posible eliminar la ubicación "${ubi.valor}" porque tiene ${itemsCount.count} ítem(s) asociados en el inventario. Reasigne la ubicación de dichos ítems antes de proceder.`
            });
        }

        await dbRun(`DELETE FROM listas_config WHERE id = ?`, [id]);
        res.json({ success: true, message: `Ubicación "${ubi.valor}" eliminada exitosamente.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 6. TRASLADOS ENTRE BODEGAS CENTRALES Y TRASLADOS PENDIENTES
// ==========================================

// 6.1. Conteo de traslados pendientes para Badges de notificación
app.get('/api/traslados/pendientes-count', async (req, res) => {
    try {
        const counts = await dbAll(`
            SELECT 
                sede_destino, 
                tipo_inventario_destino, 
                COUNT(*) as total_pendientes
            FROM traslados_pendientes
            WHERE estado = 'PENDIENTE'
            GROUP BY sede_destino, tipo_inventario_destino
        `);

        res.json({ success: true, data: counts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6.2. Listar traslados con filtros de contexto (Entrantes, Salientes, Histórico)
app.get('/api/traslados', async (req, res) => {
    try {
        const { sede, tipo_inventario, filtro, estado, search } = req.query;
        let query = `SELECT * FROM traslados_pendientes WHERE 1=1`;
        const params = [];

        if (filtro === 'entrantes') {
            if (sede && sede !== 'ALL') {
                query += ` AND sede_destino = ?`;
                params.push(sede);
            }
            if (tipo_inventario && tipo_inventario !== 'ALL') {
                query += ` AND tipo_inventario_destino = ?`;
                params.push(tipo_inventario);
            }
        } else if (filtro === 'salientes') {
            if (sede && sede !== 'ALL') {
                query += ` AND sede_origen = ?`;
                params.push(sede);
            }
            if (tipo_inventario && tipo_inventario !== 'ALL') {
                query += ` AND tipo_inventario_origen = ?`;
                params.push(tipo_inventario);
            }
        } else {
            // Todos los traslados relacionados con la sede / inventario activos
            if (sede && sede !== 'ALL') {
                query += ` AND (sede_origen = ? OR sede_destino = ?)`;
                params.push(sede, sede);
            }
            if (tipo_inventario && tipo_inventario !== 'ALL') {
                query += ` AND (tipo_inventario_origen = ? OR tipo_inventario_destino = ?)`;
                params.push(tipo_inventario, tipo_inventario);
            }
        }

        if (estado && estado !== 'ALL') {
            query += ` AND estado = ?`;
            params.push(estado);
        }

        if (search) {
            query += ` AND (n_traslado LIKE ? OR CAST(codigo_item AS TEXT) LIKE ? OR nombre_item LIKE ? OR responsable_solicita LIKE ? OR documento_referencia LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY id DESC`;

        const traslados = await dbAll(query, params);
        res.json({ success: true, count: traslados.length, data: traslados });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6.3. Emisión de nuevo Traslado entre Bodegas Centrales (Estado: PENDIENTE)
app.post('/api/traslados', async (req, res) => {
    try {
        const {
            sede_origen,
            tipo_inventario_origen,
            sede_destino,
            tipo_inventario_destino,
            codigo_item,
            cantidad,
            responsable_solicita,
            documento_referencia,
            observaciones
        } = req.body;

        // Validaciones obligatorias
        if (!sede_origen || !tipo_inventario_origen || !sede_destino || !tipo_inventario_destino) {
            return res.status(400).json({ success: false, error: 'Debe especificar sede y tipo de inventario de origen y destino.' });
        }

        if (sede_origen === sede_destino && tipo_inventario_origen === tipo_inventario_destino) {
            return res.status(400).json({ success: false, error: 'La bodega central de origen y destino no pueden ser exactamente las mismas.' });
        }

        if (!codigo_item) {
            return res.status(400).json({ success: false, error: 'Debe seleccionar un ítem para trasladar.' });
        }

        const numCantidad = parseFloat(cantidad);
        if (isNaN(numCantidad) || numCantidad <= 0) {
            return res.status(400).json({ success: false, error: 'La cantidad a trasladar debe ser mayor a 0.' });
        }

        if (!responsable_solicita || !responsable_solicita.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre del responsable solicitante es obligatorio.' });
        }

        // Obtener ítem del catálogo maestro
        const item = await dbGet(`SELECT * FROM items WHERE codigo = ?`, [parseInt(codigo_item, 10)]);
        if (!item) {
            return res.status(404).json({ success: false, error: `El ítem con código ${codigo_item} no existe en el catálogo.` });
        }

        // Validar existencia en la Bodega Central de Origen
        const stockData = await dbGet(`
            SELECT 
                COALESCE(SUM(
                    CASE WHEN tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'AJUSTE POSITIVO', 'ENTRADA POR TRASLADO') AND (bodega_destino = 'CDS' OR bodega_destino IS NULL) THEN cantidad ELSE 0 END
                ), 0) -
                COALESCE(SUM(
                    CASE WHEN tipo_movimiento IN ('ENTREGA', 'DISPOSICION FINAL', 'AJUSTE NEGATIVO', 'SALIDA POR TRASLADO') AND (bodega_origen = 'CDS' OR bodega_origen IS NULL) THEN cantidad ELSE 0 END
                ), 0) AS stock_disponible
            FROM movimientos
            WHERE sede = ? AND tipo_inventario = ? AND codigo_item = ?
        `, [sede_origen, tipo_inventario_origen, item.codigo]);

        const stockDisponible = stockData ? (stockData.stock_disponible || 0) : 0;
        if (stockDisponible < numCantidad) {
            return res.status(400).json({ 
                success: false, 
                error: `Stock insuficiente en ${sede_origen} [${tipo_inventario_origen}]. Existencias disponibles: ${stockDisponible} ${item.unidad_medida}. Cantidad solicitada: ${numCantidad} ${item.unidad_medida}.` 
            });
        }

        // Generar consecutivo TR-000001
        const countRow = await dbGet(`SELECT MAX(id) as max_id FROM traslados_pendientes`);
        const nextId = (countRow && countRow.max_id ? countRow.max_id : 0) + 1;
        const n_traslado = `TR-${String(nextId).padStart(6, '0')}`;

        const now = new Date();
        const fecha_solicitud = now.toISOString().split('T')[0];
        const hora_solicitud = now.toTimeString().split(' ')[0].substring(0, 5);

        await dbRun(`
            INSERT INTO traslados_pendientes (
                n_traslado, fecha_solicitud, hora_solicitud,
                sede_origen, tipo_inventario_origen, bodega_origen,
                sede_destino, tipo_inventario_destino, bodega_destino,
                codigo_item, nombre_item, cantidad, unidad,
                responsable_solicita, documento_referencia, observaciones, estado
            ) VALUES (?, ?, ?, ?, ?, 'CDS', ?, ?, 'CDS', ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')
        `, [
            n_traslado, fecha_solicitud, hora_solicitud,
            sede_origen, tipo_inventario_origen,
            sede_destino, tipo_inventario_destino,
            item.codigo, item.nombre, numCantidad, item.unidad_medida,
            responsable_solicita.trim(), documento_referencia ? documento_referencia.trim() : 'TRASLADO-MANUAL',
            observaciones ? observaciones.trim() : null
        ]);

        res.json({
            success: true,
            message: `Solicitud de traslado ${n_traslado} emitida exitosamente. Ha sido enviada a la bandeja de Traslados Pendientes de ${sede_destino} [${tipo_inventario_destino}].`,
            n_traslado
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6.4. Aceptar Traslado (Genera Movimiento de Salida en Origen y Entrada en Destino)
app.post('/api/traslados/:id/aceptar', async (req, res) => {
    try {
        const { id } = req.params;
        const { responsable_recibe } = req.body;

        if (!responsable_recibe || !responsable_recibe.trim()) {
            return res.status(400).json({ success: false, error: 'Debe ingresar el nombre de la persona o responsable que recibe el traslado.' });
        }

        const traslado = await dbGet(`SELECT * FROM traslados_pendientes WHERE id = ?`, [id]);
        if (!traslado) {
            return res.status(404).json({ success: false, error: 'El traslado solicitado no existe.' });
        }

        if (traslado.estado !== 'PENDIENTE') {
            return res.status(400).json({ success: false, error: `Este traslado ya se encuentra ${traslado.estado} y no puede ser procesado nuevamente.` });
        }

        // Revalidar stock en origen
        const stockData = await dbGet(`
            SELECT 
                COALESCE(SUM(
                    CASE WHEN tipo_movimiento IN ('ENTRADA', 'DEVOLUCION', 'AJUSTE POSITIVO', 'ENTRADA POR TRASLADO') AND (bodega_destino = 'CDS' OR bodega_destino IS NULL) THEN cantidad ELSE 0 END
                ), 0) -
                COALESCE(SUM(
                    CASE WHEN tipo_movimiento IN ('ENTREGA', 'DISPOSICION FINAL', 'AJUSTE NEGATIVO', 'SALIDA POR TRASLADO') AND (bodega_origen = 'CDS' OR bodega_origen IS NULL) THEN cantidad ELSE 0 END
                ), 0) AS stock_disponible
            FROM movimientos
            WHERE sede = ? AND tipo_inventario = ? AND codigo_item = ?
        `, [traslado.sede_origen, traslado.tipo_inventario_origen, traslado.codigo_item]);

        const stockDisponible = stockData ? (stockData.stock_disponible || 0) : 0;
        if (stockDisponible < traslado.cantidad) {
            return res.status(400).json({ 
                success: false, 
                error: `No se puede aceptar el traslado: La bodega central de origen (${traslado.sede_origen} [${traslado.tipo_inventario_origen}]) no tiene stock suficiente al momento de la recepción. Stock actual: ${stockDisponible} ${traslado.unidad}.` 
            });
        }

        const now = new Date();
        const fecha_resolucion = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0].substring(0, 5)}`;
        const fecha = now.toISOString().split('T')[0];
        const hora = now.toTimeString().split(' ')[0].substring(0, 5);

        // 1. Generar Consecutivo de Salida en Origen
        const maxMovRow = await dbGet(`SELECT MAX(id) as max_id FROM movimientos`);
        const nextMovId1 = (maxMovRow && maxMovRow.max_id ? maxMovRow.max_id : 0) + 1;
        const n_mov_salida = `MOV-${String(nextMovId1).padStart(6, '0')}`;

        // 2. Generar Consecutivo de Entrada en Destino
        const nextMovId2 = nextMovId1 + 1;
        const n_mov_entrada = `MOV-${String(nextMovId2).padStart(6, '0')}`;

        // Obtener ubicación del ítem
        const itemInfo = await dbGet(`SELECT ubicacion_cds, aplica_vencimiento FROM items WHERE codigo = ?`, [traslado.codigo_item]);
        const ubicacion = itemInfo ? itemInfo.ubicacion_cds : 'A1';

        // 3. Registrar Movimiento de Salida (Descuento de la Bodega Central de Origen)
        await dbRun(`
            INSERT INTO movimientos (
                n_movimiento, fecha, hora, tipo_movimiento,
                codigo_item, nombre_item, cantidad, unidad,
                bodega_origen, bodega_destino, ubicacion_cds,
                proyecto_destino, responsable, persona_recibe_devuelve,
                documento_referencia, observaciones, sede, tipo_inventario
            ) VALUES (?, ?, ?, 'SALIDA POR TRASLADO', ?, ?, ?, ?, 'CDS', 'TRASLADOS', ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            n_mov_salida, fecha, hora,
            traslado.codigo_item, traslado.nombre_item, traslado.cantidad, traslado.unidad,
            ubicacion,
            `Traslado hacia ${traslado.sede_destino} (${traslado.tipo_inventario_destino})`,
            traslado.responsable_solicita,
            responsable_recibe.trim(),
            traslado.n_traslado,
            `Despacho por Traslado Aceptado ${traslado.n_traslado}. Receptor: ${responsable_recibe.trim()}. ${traslado.observaciones ? 'Obs: ' + traslado.observaciones : ''}`,
            traslado.sede_origen,
            traslado.tipo_inventario_origen
        ]);

        // 4. Registrar Movimiento de Entrada (Ingreso a la Bodega Central de Destino)
        await dbRun(`
            INSERT INTO movimientos (
                n_movimiento, fecha, hora, tipo_movimiento,
                codigo_item, nombre_item, cantidad, unidad,
                bodega_origen, bodega_destino, ubicacion_cds,
                proyecto_destino, responsable, persona_recibe_devuelve,
                documento_referencia, observaciones, sede, tipo_inventario
            ) VALUES (?, ?, ?, 'ENTRADA POR TRASLADO', ?, ?, ?, ?, 'TRASLADOS', 'CDS', ?, NULL, ?, ?, ?, ?, ?, ?)
        `, [
            n_mov_entrada, fecha, hora,
            traslado.codigo_item, traslado.nombre_item, traslado.cantidad, traslado.unidad,
            ubicacion,
            responsable_recibe.trim(),
            traslado.responsable_solicita,
            traslado.n_traslado,
            `Recepción de Traslado Aceptado ${traslado.n_traslado} desde ${traslado.sede_origen} (${traslado.tipo_inventario_origen}). Emisor: ${traslado.responsable_solicita}.`,
            traslado.sede_destino,
            traslado.tipo_inventario_destino
        ]);

        // 5. Traspaso de lotes de vencimiento si el ítem aplica
        if (itemInfo && itemInfo.aplica_vencimiento) {
            const loteOrigen = await dbGet(`
                SELECT * FROM control_vencimientos 
                WHERE codigo_item = ? AND sede = ? AND tipo_inventario = ? AND cant_disponible > 0
                ORDER BY fecha_vencimiento ASC LIMIT 1
            `, [traslado.codigo_item, traslado.sede_origen, traslado.tipo_inventario_origen]);

            if (loteOrigen) {
                const cantATrasladar = Math.min(loteOrigen.cant_disponible, traslado.cantidad);
                // Reducir lote origen
                await dbRun(`
                    UPDATE control_vencimientos 
                    SET cant_disponible = cant_disponible - ?
                    WHERE id = ?
                `, [cantATrasladar, loteOrigen.id]);

                // Crear o sumar lote destino
                await dbRun(`
                    INSERT INTO control_vencimientos (
                        codigo_item, nombre_item, bodega, fecha_ingreso,
                        fecha_vencimiento, cant_inicial, cant_disponible,
                        estado, observaciones, n_movimiento_origen, sede, tipo_inventario
                    ) VALUES (?, ?, 'CDS', ?, ?, ?, ?, 'VIGENTE', ?, ?, ?, ?)
                `, [
                    traslado.codigo_item, traslado.nombre_item, fecha,
                    loteOrigen.fecha_vencimiento, cantATrasladar, cantATrasladar,
                    `Lote recibido por traslado ${traslado.n_traslado}`,
                    n_mov_entrada, traslado.sede_destino, traslado.tipo_inventario_destino
                ]);
            }
        }

        // 6. Actualizar Estado del Traslado a ACEPTADO
        await dbRun(`
            UPDATE traslados_pendientes
            SET estado = 'ACEPTADO',
                fecha_resolucion = ?,
                responsable_recibe = ?,
                n_movimiento_salida = ?,
                n_movimiento_entrada = ?
            WHERE id = ?
        `, [fecha_resolucion, responsable_recibe.trim(), n_mov_salida, n_mov_entrada, id]);

        res.json({
            success: true,
            message: `Traslado ${traslado.n_traslado} aceptado y completado exitosamente. Se descontaron ${traslado.cantidad} ${traslado.unidad} de ${traslado.sede_origen} (${traslado.tipo_inventario_origen}) y se sumaron a ${traslado.sede_destino} (${traslado.tipo_inventario_destino}).`,
            n_mov_salida,
            n_mov_entrada
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6.5. Rechazar Traslado
app.post('/api/traslados/:id/rechazar', async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo_rechazo, responsable_recibe } = req.body;

        if (!motivo_rechazo || !motivo_rechazo.trim()) {
            return res.status(400).json({ success: false, error: 'Debe especificar el motivo del rechazo del traslado.' });
        }

        const traslado = await dbGet(`SELECT * FROM traslados_pendientes WHERE id = ?`, [id]);
        if (!traslado) {
            return res.status(404).json({ success: false, error: 'El traslado solicitado no existe.' });
        }

        if (traslado.estado !== 'PENDIENTE') {
            return res.status(400).json({ success: false, error: `Este traslado ya se encuentra ${traslado.estado} y no puede ser rechazado.` });
        }

        const now = new Date();
        const fecha_resolucion = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0].substring(0, 5)}`;

        await dbRun(`
            UPDATE traslados_pendientes
            SET estado = 'RECHAZADO',
                fecha_resolucion = ?,
                motivo_rechazo = ?,
                responsable_recibe = ?
            WHERE id = ?
        `, [fecha_resolucion, motivo_rechazo.trim(), responsable_recibe ? responsable_recibe.trim() : 'Receptor Destino', id]);

        res.json({
            success: true,
            message: `Traslado ${traslado.n_traslado} ha sido RECHAZADO. No se realizó ningún movimiento ni cambio en los inventarios.`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6.6. Cancelar Traslado (por parte del emisor)
app.post('/api/traslados/:id/cancelar', async (req, res) => {
    try {
        const { id } = req.params;
        const traslado = await dbGet(`SELECT * FROM traslados_pendientes WHERE id = ?`, [id]);
        if (!traslado) {
            return res.status(404).json({ success: false, error: 'El traslado solicitado no existe.' });
        }

        if (traslado.estado !== 'PENDIENTE') {
            return res.status(400).json({ success: false, error: `Solo se pueden cancelar traslados en estado PENDIENTE.` });
        }

        const now = new Date();
        const fecha_resolucion = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0].substring(0, 5)}`;

        await dbRun(`
            UPDATE traslados_pendientes
            SET estado = 'CANCELADO',
                fecha_resolucion = ?,
                motivo_rechazo = 'Cancelado por el solicitante en origen'
            WHERE id = ?
        `, [fecha_resolucion, id]);

        res.json({
            success: true,
            message: `Traslado ${traslado.n_traslado} cancelado exitosamente.`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/config', async (req, res) => {
    try {
        const sedes = await dbAll(`SELECT * FROM sedes WHERE estado = 'Activa' ORDER BY id ASC`);
        const tipos_inventario = await dbAll(`SELECT * FROM tipos_inventario ORDER BY id ASC`);
        let categorias = (await dbAll(`SELECT DISTINCT valor FROM listas_config WHERE tipo = 'categoria' ORDER BY orden ASC`)).map(r => r.valor);
        let unidades = (await dbAll(`SELECT DISTINCT valor FROM listas_config WHERE tipo = 'unidad_medida' ORDER BY orden ASC`)).map(r => r.valor);
        let ubicacionesList = (await dbAll(`SELECT valor FROM listas_config WHERE tipo = 'ubicacion_cds' ORDER BY orden ASC, valor ASC`)).map(r => r.valor);
        let causales = (await dbAll(`SELECT DISTINCT valor FROM listas_config WHERE tipo = 'causal_disposicion' ORDER BY orden ASC`)).map(r => r.valor);
        let bodegas = (await dbAll(`SELECT nombre FROM bodegas WHERE estado = 'Activa' ORDER BY codigo ASC`)).map(r => r.nombre);
        let proyectos = (await dbAll(`SELECT nombre FROM proyectos WHERE estado = 'Activo' ORDER BY nombre ASC`)).map(r => r.nombre);

        // Incluir ubicaciones activas en listas_config y cualquier ubicación existente en ítems
        const itemUbicaciones = (await dbAll(`SELECT DISTINCT ubicacion_cds FROM items WHERE ubicacion_cds IS NOT NULL AND ubicacion_cds != '' AND ubicacion_cds != '-'`)).map(r => r.ubicacion_cds);
        
        const setUbicaciones = new Set(ubicacionesList);
        itemUbicaciones.forEach(u => setUbicaciones.add(u));
        let ubicaciones = Array.from(setUbicaciones).filter(Boolean);

        const causales_movimientos = await dbAll(`SELECT * FROM causales_movimientos WHERE estado = 'Activo' ORDER BY tipo_movimiento ASC, orden ASC`);
        const permisos = await dbAll(`SELECT * FROM permisos WHERE estado = 'Activo' ORDER BY id ASC`);

        res.json({
            success: true,
            data: {
                sedes,
                tipos_inventario,
                categorias,
                unidades,
                ubicaciones,
                causales,
                bodegas,
                proyectos,
                causales_movimientos,
                permisos
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 7. REPORTES Y KARDEX POR ÍTEM
// ==========================================
app.get('/api/reportes/kardex/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        const item = await dbGet(`SELECT * FROM items WHERE codigo = ?`, [codigo]);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Ítem no encontrado.' });
        }

        const movimientos = await dbAll(`
            SELECT * FROM movimientos 
            WHERE codigo_item = ? 
            ORDER BY fecha ASC, hora ASC, id ASC
        `, [codigo]);

        let saldo = 0;
        const kardex = movimientos.map(m => {
            const esEntrada = ['ENTRADA', 'DEVOLUCION', 'AJUSTE POSITIVO', 'ENTRADA POR TRASLADO'].includes(m.tipo_movimiento) && (m.bodega_destino === 'CDS' || !m.bodega_destino);
            const esSalida = ['ENTREGA', 'DISPOSICION FINAL', 'AJUSTE NEGATIVO', 'SALIDA POR TRASLADO'].includes(m.tipo_movimiento) && (m.bodega_origen === 'CDS' || !m.bodega_origen);

            const entradaCant = esEntrada ? m.cantidad : 0;
            const salidaCant = esSalida ? m.cantidad : 0;
            saldo += (entradaCant - salidaCant);

            return {
                ...m,
                entrada: entradaCant,
                salida: salidaCant,
                saldo_acumulado: saldo
            };
        });

        res.json({ success: true, item, kardex, saldo_final: saldo });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 7.1. GENERADOR DE REPORTES CON FILTROS DINÁMICOS
// ==========================================
app.post('/api/reportes/filtrar', async (req, res) => {
    try {
        const {
            tipo_reporte = 'MOVIMIENTOS',
            sede,
            tipo_inventario,
            categoria,
            ubicacion,
            bodega,
            proyecto,
            tipo_movimiento,
            fecha_desde,
            fecha_hasta,
            estado_stock,
            estado_vencimiento,
            codigo_item,
            search
        } = req.body;

        if (tipo_reporte === 'MOVIMIENTOS') {
            let query = `
                SELECT m.*, i.categoria, i.subcategoria, i.marca, i.referencia
                FROM movimientos m
                LEFT JOIN items i ON m.codigo_item = i.codigo
                WHERE 1=1
            `;
            const params = [];

            if (sede && sede !== 'TODAS' && sede !== 'ALL') {
                query += ` AND m.sede = ?`;
                params.push(sede);
            }
            if (tipo_inventario && tipo_inventario !== 'TODOS' && tipo_inventario !== 'ALL') {
                query += ` AND m.tipo_inventario = ?`;
                params.push(tipo_inventario);
            }
            if (categoria && categoria !== 'TODAS' && categoria !== 'ALL') {
                query += ` AND i.categoria = ?`;
                params.push(categoria);
            }
            if (ubicacion && ubicacion !== 'TODAS' && ubicacion !== 'ALL') {
                query += ` AND (m.ubicacion_cds = ? OR i.ubicacion_cds = ?)`;
                params.push(ubicacion, ubicacion);
            }
            if (tipo_movimiento && tipo_movimiento !== 'TODOS' && tipo_movimiento !== 'ALL') {
                query += ` AND m.tipo_movimiento = ?`;
                params.push(tipo_movimiento);
            }
            if (bodega && bodega !== 'TODAS' && bodega !== 'ALL') {
                query += ` AND (m.bodega_origen = ? OR m.bodega_destino = ?)`;
                params.push(bodega, bodega);
            }
            if (proyecto && proyecto !== 'TODOS' && proyecto !== 'ALL') {
                query += ` AND m.proyecto_destino = ?`;
                params.push(proyecto);
            }
            if (fecha_desde) {
                query += ` AND m.fecha >= ?`;
                params.push(fecha_desde);
            }
            if (fecha_hasta) {
                query += ` AND m.fecha <= ?`;
                params.push(fecha_hasta);
            }
            if (codigo_item) {
                query += ` AND m.codigo_item = ?`;
                params.push(parseInt(codigo_item, 10));
            }
            if (search && search.trim()) {
                const s = `%${search.trim()}%`;
                query += ` AND (m.n_movimiento LIKE ? OR CAST(m.codigo_item AS TEXT) LIKE ? OR m.nombre_item LIKE ? OR m.responsable LIKE ? OR m.persona_recibe_devuelve LIKE ? OR m.documento_referencia LIKE ?)`;
                params.push(s, s, s, s, s, s);
            }

            query += ` ORDER BY m.fecha DESC, m.hora DESC, m.id DESC`;
            const data = await dbAll(query, params);
            return res.json({ success: true, count: data.length, data });
        }

        if (tipo_reporte === 'BALANCE' || tipo_reporte === 'STOCK_CRITICO') {
            let query = `SELECT * FROM items WHERE 1=1`;
            const params = [];

            if (sede && sede !== 'TODAS' && sede !== 'ALL') {
                query += ` AND (sede = ? OR sede IS NULL)`;
                params.push(sede);
            }
            if (tipo_inventario && tipo_inventario !== 'TODOS' && tipo_inventario !== 'ALL') {
                query += ` AND (tipo_inventario = ? OR tipo_inventario IS NULL)`;
                params.push(tipo_inventario);
            }
            if (categoria && categoria !== 'TODAS' && categoria !== 'ALL') {
                query += ` AND categoria = ?`;
                params.push(categoria);
            }
            if (ubicacion && ubicacion !== 'TODAS' && ubicacion !== 'ALL') {
                query += ` AND ubicacion_cds = ?`;
                params.push(ubicacion);
            }
            if (codigo_item) {
                query += ` AND codigo = ?`;
                params.push(parseInt(codigo_item, 10));
            }
            if (search && search.trim()) {
                const s = `%${search.trim()}%`;
                query += ` AND (CAST(codigo AS TEXT) LIKE ? OR nombre LIKE ? OR marca LIKE ? OR referencia LIKE ?)`;
                params.push(s, s, s, s);
            }

            query += ` ORDER BY codigo ASC`;
            const items = await dbAll(query, params);

            let movFilter = `WHERE 1=1`;
            let movParams = [];
            if (sede && sede !== 'TODAS' && sede !== 'ALL') {
                movFilter += ` AND sede = ?`;
                movParams.push(sede);
            }
            if (tipo_inventario && tipo_inventario !== 'TODOS' && tipo_inventario !== 'ALL') {
                movFilter += ` AND tipo_inventario = ?`;
                movParams.push(tipo_inventario);
            }
            if (fecha_hasta) {
                movFilter += ` AND fecha <= ?`;
                movParams.push(fecha_hasta);
            }

            const movimientos = await dbAll(`SELECT * FROM movimientos ${movFilter}`, movParams);

            const movByItem = {};
            movimientos.forEach(m => {
                if (!movByItem[m.codigo_item]) {
                    movByItem[m.codigo_item] = {
                        entradas: 0,
                        devoluciones: 0,
                        entregas_recibidas: 0,
                        ajustes_pos: 0,
                        entregas_enviadas: 0,
                        disp_final: 0,
                        ajustes_neg: 0
                    };
                }
                const b = movByItem[m.codigo_item];
                if (m.tipo_movimiento === 'ENTRADA' && (m.bodega_destino === 'CDS' || !m.bodega_destino)) b.entradas += m.cantidad;
                if (m.tipo_movimiento === 'DEVOLUCION' && m.bodega_destino === 'CDS') b.devoluciones += m.cantidad;
                if (m.tipo_movimiento === 'ENTRADA POR TRASLADO' && m.bodega_destino === 'CDS') b.entregas_recibidas += m.cantidad;
                if (m.tipo_movimiento === 'AJUSTE POSITIVO' && (m.bodega_destino === 'CDS' || !m.bodega_destino)) b.ajustes_pos += m.cantidad;
                if (m.tipo_movimiento === 'ENTREGA' && (m.bodega_origen === 'CDS' || !m.bodega_origen)) b.entregas_enviadas += m.cantidad;
                if (m.tipo_movimiento === 'DISPOSICION FINAL' && (m.bodega_origen === 'CDS' || !m.bodega_origen)) b.disp_final += m.cantidad;
                if (m.tipo_movimiento === 'SALIDA POR TRASLADO' && (m.bodega_origen === 'CDS' || !m.bodega_origen)) b.entregas_enviadas += m.cantidad;
                if (m.tipo_movimiento === 'AJUSTE NEGATIVO' && (m.bodega_origen === 'CDS' || !m.bodega_origen)) b.ajustes_neg += m.cantidad;
            });

            let balance = items.map(item => {
                const b = movByItem[item.codigo] || { entradas: 0, devoluciones: 0, entregas_recibidas: 0, ajustes_pos: 0, entregas_enviadas: 0, disp_final: 0, ajustes_neg: 0 };
                const totalPos = b.entradas + b.devoluciones + b.entregas_recibidas + b.ajustes_pos;
                const totalNeg = b.entregas_enviadas + b.disp_final + b.ajustes_neg;
                const existencia = totalPos - totalNeg;

                let estado_stock = 'NORMAL';
                if (existencia < 0) estado_stock = 'ERROR: SOBREGIRO';
                else if (existencia === 0) estado_stock = 'SIN EXISTENCIAS';
                else if (existencia <= item.stock_minimo) estado_stock = 'STOCK BAJO';

                return {
                    codigo: item.codigo,
                    codigo_item: item.codigo,
                    nombre: item.nombre,
                    nombre_item: item.nombre,
                    categoria: item.categoria,
                    subcategoria: item.subcategoria,
                    unidad_medida: item.unidad_medida,
                    marca: item.marca,
                    referencia: item.referencia,
                    ubicacion_cds: item.ubicacion_cds,
                    sede: item.sede || sede || 'Sede Suroriental',
                    tipo_inventario: item.tipo_inventario || tipo_inventario || 'CDS',
                    entradas: b.entradas,
                    devoluciones: b.devoluciones,
                    entregas_recibidas: b.entregas_recibidas,
                    ajustes_pos: b.ajustes_pos,
                    entregas_enviadas: b.entregas_enviadas,
                    disp_final: b.disp_final,
                    ajustes_neg: b.ajustes_neg,
                    existencia,
                    stock_minimo: item.stock_minimo,
                    estado_stock,
                    aplica_vencimiento: item.aplica_vencimiento
                };
            });

            if (tipo_reporte === 'STOCK_CRITICO' || estado_stock === 'CRITICO_O_BAJO') {
                balance = balance.filter(i => i.existencia <= i.stock_minimo || i.estado_stock === 'SIN EXISTENCIAS');
            } else if (estado_stock === 'CON_STOCK') {
                balance = balance.filter(i => i.existencia > 0);
            } else if (estado_stock === 'SIN_EXISTENCIAS') {
                balance = balance.filter(i => i.existencia === 0);
            } else if (estado_stock === 'STOCK_BAJO') {
                balance = balance.filter(i => i.estado_stock === 'STOCK BAJO');
            }

            return res.json({ success: true, count: balance.length, data: balance });
        }

        if (tipo_reporte === 'VENCIMIENTOS') {
            let query = `
                SELECT cv.*, i.categoria, i.unidad_medida as item_unidad
                FROM control_vencimientos cv
                LEFT JOIN items i ON cv.codigo_item = i.codigo
                WHERE cv.cant_disponible > 0
            `;
            const params = [];

            if (sede && sede !== 'TODAS' && sede !== 'ALL') {
                query += ` AND cv.sede = ?`;
                params.push(sede);
            }
            if (tipo_inventario && tipo_inventario !== 'TODOS' && tipo_inventario !== 'ALL') {
                query += ` AND cv.tipo_inventario = ?`;
                params.push(tipo_inventario);
            }
            if (categoria && categoria !== 'TODAS' && categoria !== 'ALL') {
                query += ` AND i.categoria = ?`;
                params.push(categoria);
            }
            if (bodega && bodega !== 'TODAS' && bodega !== 'ALL') {
                query += ` AND cv.bodega = ?`;
                params.push(bodega);
            }
            if (fecha_hasta) {
                query += ` AND cv.fecha_vencimiento <= ?`;
                params.push(fecha_hasta);
            }
            if (search && search.trim()) {
                const s = `%${search.trim()}%`;
                query += ` AND (CAST(cv.codigo_item AS TEXT) LIKE ? OR cv.nombre_item LIKE ? OR cv.n_movimiento_origen LIKE ?)`;
                params.push(s, s, s);
            }

            query += ` ORDER BY cv.fecha_vencimiento ASC`;
            const lotes = await dbAll(query, params);

            const hoyStr = new Date().toISOString().split('T')[0];
            let processed = lotes.map(lote => {
                const diffDias = Math.ceil((new Date(lote.fecha_vencimiento) - new Date(hoyStr)) / (1000 * 60 * 60 * 24));
                let estadoAct = 'VIGENTE';
                if (diffDias <= 0) estadoAct = '¡VENCIDO!';
                else if (diffDias <= 30) estadoAct = 'PROXIMO A VENCER';

                return {
                    ...lote,
                    dias_restantes: diffDias,
                    estado_actualizado: estadoAct,
                    unidad_medida: lote.item_unidad || 'Unidad'
                };
            });

            if (estado_vencimiento === 'SOLO_VENCIDOS') {
                processed = processed.filter(l => l.dias_restantes <= 0);
            } else if (estado_vencimiento === 'PROXIMOS_30_DIAS') {
                processed = processed.filter(l => l.dias_restantes > 0 && l.dias_restantes <= 30);
            } else if (estado_vencimiento === 'VENCIDOS_Y_PROXIMOS') {
                processed = processed.filter(l => l.dias_restantes <= 30);
            }

            return res.json({ success: true, count: processed.length, data: processed });
        }

        if (tipo_reporte === 'CATALOGO') {
            let query = `SELECT * FROM items WHERE 1=1`;
            const params = [];

            if (sede && sede !== 'TODAS' && sede !== 'ALL') {
                query += ` AND (sede = ? OR sede IS NULL)`;
                params.push(sede);
            }
            if (tipo_inventario && tipo_inventario !== 'TODOS' && tipo_inventario !== 'ALL') {
                query += ` AND (tipo_inventario = ? OR tipo_inventario IS NULL)`;
                params.push(tipo_inventario);
            }
            if (categoria && categoria !== 'TODAS' && categoria !== 'ALL') {
                query += ` AND categoria = ?`;
                params.push(categoria);
            }
            if (ubicacion && ubicacion !== 'TODAS' && ubicacion !== 'ALL') {
                query += ` AND ubicacion_cds = ?`;
                params.push(ubicacion);
            }
            if (search && search.trim()) {
                const s = `%${search.trim()}%`;
                query += ` AND (CAST(codigo AS TEXT) LIKE ? OR nombre LIKE ? OR marca LIKE ? OR referencia LIKE ?)`;
                params.push(s, s, s, s);
            }

            query += ` ORDER BY codigo ASC`;
            const data = await dbAll(query, params);
            return res.json({ success: true, count: data.length, data });
        }

        res.status(400).json({ success: false, error: 'Tipo de reporte no reconocido.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 10. GESTIÓN, BACKUP Y RESTAURACIÓN DE BASE DE DATOS
// ==========================================

// Descargar archivo binario SQLite .db
app.get('/api/database/download', (req, res) => {
    try {
        if (!fs.existsSync(DB_PATH)) {
            return res.status(404).json({ success: false, error: 'Base de datos no encontrada en el sistema.' });
        }
        const today = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'application/x-sqlite3');
        res.setHeader('Content-Disposition', `attachment; filename="inventario_backup_${today}.db"`);
        res.download(DB_PATH, `inventario_backup_${today}.db`);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Descargar archivo JSON directamente como adjunto
app.get('/api/database/download-json', async (req, res) => {
    try {
        const items = await dbAll(`SELECT * FROM items ORDER BY codigo ASC`);
        const movimientos = await dbAll(`SELECT * FROM movimientos ORDER BY id ASC`);
        const control_vencimientos = await dbAll(`SELECT * FROM control_vencimientos ORDER BY id ASC`);
        const bodegas = await dbAll(`SELECT * FROM bodegas ORDER BY codigo ASC`);
        const proyectos = await dbAll(`SELECT * FROM proyectos ORDER BY id ASC`);
        const listas_config = await dbAll(`SELECT * FROM listas_config ORDER BY id ASC`);

        const exportData = {
            success: true,
            version: '1.0.4',
            exportedAt: new Date().toISOString(),
            data: {
                items,
                movimientos,
                control_vencimientos,
                bodegas,
                proyectos,
                listas_config
            }
        };

        const today = new Date().toISOString().split('T')[0];
        const jsonContent = JSON.stringify(exportData.data, null, 2);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="inventario_backup_completo_${today}.json"`);
        res.send(jsonContent);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Descargar Libro Excel Multi-Hoja generado en el Servidor
app.get('/api/database/download-excel', async (req, res) => {
    try {
        const items = await dbAll(`SELECT * FROM items ORDER BY codigo ASC`);
        const movimientos = await dbAll(`SELECT * FROM movimientos ORDER BY id ASC`);
        const control_vencimientos = await dbAll(`SELECT * FROM control_vencimientos ORDER BY id ASC`);
        const bodegas = await dbAll(`SELECT * FROM bodegas ORDER BY codigo ASC`);

        // Calcular inventario actual
        const inventario = items.map(it => {
            const movs = movimientos.filter(m => m.codigo_item === it.codigo);
            const entradas = movs.filter(m => m.bodega_destino === 'CDS' && m.tipo_movimiento === 'ENTRADA').reduce((a, b) => a + b.cantidad, 0);
            const salidas = movs.filter(m => m.bodega_origen === 'CDS' && (m.tipo_movimiento === 'ENTREGA' || m.tipo_movimiento === 'DISPOSICION FINAL')).reduce((a, b) => a + b.cantidad, 0);
            const saldo = entradas - salidas;
            return {
                'Codigo': it.codigo,
                'Item': it.nombre,
                'Categoria': it.categoria,
                'Unidad': it.unidad_medida,
                'Ubicacion': it.ubicacion_cds,
                'Entradas': entradas,
                'Salidas': salidas,
                'Existencia_Actual': saldo,
                'Stock_Minimo': it.stock_minimo,
                'Estado_Stock': saldo <= 0 ? 'SIN EXISTENCIAS' : (saldo <= it.stock_minimo ? 'STOCK BAJO' : 'STOCK NORMAL')
            };
        });

        const workbook = XLSX.utils.book_new();

        if (items.length > 0) {
            const wsItems = XLSX.utils.json_to_sheet(items);
            XLSX.utils.book_append_sheet(workbook, wsItems, 'ITEMS');
        }
        if (inventario.length > 0) {
            const wsInv = XLSX.utils.json_to_sheet(inventario);
            XLSX.utils.book_append_sheet(workbook, wsInv, 'INVENTARIO');
        }
        if (movimientos.length > 0) {
            const wsMov = XLSX.utils.json_to_sheet(movimientos);
            XLSX.utils.book_append_sheet(workbook, wsMov, 'MOVIMIENTOS');
        }
        if (control_vencimientos.length > 0) {
            const wsVenc = XLSX.utils.json_to_sheet(control_vencimientos);
            XLSX.utils.book_append_sheet(workbook, wsVenc, 'CONTROL_VENCIMIENTOS');
        }
        if (bodegas.length > 0) {
            const wsBod = XLSX.utils.json_to_sheet(bodegas);
            XLSX.utils.book_append_sheet(workbook, wsBod, 'BODEGAS');
        }

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const today = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="INVENTARIO_RESPALDO_COMPLETO_${today}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Descargar Plantilla Excel generada en el Servidor
app.get('/api/database/download-template', (req, res) => {
    try {
        const templateData = [
            {
                'Codigo': 7537,
                'Item': 'ABRAZADERA AJUSTABLE (UNISTRUT) 1"',
                'Cantidad': 25,
                'ESTANTERIA': 'A',
                'NIVEL': 3,
                'Categoria': 'Materiales',
                'Unidad': 'Unidad',
                'Vencimiento': 'NO APLICA'
            },
            {
                'Codigo': 7500,
                'Item': 'ESPUMA EXPANSIVA SIKA 750ML',
                'Cantidad': 19,
                'ESTANTERIA': 'A',
                'NIVEL': 2,
                'Categoria': 'Consumibles',
                'Unidad': 'Unidad',
                'Vencimiento': 'APLICA'
            },
            {
                'Codigo': 8555,
                'Item': 'DISCO DE CORTE METAL 4 1/2"',
                'Cantidad': 50,
                'ESTANTERIA': 'B',
                'NIVEL': 4,
                'Categoria': 'Consumibles',
                'Unidad': 'Unidad',
                'Vencimiento': 'NO APLICA'
            },
            {
                'Codigo': 7602,
                'Item': 'ADAPTADOR HEMBRA CONDUIT PVC 1/2"',
                'Cantidad': 0,
                'ESTANTERIA': '',
                'NIVEL': '',
                'Categoria': 'Materiales',
                'Unidad': 'Unidad',
                'Vencimiento': 'NO APLICA'
            }
        ];

        const workbook = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(templateData);
        XLSX.utils.book_append_sheet(workbook, ws, 'ITEMS');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="PLANTILLA_CARGUE_INVENTARIO.xlsx"`);
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Exportar copia de seguridad completa en JSON
app.get('/api/database/export-json', async (req, res) => {
    try {
        const items = await dbAll(`SELECT * FROM items ORDER BY codigo ASC`);
        const movimientos = await dbAll(`SELECT * FROM movimientos ORDER BY id ASC`);
        const control_vencimientos = await dbAll(`SELECT * FROM control_vencimientos ORDER BY id ASC`);
        const bodegas = await dbAll(`SELECT * FROM bodegas ORDER BY codigo ASC`);
        const proyectos = await dbAll(`SELECT * FROM proyectos ORDER BY id ASC`);
        const listas_config = await dbAll(`SELECT * FROM listas_config ORDER BY id ASC`);

        res.json({
            success: true,
            version: '1.0.4',
            exportedAt: new Date().toISOString(),
            data: {
                items,
                movimientos,
                control_vencimientos,
                bodegas,
                proyectos,
                listas_config
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Restaurar base de datos completa desde JSON
app.post('/api/database/restore-json', async (req, res) => {
    try {
        const { data } = req.body;
        if (!data || !data.items || !Array.isArray(data.items)) {
            return res.status(400).json({ success: false, error: 'El archivo JSON de respaldo no contiene una estructura válida.' });
        }

        db.serialize(async () => {
            try {
                await dbRun('BEGIN TRANSACTION');

                await dbRun('DELETE FROM movimientos');
                await dbRun('DELETE FROM control_vencimientos');
                await dbRun('DELETE FROM items');
                await dbRun('DELETE FROM bodegas');
                await dbRun('DELETE FROM proyectos');
                await dbRun('DELETE FROM listas_config');

                // Insertar items
                const itemStmt = db.prepare(`
                    INSERT INTO items (
                        codigo, nombre, categoria, subcategoria, unidad_medida, marca, referencia,
                        ubicacion_cds, aplica_vencimiento, fecha_vencimiento_default, stock_minimo,
                        estado, observaciones, fecha_registro
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                for (const it of data.items) {
                    itemStmt.run([
                        it.codigo, it.nombre, it.categoria || 'Materiales', it.subcategoria || 'General',
                        it.unidad_medida || 'Unidad', it.marca || 'Generico', it.referencia || '-',
                        it.ubicacion_cds || 'A1', it.aplica_vencimiento ? 1 : 0, it.fecha_vencimiento_default || null,
                        parseInt(it.stock_minimo || 0, 10), it.estado || 'Activo', it.observaciones || '',
                        it.fecha_registro || new Date().toISOString().split('T')[0]
                    ]);
                }
                itemStmt.finalize();

                // Insertar movimientos
                if (data.movimientos && data.movimientos.length > 0) {
                    const movStmt = db.prepare(`
                        INSERT INTO movimientos (
                            id, n_movimiento, fecha, hora, tipo_movimiento, codigo_item, nombre_item,
                            cantidad, unidad, bodega_origen, bodega_destino, causal_condicion, ubicacion_cds,
                            proyecto_destino, responsable, persona_recibe_devuelve, documento_referencia,
                            observaciones, fecha_vencimiento_lote
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    for (const m of data.movimientos) {
                        movStmt.run([
                            m.id, m.n_movimiento, m.fecha, m.hora, m.tipo_movimiento, m.codigo_item,
                            m.nombre_item, m.cantidad, m.unidad, m.bodega_origen, m.bodega_destino,
                            m.causal_condicion, m.ubicacion_cds, m.proyecto_destino, m.responsable,
                            m.persona_recibe_devuelve, m.documento_referencia, m.observaciones,
                            m.fecha_vencimiento_lote
                        ]);
                    }
                    movStmt.finalize();
                }

                // Insertar vencimientos
                if (data.control_vencimientos && data.control_vencimientos.length > 0) {
                    const vencStmt = db.prepare(`
                        INSERT INTO control_vencimientos (
                            id, codigo_item, nombre_item, bodega, fecha_ingreso, fecha_vencimiento,
                            cant_inicial, cant_disponible, estado, observaciones, n_movimiento_origen
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    for (const v of data.control_vencimientos) {
                        vencStmt.run([
                            v.id, v.codigo_item, v.nombre_item, v.bodega, v.fecha_ingreso,
                            v.fecha_vencimiento, v.cant_inicial, v.cant_disponible, v.estado,
                            v.observaciones, v.n_movimiento_origen
                        ]);
                    }
                    vencStmt.finalize();
                }

                // Insertar bodegas
                if (data.bodegas && data.bodegas.length > 0) {
                    const bodStmt = db.prepare(`INSERT INTO bodegas (codigo, nombre, ubicacion, responsable, estado, observaciones) VALUES (?, ?, ?, ?, ?, ?)`);
                    for (const b of data.bodegas) {
                        bodStmt.run([b.codigo, b.nombre, b.ubicacion, b.responsable, b.estado, b.observaciones]);
                    }
                    bodStmt.finalize();
                }

                // Insertar listas_config
                if (data.listas_config && data.listas_config.length > 0) {
                    const listStmt = db.prepare(`INSERT INTO listas_config (id, tipo, valor, orden) VALUES (?, ?, ?, ?)`);
                    for (const l of data.listas_config) {
                        listStmt.run([l.id, l.tipo, l.valor, l.orden]);
                    }
                    listStmt.finalize();
                }

                await dbRun('COMMIT');
                res.json({ success: true, message: 'Base de datos restaurada exitosamente desde archivo JSON.' });
            } catch (errInner) {
                await dbRun('ROLLBACK');
                res.status(500).json({ success: false, error: 'Error durante la transacción de restauración: ' + errInner.message });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Restaurar archivo binario de Base de Datos SQLite (.db)
app.post('/api/database/restore-binary', async (req, res) => {
    try {
        const { base64Data } = req.body;
        if (!base64Data) {
            return res.status(400).json({ success: false, error: 'No se recibieron datos del archivo de base de datos.' });
        }

        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length < 100) {
            return res.status(400).json({ success: false, error: 'El archivo seleccionado no es un archivo de base de datos SQLite válido.' });
        }

        // Crear copia de seguridad previa antes de reemplazar
        if (fs.existsSync(DB_PATH)) {
            fs.copyFileSync(DB_PATH, DB_PATH + '.bak');
        }

        // Escribir el nuevo archivo de base de datos
        fs.writeFileSync(DB_PATH, buffer);

        // Si existe en AppData, sincronizarla también
        const appDataDb = path.join(process.env.APPDATA || '', 'inventario-cds', 'inventario.db');
        if (fs.existsSync(path.dirname(appDataDb))) {
            try {
                fs.copyFileSync(DB_PATH, appDataDb);
            } catch (e) {
                console.warn('No se pudo copiar a AppData:', e.message);
            }
        }

        res.json({ 
            success: true, 
            message: 'Base de datos SQLite (.db) restaurada y cargada exitosamente. Se aplicaron todos los registros y movimientos.' 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error al restaurar archivo SQLite: ' + err.message });
    }
});

// Importador / Cargue Masivo Inteligente desde Excel
app.post('/api/database/import-excel-items', async (req, res) => {
    try {
        const { items, limpiarBasePrevia } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'No se encontraron filas válidas para importar.' });
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const nowTimeStr = new Date().toTimeString().split(' ')[0].substring(0, 5);

        db.serialize(async () => {
            try {
                await dbRun('BEGIN TRANSACTION');

                if (limpiarBasePrevia) {
                    await dbRun('DELETE FROM movimientos');
                    await dbRun('DELETE FROM control_vencimientos');
                    await dbRun('DELETE FROM items');
                }

                let importados = 0;
                let movId = 1;
                const lastMov = await dbGet(`SELECT id FROM movimientos ORDER BY id DESC LIMIT 1`);
                if (lastMov && !limpiarBasePrevia) {
                    movId = lastMov.id + 1;
                }

                for (const it of items) {
                    const codigo = parseInt(it.codigo, 10);
                    if (!codigo || isNaN(codigo)) continue;

                    const nombre = (it.nombre || '').trim().toUpperCase();
                    if (!nombre) continue;

                    const categoria = it.categoria || 'Materiales';
                    const unidad = it.unidad_medida || 'Unidad';
                    const ubicacion = (it.ubicacion_cds || 'A1').trim().toUpperCase();
                    const stockInicial = parseFloat(it.cantidad || it.stock || 0) || 0;
                    const aplicaVenc = it.aplica_vencimiento ? 1 : 0;

                    // Insert or replace item
                    await dbRun(`
                        INSERT OR REPLACE INTO items (
                            codigo, nombre, categoria, subcategoria, unidad_medida, marca, referencia,
                            ubicacion_cds, aplica_vencimiento, stock_minimo, estado, observaciones, fecha_registro
                        ) VALUES (?, ?, ?, 'General', ?, 'Generico', '-', ?, ?, 5, 'Activo', 'Importado desde Excel', ?)
                    `, [codigo, nombre, categoria, unidad, ubicacion, aplicaVenc, todayStr]);

                    // Si se indicó limpiar base o registrar movimiento inicial para stock > 0
                    if (stockInicial > 0) {
                        const n_mov = `MOV-${String(movId).padStart(5, '0')}`;
                        await dbRun(`
                            INSERT INTO movimientos (
                                n_movimiento, fecha, hora, tipo_movimiento, codigo_item, nombre_item,
                                cantidad, unidad, bodega_origen, bodega_destino, causal_condicion,
                                ubicacion_cds, proyecto_destino, responsable, persona_recibe_devuelve,
                                documento_referencia, observaciones
                            ) VALUES (?, ?, ?, 'ENTRADA', ?, ?, ?, ?, 'PROVEEDOR', 'CDS', 'INVENTARIO INICIAL', ?, 'Operacion Central', 'Administrador CDS', 'Importador Excel', 'IMPORT-EXCEL', 'Cargue masivo de existencias')
                        `, [n_mov, todayStr, nowTimeStr, codigo, nombre, stockInicial, unidad, ubicacion]);

                        if (aplicaVenc) {
                            const vencDate = it.fecha_vencimiento || '2027-08-30';
                            await dbRun(`
                                INSERT INTO control_vencimientos (
                                    codigo_item, nombre_item, bodega, fecha_ingreso, fecha_vencimiento,
                                    cant_inicial, cant_disponible, estado, observaciones, n_movimiento_origen
                                ) VALUES (?, ?, 'CDS', ?, ?, ?, ?, 'VIGENTE', 'Lote de Cargue Masivo', ?)
                            `, [codigo, nombre, todayStr, vencDate, stockInicial, stockInicial, n_mov]);
                        }

                        movId++;
                    }

                    importados++;
                }

                await dbRun('COMMIT');
                res.json({ 
                    success: true, 
                    message: `Cargue masivo completado exitosamente. Se procesaron ${importados} ítems en la base de datos.`,
                    importados
                });
            } catch (errInner) {
                await dbRun('ROLLBACK');
                res.status(500).json({ success: false, error: 'Error durante el cargue masivo: ' + errInner.message });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Servir la interfaz SPA
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 SERVIDOR INVENTARIO INICIADO EXITOSAMENTE`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`=======================================================`);
});
