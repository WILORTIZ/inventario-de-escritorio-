const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const XLSX = require('xlsx');

const DB_PATH = path.join(__dirname, '..', 'inventario.db');
const EXCEL_PATH = path.join(__dirname, '..', 'cargue.xlsx');

const db = new sqlite3.Database(DB_PATH);

function dbRun(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function dbAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbGet(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function classifyItem(nombre) {
    const upper = (nombre || '').toUpperCase();
    
    // Categoría
    let categoria = 'Materiales';
    if (upper.includes('DISCO') || upper.includes('ESPUMA') || upper.includes('CINTA') || upper.includes('SILICONA') || upper.includes('BROCA') || upper.includes('LIJA') || upper.includes('SOLDADURA') || upper.includes('TORNILLO') || upper.includes('TUERCA') || upper.includes('CHASO') || upper.includes('ARANDELA') || upper.includes('AMARRE') || upper.includes('SIKA')) {
        categoria = 'Consumibles';
    } else if (upper.includes('GUANTE') || upper.includes('CASCO') || upper.includes('GAFA') || upper.includes('BOTA') || upper.includes('PROTECCION') || upper.includes('RESPIRADOR') || upper.includes('TAPAOIDO') || upper.includes('CHALECO') || upper.includes('ARNÉS') || upper.includes('ARNES')) {
        categoria = 'EPP';
    } else if (upper.includes('TALADRO') || upper.includes('PULIDORA') || upper.includes('ALICATE') || upper.includes('DESTORNILLADOR') || upper.includes('LLAVE') || upper.includes('PINZA') || upper.includes('HERRAMIENTA') || upper.includes('FLEXOMETRO') || upper.includes('NIVEL ')) {
        categoria = 'Herramientas';
    } else if (upper.includes('TRANSFORMADOR') || upper.includes('CELDA') || upper.includes('TABLERO') || upper.includes('MEDIDOR') || upper.includes('INVERSOR') || upper.includes('PANEL')) {
        categoria = 'Equipos';
    }

    // Unidad de medida
    let unidad = 'Unidad';
    if (upper.includes(' METRO') || upper.includes(' MTR') || upper.includes(' MTS') || upper.includes(' M ')) {
        unidad = 'Metro';
    } else if (upper.includes(' GALON') || upper.includes(' GAL')) {
        unidad = 'Galón';
    } else if (upper.includes(' ROLLO')) {
        unidad = 'Rollo';
    } else if (upper.includes(' KG') || upper.includes(' KILO')) {
        unidad = 'Kilo';
    } else if (upper.includes(' PAQUETE') || upper.includes(' PQT')) {
        unidad = 'Paquete';
    } else if (upper.includes(' CAJA')) {
        unidad = 'Caja';
    }

    // Vencimiento
    let aplicaVencimiento = 0;
    if (upper.includes('ESPUMA') || upper.includes('SIKA') || upper.includes('PINTURA') || upper.includes('SILICONA') || upper.includes('RESINA') || upper.includes('SELLADOR') || upper.includes('PEGAMENTO') || upper.includes('EPOXI') || upper.includes('SOLVENTE') || upper.includes('GRASA') || upper.includes('QUIMICO') || upper.includes('LUBRICANTE')) {
        aplicaVencimiento = 1;
    }

    return { categoria, unidad, aplicaVencimiento };
}

async function run() {
    console.log('=======================================================');
    console.log('🔄 INICIANDO LIMPIEZA Y CARGUE INICIAL DE INVENTARIO');
    console.log('=======================================================');

    // 1. Leer archivo Excel
    console.log(`\n📖 Leyendo archivo: ${EXCEL_PATH}...`);
    const wb = XLSX.readFile(EXCEL_PATH);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    console.log(`Filas encontradas en el Excel: ${rawRows.length}`);

    // 2. Filtrar y consolidar filas
    const itemsMap = new Map();
    let omitidos = 0;

    rawRows.forEach((r, idx) => {
        const rawId = r.ID || r.Codigo || r.CODIGO || r.id || r.codigo || '';
        const idStr = String(rawId).trim();
        
        // Regla: si no tiene código o tiene #N/A, #N/E, N/A, NA -> NO crear
        if (!idStr || idStr.includes('#N/A') || idStr.includes('#N/E') || idStr.toUpperCase() === 'N/A' || idStr.toUpperCase() === 'NA') {
            omitidos++;
            return;
        }

        const nombre = String(r.ITEM || r.Item || r.Descripcion || r.DESCRIPCION || '').trim();
        if (!nombre) {
            omitidos++;
            return;
        }

        const rawCant = parseFloat(r.CANTIDAD || r.Cantidad || r.SALDO || 0) || 0;
        const est = String(r.ESTANTERIA || r.Estanteria || '').trim();
        const niv = String(r.NIVEL || r.Nivel || '').trim();
        
        let ubicacion = '0';
        if (est || niv) {
            ubicacion = (est && niv) ? `${est}-${niv}` : (est || niv);
        }

        if (itemsMap.has(idStr)) {
            // Consolidar cantidades si hay duplicado
            const prev = itemsMap.get(idStr);
            prev.cantidad += rawCant;
            if (prev.ubicacion === '0' && ubicacion !== '0') {
                prev.ubicacion = ubicacion;
            }
        } else {
            const meta = classifyItem(nombre);
            itemsMap.set(idStr, {
                codigo: idStr,
                nombre,
                cantidad: rawCant,
                ubicacion,
                categoria: meta.categoria,
                unidad: meta.unidad,
                aplicaVencimiento: meta.aplicaVencimiento
            });
        }
    });

    console.log(`\n📊 Análisis del archivo Excel:`);
    console.log(` - Ítems válidos únicos a crear: ${itemsMap.size}`);
    console.log(` - Registros omitidos (sin código o con #N/A): ${omitidos}`);

    // 3. Limpiar Base de Datos (Conservando usuarios, bodegas, proyectos, sedes)
    console.log(`\n🧹 1. Limpiando catálogo de ítems, movimientos, vencimientos y traslados...`);
    await dbRun('BEGIN TRANSACTION');

    try {
        await dbRun('DELETE FROM traslados_pendientes');
        await dbRun('DELETE FROM control_vencimientos');
        await dbRun('DELETE FROM movimientos');
        await dbRun('DELETE FROM items');
        
        // Reset sqlite autoincrement counters for transactions
        await dbRun(`DELETE FROM sqlite_sequence WHERE name IN ('movimientos', 'control_vencimientos', 'traslados_pendientes')`);

        console.log('✅ Base de datos limpiada correctamente.');

        // 4. Insertar Ítems y Generar Movimientos de Entrada en Sede Suroriental / Inventario CDS / Bodega Central CDS
        console.log(`\n📦 2. Insertando catálogo de ítems y registrando saldo inicial en Sede Suroriental (Inventario CDS)...`);
        
        const todayStr = new Date().toISOString().split('T')[0];
        const nowTimeStr = new Date().toLocaleTimeString('es-CO', { hour12: false });
        let movCounter = 1;
        let itemsConStock = 0;
        let stockTotalCargado = 0;
        let vencimientosCreados = 0;

        for (const item of itemsMap.values()) {
            // A. Insertar Ítem en el catálogo maestro
            await dbRun(`
                INSERT INTO items (
                    codigo, nombre, categoria, subcategoria, unidad_medida, marca, referencia,
                    ubicacion_cds, aplica_vencimiento, fecha_vencimiento_default, stock_minimo, estado, observaciones, fecha_registro
                ) VALUES (?, ?, ?, 'General', ?, 'Generico', '-', ?, ?, ?, 5, 'Activo', 'Cargue inicial oficial desde cargue.xlsx', ?)
            `, [
                item.codigo,
                item.nombre,
                item.categoria,
                item.unidad,
                item.ubicacion,
                item.aplicaVencimiento,
                item.aplicaVencimiento ? '2027-12-31' : null,
                todayStr
            ]);

            // B. Si tiene stock inicial > 0, crear movimiento de ENTRADA en Sede Suroriental / Inventario CDS
            if (item.cantidad > 0) {
                const nMov = `MOV-${String(movCounter).padStart(5, '0')}`;
                
                await dbRun(`
                    INSERT INTO movimientos (
                        n_movimiento, fecha, hora, tipo_movimiento, codigo_item, nombre_item,
                        cantidad, unidad, bodega_origen, bodega_destino, causal_condicion,
                        ubicacion_cds, proyecto_destino, responsable, persona_recibe_devuelve,
                        documento_referencia, observaciones, fecha_vencimiento_lote, sede, tipo_inventario
                    ) VALUES (
                        ?, ?, ?, 'ENTRADA', ?, ?,
                        ?, ?, 'PROVEEDOR', 'CDS', 'INVENTARIO INICIAL',
                        ?, 'Operacion Central', 'Giobani Lopez', 'Cargue Inicial',
                        'CARGUE-INICIAL-2026', 'Cargue inicial oficial cargue.xlsx', ?, 'Sede Suroriental', 'CDS'
                    )
                `, [
                    nMov,
                    todayStr,
                    nowTimeStr,
                    item.codigo,
                    item.nombre,
                    item.cantidad,
                    item.unidad,
                    item.ubicacion,
                    item.aplicaVencimiento ? '2027-12-31' : null
                ]);

                // C. Si aplica vencimiento, registrar en control_vencimientos
                if (item.aplicaVencimiento) {
                    await dbRun(`
                        INSERT INTO control_vencimientos (
                            codigo_item, nombre_item, bodega, fecha_ingreso, fecha_vencimiento,
                            cant_inicial, cant_disponible, estado, observaciones, n_movimiento_origen,
                            sede, tipo_inventario
                        ) VALUES (
                            ?, ?, 'CDS', ?, '2027-12-31',
                            ?, ?, 'VIGENTE', 'Lote de Cargue Inicial', ?,
                            'Sede Suroriental', 'CDS'
                        )
                    `, [
                        item.codigo,
                        item.nombre,
                        todayStr,
                        item.cantidad,
                        item.cantidad,
                        nMov
                    ]);
                    vencimientosCreados++;
                }

                movCounter++;
                itemsConStock++;
                stockTotalCargado += item.cantidad;
            }
        }

        await dbRun('COMMIT');

        console.log('\n=======================================================');
        console.log('🎉 CARGUE INICIAL FINALIZADO EXITOSAMENTE');
        console.log('=======================================================');
        console.log(` • Total Ítems Creados en Catálogo: ${itemsMap.size}`);
        console.log(` • Ítems con Existencias Físicas: ${itemsConStock}`);
        console.log(` • Saldo Total de Unidades Ingresadas: ${stockTotalCargado.toLocaleString()}`);
        console.log(` • Lotes con Control de Vencimiento: ${vencimientosCreados}`);
        console.log(` • Sede de Ingreso: Sede Suroriental`);
        console.log(` • Tipo de Inventario: CDS`);
        console.log(` • Bodega de Destino: Bodega Central (CDS)`);
        console.log(` • Responsable Inicial: Giobani Lopez`);
        console.log('=======================================================');

    } catch (err) {
        await dbRun('ROLLBACK');
        console.error('❌ Error durante la ejecución del cargue:', err);
    } finally {
        db.close();
    }
}

run();
