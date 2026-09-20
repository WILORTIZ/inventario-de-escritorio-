# Catálogo y Especificación de Endpoints API REST - INVENTARIO CDS

La capa backend de **INVENTARIO CDS** expone una API REST construida sobre Express.js. Todos los endpoints aceptan y retornan datos en formato `application/json` (excepto las descargas binarias de archivos Excel/PDF).

---

## 1. Módulo de Autenticación (`/api/auth`)

### 1.1. Iniciar Sesión
- **Ruta:** `POST /api/auth/login`
- **Descripción:** Valida credenciales de usuario y establece la sesión de trabajo.
- **Body JSON:**
  ```json
  {
    "username": "admin",
    "password": "miPassword123"
  }
  ```
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "success": true,
    "user": {
      "id": 1,
      "username": "admin",
      "nombre_completo": "Administrador General",
      "rol": "administrador"
    },
    "message": "Autenticación exitosa"
  }
  ```

### 1.2. Cerrar Sesión
- **Ruta:** `POST /api/auth/logout`
- **Descripción:** Invalida la sesión activa en el cliente.
- **Respuesta (200 OK):**
  ```json
  { "success": true, "message": "Sesión finalizada" }
  ```

---

## 2. Módulo de Catálogo de Artículos (`/api/items`)

### 2.1. Listar Catálogo Completo con Filtros
- **Ruta:** `GET /api/items`
- **Query Params Opcionales:**
  - `busqueda`: Filtro por coincidencia en `codigo` o `nombre`.
  - `categoria`: Filtrar por nombre de categoría.
  - `orden`: Columna de ordenamiento (`nombre`, `stock`, `precio_unitario`).
- **Respuesta (200 OK):**
  ```json
  [
    {
      "id": 10,
      "codigo": "ART-0010",
      "nombre": "Cable UTP Cat6 305m",
      "categoria": "Redes",
      "stock": 45,
      "stock_minimo": 10,
      "precio_unitario": 280000.00,
      "unidad_medida": "ROLLO",
      "fecha_vencimiento": null,
      "lote": "LOTE-2026",
      "dias_alerta_vencimiento": 30
    }
  ]
  ```

### 2.2. Crear Nuevo Artículo
- **Ruta:** `POST /api/items`
- **Body JSON:**
  ```json
  {
    "codigo": "ART-0011",
    "nombre": "Conector RJ45 Blindado",
    "categoria": "Redes",
    "stock_minimo": 50,
    "precio_unitario": 1200.00,
    "unidad_medida": "UND",
    "fecha_vencimiento": "2027-12-31",
    "lote": "LOT-99",
    "dias_alerta_vencimiento": 60
  }
  ```
- **Respuesta (201 Created):**
  ```json
  { "success": true, "id": 11, "message": "Artículo registrado con éxito" }
  ```

### 2.3. Actualizar Artículo
- **Ruta:** `PUT /api/items/:id`
- **Body JSON:** Datos editables del ítem (`nombre`, `precio_unitario`, `stock_minimo`, etc.).

### 2.4. Eliminar Artículo
- **Ruta:** `DELETE /api/items/:id`
- **Descripción:** Elimina un artículo si no cuenta con movimientos históricos que violen integridad referencial.

---

## 3. Módulo de Transacciones de Inventario (`/api/movimientos`)

### 3.1. Registrar Entrada de Mercancía
- **Ruta:** `POST /api/movimientos/entrada`
- **Body JSON:**
  ```json
  {
    "item_id": 10,
    "cantidad": 20,
    "precio_unitario": 275000.00,
    "bodega_destino_id": 1,
    "documento_referencia": "FAC-5890",
    "motivo": "Compra a Proveedor",
    "lote": "LOT-2026-B",
    "fecha_vencimiento": null,
    "observaciones": "Entrega conforme"
  }
  ```

### 3.2. Registrar Salida de Mercancía
- **Ruta:** `POST /api/movimientos/salida`
- **Body JSON:**
  ```json
  {
    "item_id": 10,
    "cantidad": 5,
    "bodega_origen_id": 1,
    "documento_referencia": "REM-104",
    "motivo": "Despacho a Obra",
    "observaciones": "Retiro autorizado"
  }
  ```

### 3.3. Registrar Ajuste Físico de Stock
- **Ruta:** `POST /api/movimientos/ajuste`
- **Body JSON:**
  ```json
  {
    "item_id": 10,
    "nuevo_stock": 58,
    "motivo": "Conteo Cíclico Trimestral",
    "observaciones": "Ajuste de inventario físico"
  }
  ```

### 3.4. Registrar Traslado Inter-Bodegas
- **Ruta:** `POST /api/movimientos/traslado`
- **Body JSON:**
  ```json
  {
    "item_id": 10,
    "cantidad": 10,
    "bodega_origen_id": 1,
    "bodega_destino_id": 2,
    "documento_referencia": "TRAS-005",
    "motivo": "Reabastecimiento de Sucursal",
    "observaciones": "Transporte en camión interno"
  }
  ```

### 3.5. Consultar Kardex Histórico por Ítem
- **Ruta:** `GET /api/movimientos/kardex/:itemId`
- **Query Params:** `fecha_inicio`, `fecha_fin`.
- **Respuesta:** Lista cronológica con `saldo_resultante`, entradas, salidas y costos.

---

## 4. Módulo de Centro de Reportes y Análisis (`/api/reportes`)

### 4.1. Reporte de Rotación ABC (Matriz de Pareto)
- **Ruta:** `GET /api/reportes/rotacion-abc`
- **Query Params:**
  - `fecha_inicio` (ISO `YYYY-MM-DD`)
  - `fecha_fin` (ISO `YYYY-MM-DD`)
  - `categoria` (Opcional)
- **Respuesta (200 OK):**
  ```json
  {
    "resumen": {
      "totalItems": 150,
      "totalValorSalidas": 84500000.00,
      "claseA": { "items": 30, "porcentajeItems": 20.0, "valor": 67600000.00, "porcentajeValor": 80.0 },
      "claseB": { "items": 45, "porcentajeItems": 30.0, "valor": 12675000.00, "porcentajeValor": 15.0 },
      "claseC": { "items": 75, "porcentajeItems": 50.0, "valor": 4225000.00, "porcentajeValor": 5.0 }
    },
    "detalle": [
      {
        "id": 10,
        "codigo": "ART-0010",
        "nombre": "Cable UTP Cat6 305m",
        "categoria": "Redes",
        "stock": 45,
        "totalSalidas": 120,
        "valorTotalSalidas": 33600000.00,
        "porcentajeIndividual": 39.76,
        "porcentajeAcumulado": 39.76,
        "clasificacion": "A"
      }
    ]
  }
  ```

### 4.2. Reporte de Alertas de Vencimiento
- **Ruta:** `GET /api/reportes/vencimientos`
- **Respuesta:** Artículos clasificados en `Vencidos`, `Próximos a Vencer (<= N días)` y `Vigentes`.

### 4.3. Exportación a Excel con Gráficos
- **Ruta:** `POST /api/reportes/exportar-excel`
- **Body JSON:** Tipo de reporte (`rotacion-abc`, `kardex`, `inventario-general`) y filtros aplicados.
- **Respuesta:** Stream binario `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` con libro de cálculo formateado y gráfica donut incrustada.

---

## 5. Módulo de Administración de Usuarios (`/api/usuarios`)

- `GET /api/usuarios`: Listar usuarios del sistema.
- `POST /api/usuarios`: Crear nuevo usuario con contraseña y rol (`administrador` / `operador`).
- `PUT /api/usuarios/:id`: Modificar nombre, rol o estado activo/inactivo.
- `PUT /api/usuarios/:id/password`: Restablecer contraseña de un usuario.

---

## 6. Módulo de Bodegas y Sedes (`/api/bodegas`)

- `GET /api/bodegas`: Listar bodegas operativas.
- `POST /api/bodegas`: Registrar nueva sede física.
- `PUT /api/bodegas/:id`: Modificar datos de ubicación o estado.

---

## 7. Módulo de Base de Datos y Backups (`/api/database`)

- `GET /api/database/backup`: Dispara la generación de un respaldo binario atómico (`.db`) en la ruta de descargas o carpeta configurada.
- `POST /api/database/restore`: Restaura la base de datos a partir de un archivo binario `.db` cargado.
- `GET /api/database/stats`: Devuelve peso del archivo en disco, número de registros por tabla y fecha de último backup.
