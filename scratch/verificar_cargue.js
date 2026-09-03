const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('inventario.db');

db.serialize(() => {
    db.get('SELECT COUNT(*) as total, SUM(CASE WHEN ubicacion_cds = "0" THEN 1 ELSE 0 END) as loc0, SUM(CASE WHEN ubicacion_cds != "0" THEN 1 ELSE 0 END) as locSet FROM items', (e, r) => {
        console.log('Items en catálogo:', r);
    });

    db.get('SELECT COUNT(*) as totalMovs, SUM(cantidad) as totalCant FROM movimientos WHERE sede = "Sede Suroriental" AND tipo_inventario = "CDS"', (e, r) => {
        console.log('Movimientos en Sede Suroriental / CDS:', r);
    });

    db.get('SELECT COUNT(*) as totalMovs FROM movimientos WHERE tipo_inventario = "MOVILIDAD"', (e, r) => {
        console.log('Movimientos en Movilidad (debe ser 0):', r.totalMovs);
    });

    db.all('SELECT cedula, nombre, rol, sede FROM usuarios', (e, users) => {
        console.log('Usuarios preservados:', users);
        db.close();
    });
});
