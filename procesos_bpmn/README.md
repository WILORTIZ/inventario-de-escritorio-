# 📊 Suite Integral de Procesos de Inventario en BPMN 2.0 (CDS)

Esta carpeta contiene el modelado formal y completo de la totalidad de los procesos y flujos de negocio del software **INVENTARIO CDS** bajo el estándar internacional **OMG BPMN 2.0 (Business Process Model and Notation)**.

---

## 📁 Catálogo Completo de Archivos BPMN y Vistas Previas

| # | Proceso del Sistema | Archivo BPMN 2.0 (XML) | Vista Previa Vectorial | Módulo / Tipo |
| :-: | :--- | :--- | :--- | :---: |
| **1** | **Entrega y Despacho de Materiales** | [`proceso_entrega.bpmn`](./proceso_entrega.bpmn) | [`proceso_entrega.svg`](./proceso_entrega.svg) | `ENTREGA (-)` |
| **2** | **Devolución y Reingreso de Sobrantes** | [`proceso_devolucion.bpmn`](./proceso_devolucion.bpmn) | [`proceso_devolucion.svg`](./proceso_devolucion.svg) | `DEVOLUCIÓN (+)` |
| **3** | **Traslado Inter-Bodegas / Sedes** | [`proceso_traslado.bpmn`](./proceso_traslado.bpmn) | [`proceso_traslado.svg`](./proceso_traslado.svg) | `TRASLADO (↔)` |
| **4** | **Entrada y Recepción de Compras** | [`proceso_entrada.bpmn`](./proceso_entrada.bpmn) | [`proceso_entrada.svg`](./proceso_entrada.svg) | `ENTRADA (+)` |
| **5** | **Disposición Final y Bajas por Caducidad/Daño** | [`proceso_bajas_disposicion_final.bpmn`](./proceso_bajas_disposicion_final.bpmn) | [`proceso_bajas_disposicion_final.svg`](./proceso_bajas_disposicion_final.svg) | `DISPOSICIÓN FINAL (-)` |
| **6** | **Ajustes y Cuadre Físico por Conteo Cíclico** | [`proceso_ajuste_inventario.bpmn`](./proceso_ajuste_inventario.bpmn) | [`proceso_ajuste_inventario.svg`](./proceso_ajuste_inventario.svg) | `AJUSTE (+/-)` |
| **7** | **Auditoría de Kardex y Análisis ABC (Pareto)** | [`proceso_auditoria_kardex_reportes.bpmn`](./proceso_auditoria_kardex_reportes.bpmn) | [`proceso_auditoria_kardex_reportes.svg`](./proceso_auditoria_kardex_reportes.svg) | `Kardex & Reportes` |
| **8** | **Respaldos y Recuperación de Base de Datos** | [`proceso_respaldos_bd.bpmn`](./proceso_respaldos_bd.bpmn) | [`proceso_respaldos_bd.svg`](./proceso_respaldos_bd.svg) | `Base de Datos SQLite` |
| **🌐** | **Visor Web Interactivo de Procesos** | [`index.html`](./index.html) | *(Visor con zoom, detalles y descarga de los 8 flujos)* | `Herramienta Visual` |

---

## 🔍 Resumen Operativo de los 8 Procesos

### 1. Entrega y Despacho (`proceso_entrega.bpmn`)
* **Lanes:** Técnico Solicitante | Almacenista CDS | Sistema CDS.
* **Flujo:** Solicitud $\rightarrow$ Verificación de Stock $\rightarrow$ Gateway Suficiente $\rightarrow$ Picking $\rightarrow$ Gateway Vencimiento (Semáforo $>30$d) $\rightarrow$ Entrega y firma $\rightarrow$ Registro `ENTREGA (-)` y descuento en Kardex.

### 2. Devolución y Reingreso (`proceso_devolucion.bpmn`)
* **Lanes:** Técnico que Devuelve | Almacén CDS | Sistema CDS.
* **Flujo:** Presentación física con OT $\rightarrow$ Inspección de Calidad $\rightarrow$ Gateway Estado Apto (Si no: Baja/Scrap; Si sí: Reubica en estantería) $\rightarrow$ Comprobante $\rightarrow$ Registro `DEVOLUCIÓN (+)` y aumento de stock.

### 3. Traslado Inter-Bodegas (`proceso_traslado.bpmn`)
* **Lanes:** Bodega Destino | Bodega Origen | Sistema CDS.
* **Flujo:** Solicitud $\rightarrow$ Validación en Origen $\rightarrow$ Picking y Guía $\rightarrow$ Salida `TRASLADO (↔)` $\rightarrow$ Recepción en Destino $\rightarrow$ Gateway Conformidad $\rightarrow$ Acreditación en Destino y Kardex cruzado.

### 4. Entrada y Recepción de Compras (`proceso_entrada.bpmn`)
* **Lanes:** Proveedor/Transportador | Almacén CDS | Sistema CDS.
* **Flujo:** Llegada de carga $\rightarrow$ Cotejo vs Factura/OC $\rightarrow$ Gateway Conformidad $\rightarrow$ Verificación de Lote/Vence $\rightarrow$ Almacenamiento en estantería $\rightarrow$ Registro `ENTRADA (+)` con factura y lote $\rightarrow$ Asiento en Kardex.

### 5. Disposición Final y Bajas (`proceso_bajas_disposicion_final.bpmn`)
* **Lanes:** Supervisor/Administrador | Almacén CDS | Sistema CDS.
* **Flujo:** Detección de producto vencido o deteriorado $\rightarrow$ Asistente de bajas o Dictamen de merma $\rightarrow$ Retiro a zona de cuarentena $\rightarrow$ Destrucción/Scrap $\rightarrow$ Firma de Acta $\rightarrow$ Registro `DISPOSICIÓN FINAL (BAJA) (-)` y descuento de pérdida.

### 6. Ajustes y Cuadre de Inventario (`proceso_ajuste_inventario.bpmn`)
* **Lanes:** Auditor de Inventario | Administrador | Sistema CDS.
* **Flujo:** Programación de conteo cíclico $\rightarrow$ Toma física en estanterías $\rightarrow$ Cotejo vs saldo teórico $\rightarrow$ Gateway Diferencia $\rightarrow$ Investigación causa raíz $\rightarrow$ Aprobación Ajuste Positivo (+) o Negativo (-) $\rightarrow$ Registro `AJUSTE (+/-)` y regularización de saldo.

### 7. Auditoría de Kardex y Análisis ABC (`proceso_auditoria_kardex_reportes.bpmn`)
* **Lanes:** Auditor/Gerencia | Motor Node.js Express | SQLite 3.
* **Flujo:** Filtros $\rightarrow$ Gateway Kardex vs Pareto $\rightarrow$ Consulta agrupada de salidas $\rightarrow$ Algoritmo Pareto (% individual, % acumulado, Zonas A-E) $\rightarrow$ Canvas Donut 2D Base64 $\rightarrow$ Incrustación en Celda B14 con ExcelJS $\rightarrow$ Descarga .xlsx / PDF.

### 8. Respaldos y Recuperación de Base de Datos (`proceso_respaldos_bd.bpmn`)
* **Lanes:** Super Administrador/TI | Motor SQLite 3 / Node.js.
* **Flujo:** Gateway Backup vs Restauración $\rightarrow$ Para Backup: Clon binario atómico con `VACUUM INTO` $\rightarrow$ Para Restaurar: Carga de archivo .db $\rightarrow$ Validación `PRAGMA integrity_check` $\rightarrow$ Sobrescritura en `%APPDATA%\INVENTARIO CDS\` $\rightarrow$ Recarga de catálogos y conexiones.

---

## 🛠️ ¿Cómo Visualizar o Editar estos Archivos?

1. **Visor Interactivo Integrado:** Abre [`index.html`](./index.html) en cualquier navegador moderno.
2. **Herramientas Especializadas BPMN:** Arrastra cualquier archivo `.bpmn` a [demo.bpmn.io](https://demo.bpmn.io/) o ábrelo en **Camunda Modeler**, **Signavio**, **Bizagi** o **Flowable**.
