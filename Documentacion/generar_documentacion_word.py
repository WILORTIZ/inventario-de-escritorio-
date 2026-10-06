import os
import sys
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def set_table_borders(table, color="CCCCCC", sz="4", val="single"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(f'''
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideV w:val="none"/>
            <w:left w:val="none"/>
            <w:right w:val="none"/>
        </w:tblBorders>
    ''')
    tblPr.append(borders)

def add_callout(doc, title, text, bg_hex="F0F9FF", border_color="0284C7", emoji="💡"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    
    cell = tbl.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, bg_hex)
    set_cell_margins(cell, top=140, bottom=140, left=200, right=200)
    
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:left w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/>
            <w:top w:val="none"/>
            <w:right w:val="none"/>
            <w:bottom w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(4)
    run_t = p.add_run(f"{emoji} {title}\n")
    run_t.bold = True
    run_t.font.name = "Segoe UI"
    run_t.font.size = Pt(10.5)
    run_t.font.color.rgb = RGBColor(int(border_color[0:2], 16), int(border_color[2:4], 16), int(border_color[4:6], 16))
    
    run_b = p.add_run(text)
    run_b.font.name = "Segoe UI"
    run_b.font.size = Pt(9.5)
    run_b.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
    
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

def add_code_block(doc, code_text):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    
    cell = tbl.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, "0F172A")
    set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
    
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:left w:val="single" w:sz="12" w:space="0" w:color="38BDF8"/>
            <w:top w:val="none"/>
            <w:right w:val="none"/>
            <w:bottom w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(code_text.strip())
    run.font.name = "Consolas"
    run.font.size = Pt(8.5)
    run.font.color.rgb = RGBColor(0x38, 0xBD, 0xF8)
    
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

def format_styled_table(doc, headers, rows_data, col_widths=None):
    table = doc.add_table(rows=len(rows_data) + 1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table, color="CBD5E1", sz="6", val="single")
    
    # Header Row
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], "1E293B")
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for run in p.runs:
            run.font.name = "Segoe UI"
            run.font.bold = True
            run.font.size = Pt(9.5)
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            
    # Data Rows
    for r_idx, row in enumerate(rows_data):
        row_cells = table.rows[r_idx + 1].cells
        bg_color = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"
        for c_idx, val in enumerate(row):
            row_cells[c_idx].text = str(val)
            set_cell_background(row_cells[c_idx], bg_color)
            set_cell_margins(row_cells[c_idx], top=90, bottom=90, left=140, right=140)
            p = row_cells[c_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in p.runs:
                run.font.name = "Segoe UI"
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
                
    if col_widths:
        for row in table.rows:
            for idx, width in enumerate(col_widths):
                row.cells[idx].width = Inches(width)
                
    doc.add_paragraph().paragraph_format.space_after = Pt(8)
    return table

def build_word_manual():
    doc = Document()
    
    # Page Setup (Margins: 1 inch)
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        
        # Header & Footer
        footer = section.footer
        f_p = footer.paragraphs[0]
        f_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        f_run = f_p.add_run("INVENTARIO CDS — Manual Integral de Operaciones y Arquitectura Técnica | Página ")
        f_run.font.name = "Segoe UI"
        f_run.font.size = Pt(8.5)
        f_run.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)
        
    # ==================== PORTADA ====================
    p_pre = doc.add_paragraph()
    p_pre.paragraph_format.space_before = Pt(36)
    p_pre.paragraph_format.space_after = Pt(12)
    run_pre = p_pre.add_run("DOCUMENTACIÓN OFICIAL DEL SISTEMA")
    run_pre.font.name = "Segoe UI"
    run_pre.font.bold = True
    run_pre.font.size = Pt(12)
    run_pre.font.color.rgb = RGBColor(0x02, 0x84, 0xC7)
    
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(8)
    run_title = p_title.add_run("MANUAL INTEGRAL DE USUARIO,\nARQUITECTURA Y PROCESOS BPMN 2.0")
    run_title.font.name = "Segoe UI"
    run_title.font.bold = True
    run_title.font.size = Pt(26)
    run_title.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
    
    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(28)
    run_sub = p_sub.add_run("Sistema de Control, Auditoría de Kardex y Gestión Transaccional Multisede — INVENTARIO CDS")
    run_sub.font.name = "Segoe UI"
    run_sub.font.size = Pt(13)
    run_sub.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
    
    # Metadata Box
    add_callout(doc, "FICHA TÉCNICA DEL DOCUMENTO", 
                "• Aplicación: INVENTARIO CDS (Desktop / Portable)\n"
                "• Versión del Sistema: 1.5.0\n"
                "• Versión de Documentación: 2.5 Unificada Completa (8 Flujos BPMN)\n"
                "• Estándares: OMG BPMN 2.0, Transacciones ACID SQLite 3, REST API, Electron\n"
                "• Audiencia: Administradores de Almacén, Operadores de Bodega, Supervisores, Auditores y Desarrolladores.",
                bg_hex="F8FAFC", border_color="0284C7", emoji="📌")
    
    doc.add_page_break()
    
    # ==================== TABLA DE CONTENIDO ====================
    h_toc = doc.add_heading("ÍNDICE GENERAL DEL MANUAL", level=1)
    h_toc.paragraph_format.space_after = Pt(14)
    for run in h_toc.runs:
        run.font.name = "Segoe UI"
        run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        
    toc_items = [
        ("MÓDULO 1: MANUAL DE USUARIO Y GUÍA DE OPERACIONES", "Acceso, catálogo maestro, movimientos, Kardex, rotación ABC, vencimientos y reportes."),
        ("MÓDULO 2: MODELADO DE PROCESOS DE NEGOCIO BPMN 2.0 (8 FLUJOS)", "Suite completa: Entrega, Devolución, Traslado, Entrada/Compras, Bajas, Ajuste/Conteo, Auditoría y Respaldos."),
        ("MÓDULO 3: ARQUITECTURA TÉCNICA Y DISEÑO DEL SISTEMA", "Arquitectura en 3 capas, Electron, Express REST, motor Canvas y persistencia SQLite."),
        ("MÓDULO 4: DICCIONARIO DE DATOS Y MODELO DE BASE DE DATOS", "Tablas, relaciones, tipos de datos, índices de optimización y estrategia de backups VACUUM."),
        ("MÓDULO 5: CATÁLOGO Y ESPECIFICACIÓN DE ENDPOINTS API REST", "Documentación de servicios HTTP: Autenticación, Ítems, Movimientos, Reportes y Base de Datos."),
        ("MÓDULO 6: GUÍA DE DESPLIEGUE, EMPAQUETADO Y COMPILACIÓN", "Instalación de dependencias, scripts de arranque rápido y compilación de binarios portables.")
    ]
    
    for title, desc in toc_items:
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(2)
        r1 = p.add_run(f"• {title}\n")
        r1.bold = True
        r1.font.name = "Segoe UI"
        r1.font.size = Pt(10.5)
        r1.font.color.rgb = RGBColor(0x02, 0x84, 0xC7)
        r2 = p.add_run(f"   {desc}")
        r2.font.name = "Segoe UI"
        r2.font.size = Pt(9.5)
        r2.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
        
    doc.add_page_break()
    
    # ==================== MÓDULO 1: MANUAL DE USUARIO ====================
    h1 = doc.add_heading("MÓDULO 1: MANUAL DE USUARIO Y OPERACIONES", level=1)
    h1.paragraph_format.space_after = Pt(12)
    for run in h1.runs:
        run.font.name = "Segoe UI"
        run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        
    doc.add_heading("1.1. Acceso y Autenticación Segura", level=2)
    p = doc.add_paragraph(
        "Al iniciar el aplicativo INVENTARIO CDS, se presenta la pantalla de autenticación central. "
        "El operador debe ingresar su número de documento de identidad (Cédula) y su contraseña. "
        "Por motivos de seguridad y control de accesos, el campo de contraseña permanece vacío al iniciar la sesión para requerir ingreso manual seguro."
    )
    p.paragraph_format.space_after = Pt(8)
    
    doc.add_heading("1.2. Selector de Sede y Tipo de Inventario", level=2)
    p = doc.add_paragraph(
        "El sistema soporta operaciones multisede. En la barra superior y lateral es posible alternar de forma inmediata entre sedes físicas (ej. Sede Suroriental, Sede Principal) "
        "y tipos de inventario (CDS, EPP, Herramientas, etc.). Todas las operaciones de catálogo y transacciones se filtran en tiempo real según el contexto seleccionado."
    )
    p.paragraph_format.space_after = Pt(8)
    
    doc.add_heading("1.3. Catálogo Maestro de Artículos", level=2)
    p = doc.add_paragraph(
        "El catálogo es el repositorio central de referencias disponibles en la compañía. Permite:"
    )
    p.paragraph_format.space_after = Pt(4)
    
    cat_bullets = [
        "Búsqueda instantánea por Código (SKU), Nombre comercial o técnico, Categoría, Marca o Ubicación física CDS (ej. E1-N2).",
        "Configuración de Stock Mínimo preventivo para disparo de alertas de reposición.",
        "Gestión de Unidades de Medida estandarizadas (UNIDAD, METRO, LITRO, KILO, JUEGO, CAJA, etc.).",
        "Control de Perecederos: Marcado de casilla 'Aplica Vencimiento' para activar el control de lotes y semaforización de caducidad."
    ]
    for b in cat_bullets:
        bp = doc.add_paragraph(b, style='List Bullet')
        bp.paragraph_format.space_after = Pt(3)
        
    doc.add_heading("1.4. Registro de Movimientos de Inventario", level=2)
    p = doc.add_paragraph(
        "El motor transaccional de INVENTARIO CDS cuenta con 6 tipos de movimientos con afectación automática del saldo físico y trazabilidad contable:"
    )
    p.paragraph_format.space_after = Pt(6)
    
    mov_headers = ["Tipo de Movimiento", "Signo", "Descripción Operativa"]
    mov_data = [
        ["ENTRADA", "(+)", "Recepción de compras, compras a proveedores o ingresos iniciales de mercancía."],
        ["ENTREGA", "(-)", "Despacho y entrega de materiales a técnicos, contratistas o proyectos con registro de receptor."],
        ["DEVOLUCIÓN", "(+)", "Reingreso al almacén de materiales no utilizados en buen estado tras liquidación de OT."],
        ["TRASLADO", "(↔)", "Movimiento de stock entre bodegas. Exige selección simultánea de Bodega Origen y Bodega Destino."],
        ["DISPOSICIÓN FINAL (BAJA)", "(-)", "Retiro definitivo por daño físico, merma, cuarentena, scrap o vencimiento."],
        ["AJUSTE (+ / -)", "(+/-)", "Cuadre de inventario físico tras toma de conteos cíclicos o auditorías de control."]
    ]
    format_styled_table(doc, mov_headers, mov_data, [1.8, 0.8, 3.9])
    
    doc.add_heading("1.5. Auditoría Individual de Kardex por Ítem", level=2)
    p = doc.add_paragraph(
        "El módulo de Kardex permite auditar el historial cronológico y transaccional exacto de cualquier referencia. "
        "Calcula el saldo inicial, lista cada una de las entradas, salidas y traslados con fecha, hora, responsable y motivo, "
        "y computa el saldo final acumulado en tiempo real. Permite exportar a Excel formal (.xlsx) o imprimir en formato PDF institucional."
    )
    p.paragraph_format.space_after = Pt(8)
    
    doc.add_heading("1.6. Módulo de Análisis de Rotación ABC (Pareto)", level=2)
    p = doc.add_paragraph(
        "El módulo de rotación clasifica los productos según su impacto en el volumen total de salidas durante el período seleccionado aplicando el principio de Pareto (80/20):"
    )
    p.paragraph_format.space_after = Pt(6)
    
    abc_headers = ["Zona", "Denominación", "Criterio de Participación", "Color Oficial"]
    abc_data = [
        ["Zona A", "Alta Rotación", "Concentra el 80% del volumen total de salidas. Ítems críticos de alta demanda.", "Verde (#198754)"],
        ["Zona B", "Media Rotación", "Concentra el siguiente 15% de salidas. Demanda regular y moderada.", "Azul (#0D6EFD)"],
        ["Zona C", "Baja Rotación", "Concentra el último 5% de salidas. Demanda esporádica.", "Naranja (#FD7E14)"],
        ["Zona D", "Sin Rotación / Inactivo", "Referencias con stock disponible en bodega pero con 0 salidas en el período.", "Rojo (#DC3545)"],
        ["Zona E", "Sin Movimiento", "Referencias sin salidas en el período y con existencia física en 0.", "Gris (#6C757D)"]
    ]
    format_styled_table(doc, abc_headers, abc_data, [1.0, 1.6, 2.7, 1.2])
    
    add_callout(doc, "INDICADORES CLAVE CALCULADOS EN EL MÓDULO ABC",
                "• Consumo Diario Promedio = Salidas Totales / Días del Período\n"
                "• Índice de Rotación (IR) = Salidas Totales / Stock Promedio\n"
                "• Días de Cobertura Estimada = Stock Actual / Consumo Diario Promedio",
                bg_hex="F0FDF4", border_color="16A34A", emoji="📊")
                
    doc.add_heading("1.7. Control y Semáforo de Vencimientos", level=2)
    p = doc.add_paragraph(
        "El módulo de caducidad monitorea continuamente los lotes sensibles mediante un sistema de semaforización:\n"
        "• VIGENTE (Verde, > 30 días): Producto en condiciones óptimas de despacho.\n"
        "• POR VENCER (Amarillo, <= 30 días): Alerta preventiva para priorizar su consumo bajo método FEFO (First Expired, First Out).\n"
        "• VENCIDO (Rojo, <= 0 días): Alerta crítica. Se bloquea para despacho y se habilita el asistente de 'Dar de Baja Ítems Vencidos'."
    )
    p.paragraph_format.space_after = Pt(8)
    
    doc.add_page_break()
    
    # ==================== MÓDULO 2: BPMN COMPLETO (8 PROCESOS) ====================
    h2 = doc.add_heading("MÓDULO 2: MODELADO INTEGRAL DE PROCESOS BPMN 2.0", level=1)
    h2.paragraph_format.space_after = Pt(12)
    for run in h2.runs:
        run.font.name = "Segoe UI"
        run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        
    p = doc.add_paragraph(
        "Todos los procesos operacionales y administrativos de INVENTARIO CDS se encuentran formalizados bajo la especificación "
        "BPMN 2.0 (Business Process Model and Notation) del Object Management Group (OMG). A continuación se describe la suite de 8 procesos:"
    )
    p.paragraph_format.space_after = Pt(8)
    
    # 2.1 Entrega
    doc.add_heading("2.1. Proceso de Entrega y Despacho (`proceso_entrega.bpmn`)", level=2)
    ent_headers = ["Paso", "Carril (Lane)", "Actividad / Evento", "Regla de Negocio"]
    ent_data = [
        ["1", "Técnico / Solicitante", "Inicio: Requerimiento / OT", "Se presenta código SKU y cantidad requerida."],
        ["2", "Almacén CDS", "Consultar Existencias", "Verificación en tiempo real de saldo físico y ubicación CDS."],
        ["3", "Almacén CDS", "Compuerta: ¿Stock Suficiente?", "Si NO: Se rechaza la solicitud. Si SÍ: Continúa a picking."],
        ["4", "Almacén CDS", "Picking y Alistamiento", "Extracción física del material desde su estantería CDS."],
        ["5", "Almacén CDS", "Compuerta: ¿Aplica Caducidad?", "Si SÍ: Valida semáforo vigente (>30d). Si NO: Continúa."],
        ["6", "Técnico / Solicitante", "Revisión de Conformidad", "Verificación cuantitativa y cualitativa en ventanilla."],
        ["7", "Técnico / Solicitante", "Firma y Cédula", "Registro formal del documento de identidad del receptor."],
        ["8", "Sistema CDS", "Registro de Movimiento", "Afectación de 'ENTREGA' (-), descuento y actualización de Kardex."]
    ]
    format_styled_table(doc, ent_headers, ent_data, [0.6, 1.6, 2.0, 2.3])
    
    # 2.2 Devolución
    doc.add_heading("2.2. Proceso de Devolución y Reingreso (`proceso_devolucion.bpmn`)", level=2)
    dev_headers = ["Paso", "Carril (Lane)", "Actividad / Evento", "Regla de Negocio"]
    dev_data = [
        ["1", "Técnico que Devuelve", "Inicio: Material Sobrante", "Presentación física con referencia u OT previa."],
        ["2", "Almacén CDS", "Inspección Técnica de Calidad", "Revisión de integridad física, funcionamiento y limpieza."],
        ["3", "Almacén CDS", "Compuerta: ¿Estado Apto?", "Si NO: Se envía a 'DISPOSICIÓN FINAL (BAJA)' / Scrap."],
        ["4", "Almacén CDS", "Reubicación en Estantería", "Si SÍ: Se almacena físicamente en la posición CDS asignada."],
        ["5", "Técnico / Almacén", "Firma de Comprobante", "Acta de entrega con observaciones del estado."],
        ["6", "Sistema CDS", "Registro 'DEVOLUCIÓN' (+)", "Incremento automático de saldo disponible en Kardex."]
    ]
    format_styled_table(doc, dev_headers, dev_data, [0.6, 1.6, 2.0, 2.3])
    
    # 2.3 Traslado
    doc.add_heading("2.3. Proceso de Traslado entre Bodegas (`proceso_traslado.bpmn`)", level=2)
    tras_headers = ["Paso", "Carril (Lane)", "Actividad / Evento", "Regla de Negocio"]
    tras_data = [
        ["1", "Bodega Destino", "Solicitud de Reabastecimiento", "Especifica ítem, cantidad, Bodega Origen y Bodega Destino."],
        ["2", "Bodega Origen", "Validación de Existencias", "Verifica si hay stock suficiente en la bodega emisora."],
        ["3", "Bodega Origen", "Compuerta: ¿Stock en Origen?", "Si NO: Cancela traslado. Si SÍ: Inicia picking."],
        ["4", "Sistema CDS", "Registro 'TRASLADO' (↔)", "Descuenta el saldo físico de la Bodega Origen."],
        ["5", "Bodega Destino", "Recepción y Conteo", "Cotejo físico contra la guía de remisión de traslado."],
        ["6", "Bodega Destino", "Compuerta: ¿Conforme?", "Si hay faltante o daño, documenta novedad de ajuste."],
        ["7", "Sistema CDS", "Confirmación y Cierre", "Acredita saldo en Bodega Destino y actualiza Kardex cruzado."]
    ]
    format_styled_table(doc, tras_headers, tras_data, [0.6, 1.6, 2.0, 2.3])
    
    # 2.4 Entrada
    doc.add_heading("2.4. Proceso de Entrada y Recepción de Compras (`proceso_entrada.bpmn`)", level=2)
    ent_c_headers = ["Paso", "Carril (Lane)", "Actividad / Evento", "Regla de Negocio"]
    ent_c_data = [
        ["1", "Proveedor / Transportador", "Llegada de Mercancía", "Descarga física y entrega de Factura Comercial / Remisión."],
        ["2", "Almacén CDS", "Inspección Cuantitativa", "Conteo y validación de especificaciones contra Orden de Compra."],
        ["3", "Almacén CDS", "Compuerta: ¿Carga Conforme?", "Si NO: Novedad y devolución a proveedor. Si SÍ: Continúa."],
        ["4", "Almacén CDS", "Verificar Lote y Vencimiento", "Inspección de fecha de fabricación y caducidad."],
        ["5", "Almacén CDS", "Almacenamiento Físico", "Ubicación en estantería CDS según mapa de bodega."],
        ["6", "Sistema CDS", "Registro 'ENTRADA' (+)", "Asiento en base de datos con número de factura y lote."],
        ["7", "Sistema CDS", "Actualización de Kardex", "Incremento inmediato del stock disponible."]
    ]
    format_styled_table(doc, ent_c_headers, ent_c_data, [0.6, 1.6, 2.0, 2.3])
    
    # 2.5 Bajas
    doc.add_heading("2.5. Proceso de Disposición Final y Bajas (`proceso_bajas_disposicion_final.bpmn`)", level=2)
    baja_headers = ["Paso", "Carril (Lane)", "Actividad / Evento", "Regla de Negocio"]
    baja_data = [
        ["1", "Supervisor / Admin", "Detección de Vencimiento / Daño", "Alerta por semáforo rojo (<=0d) o reporte de rotura."],
        ["2", "Supervisor / Admin", "Compuerta: ¿Causal de Baja?", "Vencimiento (ejecuta asistente) o Daño/Merma (dictamen manual)."],
        ["3", "Almacén CDS", "Retiro a Cuarentena", "Extracción física inmediata de estantes de despacho."],
        ["4", "Almacén CDS", "Destrucción / Scrap", "Disposición física o entrega a gestor ambiental certificado."],
        ["5", "Supervisor / Admin", "Autorización de Acta", "Firma y cierre administrativo del acta de disposición."],
        ["6", "Sistema CDS", "Registro 'DISPOSICIÓN FINAL' (-)", "Descuento contable y asiento de pérdida en Kardex."]
    ]
    format_styled_table(doc, baja_headers, baja_data, [0.6, 1.6, 2.0, 2.3])
    
    # 2.6 Ajustes
    doc.add_heading("2.6. Proceso de Ajustes por Conteo Cíclico (`proceso_ajuste_inventario.bpmn`)", level=2)
    aj_headers = ["Paso", "Carril (Lane)", "Actividad / Evento", "Regla de Negocio"]
    aj_data = [
        ["1", "Auditor de Inventarios", "Toma Física de Conteo", "Conteo ciego por ubicación física en estantería."],
        ["2", "Auditor de Inventarios", "Cotejo vs Saldo Teórico", "Comparación en sistema entre conteo físico y stock registrado."],
        ["3", "Auditor de Inventarios", "Compuerta: ¿Hay Descuadre?", "Si NO: 100% Cuadrado. Si SÍ: Pasa a investigación."],
        ["4", "Supervisor / Admin", "Investigación Causa Raíz", "Análisis de merma, error de digitación o cruce de SKU."],
        ["5", "Supervisor / Admin", "Compuerta: Tipo de Ajuste", "Aprobación de Sobrante (+) o Faltante (-)."],
        ["6", "Sistema CDS", "Registro 'AJUSTE' (+/-)", "Regularización en tiempo real del saldo físico en Kardex."]
    ]
    format_styled_table(doc, aj_headers, aj_data, [0.6, 1.6, 2.0, 2.3])
    
    # 2.7 Reportes
    doc.add_heading("2.7. Proceso de Auditoría y Rotación ABC (`proceso_auditoria_kardex_reportes.bpmn`)", level=2)
    rep_headers = ["Paso", "Carril (Lane)", "Actividad / Evento", "Regla de Negocio"]
    rep_data = [
        ["1", "Auditor / Gerencia", "Configuración de Filtros", "Selección de rango de fechas, sede, bodega o categoría."],
        ["2", "Motor Node.js", "Compuerta: Tipo de Reporte", "Kardex Individual o Matriz de Pareto ABC."],
        ["3", "Motor Node.js", "Cálculo Algoritmo Pareto", "Clasificación en Zonas A (80%), B (15%), C (5%), D (0 salidas) y E."],
        ["4", "Motor Node.js", "Renderizado Canvas 2D Base64", "Generación de imagen Donut HD 800x460 px."],
        ["5", "Motor Node.js", "Builder ExcelJS", "Incrustación en Celda B14 y aplicación de estilos contables."],
        ["6", "Auditor / Gerencia", "Descarga Oficial", "Obtención del libro Excel .xlsx o PDF."]
    ]
    format_styled_table(doc, rep_headers, rep_data, [0.6, 1.6, 2.0, 2.3])
    
    # 2.8 Respaldos
    doc.add_heading("2.8. Proceso de Respaldos de Base de Datos (`proceso_respaldos_bd.bpmn`)", level=2)
    res_headers = ["Paso", "Carril (Lane)", "Actividad / Evento", "Regla de Negocio"]
    res_data = [
        ["1", "Super Admin / TI", "Compuerta: Backup vs Restauración", "Selecciona si desea generar respaldo o restaurar contingencia."],
        ["2", "Motor SQLite 3", "VACUUM INTO", "Creación de clon binario .db íntegro y atómico en caliente."],
        ["3", "Super Admin / TI", "Guardar Copia", "Almacenamiento seguro en disco externo o nube."],
        ["4", "Motor SQLite 3", "Integrity Check (PRAGMA)", "Para restaurar: Validación de estructura y páginas B-Tree."],
        ["5", "Motor SQLite 3", "Reemplazo de BD", "Sobrescritura en %APPDATA%\\INVENTARIO CDS\\ y reinicio de conexiones."]
    ]
    format_styled_table(doc, res_headers, res_data, [0.6, 1.6, 2.0, 2.3])
    
    # 2.9 Licenciamiento Offline
    doc.add_heading("2.9. Proceso de Licenciamiento Offline y Protección Anti-Tampering (`proceso_licenciamiento.bpmn`)", level=2)
    lic_headers = ["Paso", "Carril (Lane)", "Actividad / Evento", "Regla de Negocio"]
    lic_data = [
        ["1", "Cliente / Usuario", "Desafío de 6 Dígitos", "La app genera código aleatorio único por equipo visible en pantalla modal."],
        ["2", "Cliente / Usuario", "Solicitud por WhatsApp", "Envía código de 6 dígitos y días solicitados al administrador."],
        ["3", "Admin / Generador", "Ingreso en licencias_admin.html", "Herramienta offline calcula firma HMAC-SHA256 con clave maestra."],
        ["4", "Admin / Generador", "Emisión [DIAS]-[FIRMA]", "Envío de clave formateada (ej. 30-6DACC320) por WhatsApp en 1 clic."],
        ["5", "Cliente / Usuario", "Ingreso de Clave", "Pega la clave en la aplicación y presiona 'Activar y Desbloquear'."],
        ["6", "Motor App / SQLite", "Protección Anti-Rollback", "Comprueba que la fecha del sistema no haya sido atrasada."],
        ["7", "Motor App / SQLite", "Validación Criptográfica", "Verifica firma localmente, calcula nueva fecha de vencimiento y rota desafío."]
    ]
    format_styled_table(doc, lic_headers, lic_data, [0.6, 1.6, 2.0, 2.3])
    
    doc.add_page_break()
    
    # ==================== MÓDULO 3: ARQUITECTURA TÉCNICA ====================
    h3 = doc.add_heading("MÓDULO 3: ARQUITECTURA TÉCNICA Y DISEÑO DEL SISTEMA", level=1)
    h3.paragraph_format.space_after = Pt(12)
    for run in h3.runs:
        run.font.name = "Segoe UI"
        run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        
    p = doc.add_paragraph(
        "INVENTARIO CDS está construido bajo una arquitectura desacoplada de escritorio en tres capas: Presentación (Electron Renderer SPA), "
        "Lógica de Negocio (Node.js / Express Server local) y Persistencia (SQLite 3 embebido con soporte ACID)."
    )
    p.paragraph_format.space_after = Pt(8)
    
    doc.add_heading("3.1. Estructura de Capas", level=2)
    capas_headers = ["Capa", "Tecnología Principal", "Responsabilidad en el Sistema"]
    capas_data = [
        ["1. Presentación (Frontend)", "HTML5, CSS3, Vanilla JS, Bootstrap Icons", "Renderizado SPA de alta velocidad, gestión de estado de interfaz (appState) y generación de gráficos en Canvas 2D."],
        ["2. Lógica (Backend Local)", "Electron 44.0.0, Node.js, Express.js REST", "Validación estricta de reglas de negocio, servidor REST en localhost, motor de transacciones y constructor Excel con ExcelJS."],
        ["3. Persistencia (Base de Datos)", "SQLite 3 embebido (%APPDATA%)", "Almacenamiento relacional, claves foráneas, índices B-Tree y copias de seguridad atómicas con VACUUM."]
    ]
    format_styled_table(doc, capas_headers, capas_data, [1.8, 2.2, 2.5])
    
    doc.add_heading("3.2. Renderizado Autónomo de Gráficos Donut en Excel", level=2)
    p = doc.add_paragraph(
        "Para solucionar la incompatibilidad clásica de los navegadores al exportar gráficos ocultos (display: none), "
        "se diseñó el motor independiente `generarImagenTortaBase64(resumen, data)`. Este motor crea un Canvas 2D fuera de pantalla "
        "en resolución 800x460 px, dibuja el anillo Donut con colores oficiales de Pareto, leyenda ejecutiva y contador central, "
        "y transmite el búfer Base64 al backend para su incrustación directa en la celda B14 del archivo Excel."
    )
    p.paragraph_format.space_after = Pt(8)
    
    doc.add_page_break()
    
    # ==================== MÓDULO 4: DICCIONARIO DE DATOS ====================
    h4 = doc.add_heading("MÓDULO 4: DICCIONARIO DE DATOS Y MODELO BD", level=1)
    h4.paragraph_format.space_after = Pt(12)
    for run in h4.runs:
        run.font.name = "Segoe UI"
        run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        
    p = doc.add_paragraph(
        "La base de datos se almacena de forma persistente en `%APPDATA%\\INVENTARIO CDS\\inventario.db`. "
        "A continuación se detalla la estructura formal de las tablas relacionales:"
    )
    p.paragraph_format.space_after = Pt(8)
    
    doc.add_heading("4.1. Tabla: `items` (Catálogo Maestro y Stock)", level=2)
    items_headers = ["Campo", "Tipo", "Nulo", "Por Defecto", "Descripción"]
    items_data = [
        ["id", "INTEGER", "NO", "AUTOINCREMENT", "Identificador único primario (PK)."],
        ["codigo", "TEXT", "NO", "-", "Código SKU único / Código de barras (UNIQUE)."],
        ["nombre", "TEXT", "NO", "-", "Nombre comercial o descripción técnica del producto."],
        ["categoria", "TEXT", "SÍ", "'General'", "Nombre de la categoría taxonómica."],
        ["stock", "INTEGER", "NO", "0", "Existencia física consolidada disponible."],
        ["stock_minimo", "INTEGER", "NO", "5", "Umbral para disparo de alertas preventivas."],
        ["precio_unitario", "REAL", "NO", "0.0", "Costo / Precio base de adquisición ($)."],
        ["unidad_medida", "TEXT", "SÍ", "'UND'", "Unidad de conteo (UND, MTS, KG, LT, CAJA)."],
        ["fecha_vencimiento", "TEXT", "SÍ", "NULL", "Fecha de caducidad en formato ISO (YYYY-MM-DD)."],
        ["lote", "TEXT", "SÍ", "NULL", "Identificador de lote de fabricación."],
        ["dias_alerta_vencimiento", "INTEGER", "NO", "30", "Ventana de anticipación para semáforo amarillo."]
    ]
    format_styled_table(doc, items_headers, items_data, [1.5, 0.9, 0.6, 1.2, 2.3])
    
    doc.add_heading("4.2. Tabla: `movimientos` (Libro Mayor de Kardex)", level=2)
    movs_headers = ["Campo", "Tipo", "Nulo", "Por Defecto", "Descripción"]
    movs_data = [
        ["id", "INTEGER", "NO", "AUTOINCREMENT", "ID primario de la transacción."],
        ["item_id", "INTEGER", "NO", "-", "Llave foránea hacia items(id)."],
        ["tipo", "TEXT", "NO", "-", "'ENTRADA', 'SALIDA', 'AJUSTE', 'TRASLADO'."],
        ["cantidad", "INTEGER", "NO", "-", "Magnitud de unidades transadas (positivo)."],
        ["saldo_resultante", "INTEGER", "NO", "0", "Balance físico tras el impacto de la transacción."],
        ["precio_unitario", "REAL", "NO", "0.0", "Costo unitario en el momento del movimiento."],
        ["costo_total", "REAL", "NO", "0.0", "Subtotal monetario (cantidad * precio_unitario)."],
        ["usuario_nombre", "TEXT", "SÍ", "NULL", "Nombre del operador responsable."],
        ["bodega_origen_id", "INTEGER", "SÍ", "NULL", "ID de bodega emisora."],
        ["bodega_destino_id", "INTEGER", "SÍ", "NULL", "ID de bodega receptora."],
        ["documento_referencia", "TEXT", "SÍ", "NULL", "Factura, Remisión u Orden de Trabajo."],
        ["motivo", "TEXT", "SÍ", "NULL", "Causa funcional del movimiento."],
        ["observaciones", "TEXT", "SÍ", "NULL", "Notas adicionales de auditoría."]
    ]
    format_styled_table(doc, movs_headers, movs_data, [1.5, 0.9, 0.6, 1.2, 2.3])
    
    doc.add_page_break()
    
    # ==================== MÓDULO 5: API REST ====================
    h5 = doc.add_heading("MÓDULO 5: ESPECIFICACIÓN DE ENDPOINTS API REST", level=1)
    h5.paragraph_format.space_after = Pt(12)
    for run in h5.runs:
        run.font.name = "Segoe UI"
        run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        
    p = doc.add_paragraph(
        "El backend local expone servicios HTTP bajo el prefijo `/api/`. Todas las solicitudes aceptan y retornan formato JSON:"
    )
    p.paragraph_format.space_after = Pt(6)
    
    api_headers = ["Método", "Endpoint", "Módulo", "Descripción Funcional"]
    api_data = [
        ["POST", "/api/auth/login", "Autenticación", "Valida credenciales de usuario y retorna perfil y permisos."],
        ["POST", "/api/auth/logout", "Autenticación", "Cierra la sesión activa del operador."],
        ["GET", "/api/items", "Catálogo", "Lista artículos con filtros de búsqueda, categoría y orden."],
        ["POST", "/api/items", "Catálogo", "Crea un nuevo artículo con validación de código único."],
        ["PUT", "/api/items/:id", "Catálogo", "Actualiza atributos maestros de una referencia."],
        ["DELETE", "/api/items/:id", "Catálogo", "Eliminación segura con validación de integridad referencial."],
        ["POST", "/api/movimientos/entrada", "Movimientos", "Registra entrada de mercancía e incrementa stock físico."],
        ["POST", "/api/movimientos/salida", "Movimientos", "Registra despacho/entrega con validación de saldo suficiente."],
        ["POST", "/api/movimientos/traslado", "Movimientos", "Ejecuta transferencia atómica entre Bodega Origen y Destino."],
        ["POST", "/api/movimientos/ajuste", "Movimientos", "Cuadre físico por conteo cíclico o auditoría."],
        ["GET", "/api/movimientos/kardex/:id", "Kardex", "Historial transaccional cronológico de un ítem."],
        ["GET", "/api/reportes/rotacion-abc", "Reportes", "Cálculo de matriz de Pareto y clasificación por zonas."],
        ["GET", "/api/reportes/vencimientos", "Reportes", "Monitoreo de lotes vigentes, próximos a vencer y caducados."],
        ["POST", "/api/reportes/exportar-excel", "Reportes", "Generación binaria de libro Excel con gráficos Donut."],
        ["GET", "/api/database/backup", "Base de Datos", "Generación de clon binario atómico VACUUM (.db)."],
        ["POST", "/api/database/restore", "Base de Datos", "Restauración integral de base de datos desde respaldo."]
    ]
    format_styled_table(doc, api_headers, api_data, [0.8, 2.0, 1.2, 2.5])
    
    doc.add_page_break()
    
    # ==================== MÓDULO 6: DESPLIEGUE ====================
    h6 = doc.add_heading("MÓDULO 6: GUÍA DE DESPLIEGUE Y COMPILACIÓN", level=1)
    h6.paragraph_format.space_after = Pt(12)
    for run in h6.runs:
        run.font.name = "Segoe UI"
        run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        
    doc.add_heading("6.1. Requisitos Previos", level=2)
    p = doc.add_paragraph(
        "• Sistema Operativo: Windows 10 o Windows 11 (64-bit).\n"
        "• Entorno de Ejecución: Node.js (versión 18.x o superior) y npm.\n"
        "• Dependencias Principales: Electron 44.0.0, Express 4.18, SQLite3, ExcelJS."
    )
    p.paragraph_format.space_after = Pt(8)
    
    doc.add_heading("6.2. Comandos de Inicialización y Compilación", level=2)
    
    p = doc.add_paragraph("Instalación de dependencias del proyecto:")
    p.paragraph_format.space_after = Pt(2)
    add_code_block(doc, "npm install")
    
    p = doc.add_paragraph("Ejecución en modo desarrollo:")
    p.paragraph_format.space_after = Pt(2)
    add_code_block(doc, "npm start\n# O mediante el lanzador rápido:\n.\\Iniciar_Inventario.bat")
    
    p = doc.add_paragraph("Compilación y generación de instaladores ejecutables y portables:")
    p.paragraph_format.space_after = Pt(2)
    add_code_block(doc, "npm run build\n# Genera los binarios en la carpeta /dist y /Portables")
    
    # Guardar documento
    output_path = os.path.abspath("d:/antigravity/INVENTARIO/Documentacion/MANUAL_INTEGRAL_INVENTARIO_CDS.docx")
    doc.save(output_path)
    print(f"Documento Word generado con exito en: {output_path}")

if __name__ == "__main__":
    build_word_manual()
