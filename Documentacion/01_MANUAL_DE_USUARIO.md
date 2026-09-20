# 📖 MANUAL DE USUARIO Y GUÍA DE OPERACIONES - INVENTARIO CDS

**Versión:** 1.5.0  
**Audiencia:** Operadores de Almacén, Auxiliares de Bodega, Supervisores y Administradores de Inventario.

---

## 1. Acceso e Inicio de Sesión

1. Al abrir la aplicación **INVENTARIO CDS**, se presenta la pantalla de autenticación.
2. Ingrese su **Cédula / Documento de Identidad** y su **Contraseña**.
3. Por seguridad, el campo de contraseña se encuentra vacío para requerir ingreso manual seguro.
4. Haga clic en **"Iniciar Sesión"**.

---

## 2. Entorno y Selección de Sede / Tipo de Inventario

En la parte superior y lateral de la aplicación:
- **Selector de Sede:** Permite alternar entre sedes operativas (ej. *Sede Suroriental*, *Sede Principal*, etc.).
- **Selector de Inventario:** Permite gestionar diferentes áreas (ej. *CDS*, *Herramientas*, *EPP*, etc.).
- **Barra de Navegación Lateral:** Permite acceder directamente a los módulos principales:
  1. 📦 **Catálogo Maestro**
  2. 🔄 **Movimientos de Inventario**
  3. 📑 **Kardex y Reportes**
  4. ⏰ **Control de Vencimientos**
  5. 🏢 **Gestión de Bodegas y Categorías**
  6. 👥 **Administración de Usuarios**
  7. 💾 **Base de Datos y Respaldos**

---

## 3. Catálogo Maestro de Ítems

El catálogo almacena todas las referencias disponibles en la empresa.

### 🔍 Búsqueda y Filtrado:
- Utilice el buscador superior para filtrar por **Código**, **Nombre**, **Categoría**, **Marca** o **Ubicación CDS**.

### ➕ Creación de Nuevo Ítem:
1. Haga clic en el botón **"Nuevo Ítem"**.
2. Complete los campos requeridos:
   - **Código:** Número único identificador del producto.
   - **Nombre / Descripción:** Nombre comercial o técnico completo.
   - **Categoría y Subcategoría:** Clasificación del material.
   - **Unidad de Medida:** UNIDAD, METRO, LITRO, KILO, JUEGO, CAJA, etc.
   - **Ubicación CDS:** Estantería, módulo o nivel físico (ej. *E1-N2*).
   - **Stock Mínimo:** Nivel de alerta preventiva para reposición.
   - **Aplica Vencimiento:** Marque la casilla si el producto es perecedero o químico con fecha de caducidad.
3. Haga clic en **"Guardar Ítem"**.

---

## 4. Registro de Movimientos de Inventario

El sistema ofrece 6 tipos de transacciones de inventario con afectación automática del saldo físico:

| Tipo Movimiento | Signo | Descripción Operativa |
| :--- | :---: | :--- |
| **ENTRADA** | `+` | Recepción de compras, proveedores o ingresos iniciales. |
| **ENTREGA** | `-` | Despacho y entrega de materiales a técnicos, contratistas o proyectos. |
| **DEVOLUCIÓN** | `+` | Reingreso al almacén de materiales no utilizados en buen estado. |
| **TRASLADO** | `↔` | Movimiento de stock entre bodegas. *(Exige seleccionar Bodega Origen y Bodega Destino)*. |
| **DISPOSICIÓN FINAL (BAJA)** | `-` | Retiro definitivo por vencimiento, daño, scrap o pérdida. |
| **AJUSTE POSITIVO / NEGATIVO** | `+/-` | Cuadre de inventario físico tras toma de conteos cíclicos o auditorías. |

### 📝 Pasos para Registrar un Movimiento:
1. Haga clic en **"Nuevo Movimiento"** o **"Registrar Entrada / Salida"**.
2. Seleccione el **Ítem** desde el catálogo desplegable (muestra código, nombre y existencia actual).
3. Ingrese la **Cantidad**.
4. Seleccione la **Bodega Origen** y **Bodega Destino** (según aplique).
5. Indique el **Responsable**, **Persona que Recibe / Devuelve**, **Documento de Referencia** (ej. Remisión, Factura, OT) y **Observaciones**.
6. Si el ítem aplica vencimiento, ingrese el **Lote** y **Fecha de Vencimiento**.
7. Haga clic en **"Registrar Movimiento"**.

---

## 5. Auditoría Individual de Kardex

El Kardex muestra el historial cronológico y transaccional completo de un producto específico.

1. Ingrese a la vista **Kardex y Reportes**.
2. En la sección **Auditoría Individual de Kardex por Ítem**, seleccione el producto en el menú desplegable.
3. El sistema cargará:
   - Saldo inicial.
   - Todas las entradas, salidas y traslados ordenados por fecha y hora.
   - Saldo final acumulado en tiempo real.
4. **Exportación e Impresión:**
   - **Exportar Kardex (.xlsx):** Genera el archivo Excel oficial con formato contable.
   - **Imprimir Kardex:** Abre el asistente de impresión / PDF formateado con encabezados empresariales.

---

## 6. Centro de Reportes Gerenciales con Filtros

Para generar reportes consolidados, haga clic en el botón azul superior:  
👉 **"Generador de Reportes con Filtros"**

### 📊 Tipos de Reportes Disponibles:
1. **Libro de Movimientos:** Detalle de todas las transacciones en un rango de fechas.
2. **Balance General de Stock:** Existencia física, entradas, salidas acumuladas y estado del stock de cada ítem.
3. **Stock Crítico / Bajo:** Filtra únicamente los ítems cuyo saldo actual es igual o inferior al stock mínimo configurado.
4. **Lotes y Vencimientos:** Reporte de productos perecederos con días restantes y semáforo de caducidad.
5. **Catálogo Maestro:** Listado completo de referencias, marcas, ubicaciones y sedes.
6. **Rotación de Inventario (ABC):** Análisis de Pareto sobre el consumo de materiales.

### 🛠️ Filtros Configurables:
- Rango de fechas (*Hoy, 7 Días, Este Mes, Todo el Histórico, o Rango Personalizado*).
- Categoría específica o *Todas las Categorías*.
- Ubicación CDS o *Todas*.
- Bodega específica o *Todas*.
- Tipo de movimiento específico.

### 📥 Opciones de Salida:
- **Previsualizar en Pantalla:** Carga los resultados en una tabla interactiva con buscador rápido.
- **Generar y Descargar Excel (.xlsx):** Genera el libro Excel con estilos corporativos.

---

## 7. Módulo de Análisis de Rotación ABC (Pareto)

El módulo de rotación clasifica los productos según su impacto en el volumen total de salidas durante el período seleccionado:

| Zona | Denominación | Criterio de Participación | Color Oficial |
| :---: | :--- | :--- | :---: |
| **Zona A** | Alta Rotación | Concentra el **80% del volumen de salidas**. Ítems críticos de alta demanda. | 🟢 Verde (`#198754`) |
| **Zona B** | Media Rotación | Concentra el siguiente **15% de salidas**. Demanda moderada y regular. | 🔵 Azul (`#0D6EFD`) |
| **Zona C** | Baja Rotación | Concentra el último **5% de salidas**. Demanda esporádica o baja. | 🟠 Naranja (`#FD7E14`) |
| **Zona D** | Sin Rotación / Inactivo | Referencias con stock disponible pero con **0 salidas** en el período. | 🔴 Rojo (`#DC3545`) |
| **Zona E** | Sin Movimiento | Referencias sin salidas y con saldo actual en **0**. | ⚪ Gris (`#6C757D`) |

### 📈 Indicadores Calculados:
- **Consumo Diario Promedio:** $\text{Salidas Totales} / \text{Días del Período}$.
- **Índice de Rotación (IR):** $\text{Salidas Totales} / \text{Stock Promedio}$.
- **Días de Cobertura Estimada:** $\text{Stock Actual} / \text{Consumo Diario}$.

### 📊 Gráfica de Torta en Excel:
Al presionar **"Descargar Excel (.xlsx) con Torta"**, el archivo contiene:
- **Hoja 1 ("Resumen de Rotación ABC"):** Tabla ejecutiva por zonas con porcentaje de referencias y salidas, acompañada de la **Gráfica Donut en Alta Definición** incrustada.
- **Hoja 2 ("Detalle de Rotación por Ítem"):** Desglose ítem por ítem con todos los indicadores calculados.

---

## 8. Control y Semaforización de Vencimientos

El módulo de caducidad monitorea lotes sensibles:
- 🟢 **VIGENTE (> 30 días):** Producto en condiciones óptimas.
- 🟡 **POR VENCER (<= 30 días):** Alerta preventiva para priorizar su consumo o salida.
- 🔴 **VENCIDO (<= 0 días):** Alerta crítica para retiro inmediato del stock operativo.

### 🗑️ Asistente de Bajas por Caducidad:
Haga clic en **"Dar de Baja Ítems Vencidos"** para generar automáticamente los movimientos de salida por disposición final sin afectar el saldo de ítems vigentes.

---

## 9. Gestión de Bodegas y Categorías

- **Bodegas:** Permite crear, renombrar y activar/desactivar bodegas por sede (ej. *Bodega Principal*, *Bodega Transitoria*, *Bodega Cuarentena*).
- **Categorías:** Permite estructurar familias de productos y definir su orden visual.
  - *Protección preventiva:* No es posible eliminar una categoría que tenga productos asignados en el catálogo.

---

## 10. Administración de Usuarios y Seguridad

- **Roles de Acceso:**
  - **Super Administrador:** Acceso total, gestión de usuarios, auditorías y copias de seguridad.
  - **Administrador:** Control total operativo, catálogo y reportes.
  - **Operador:** Registro de movimientos y consultas del catálogo.
  - **Auditor:** Modo de solo lectura para auditorías e informes.
- **Eliminación Segura de Usuarios:**
  - Se incluye validación de seguridad para impedir que un usuario elimine su propia cuenta activa.

---

## 11. Respaldos y Base de Datos

En la sección **Base de Datos y Respaldos**:
1. **Descargar Copia de Seguridad (.db):** Guarda un respaldo binario exacto de la base de datos SQLite.
2. **Exportar a Excel / JSON:** Respalda todas las tablas en formato editable.
3. **Restaurar Copia (.db):** Permite cargar un archivo `.db` previo para recuperar información ante cualquier eventualidad.
4. **Respaldos Automáticos:** El sistema genera copias de seguridad automáticas con marca de tiempo en la carpeta de datos de la aplicación.
