// ==============================================================
// INVENTARIO - SISTEMA EMPRESARIAL DE GESTIÓN FÍSICA Y VENCIMIENTOS
// LÓGICA DE CLIENTE (SPA, REST API, REGLAS DE NEGOCIO Y FORMULARIOS)
// ==============================================================

const API_BASE = '/api';

// ==============================================================
// GESTIÓN DE NOTIFICACIONES TOAST Y MODALES SIN BLOQUEOS
// ==============================================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toastId = 'toast-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    let bgClass = 'bg-success text-white';
    let iconClass = 'bi-check-circle-fill';

    if (type === 'danger' || type === 'error') {
        bgClass = 'bg-danger text-white';
        iconClass = 'bi-exclamation-triangle-fill';
    } else if (type === 'warning') {
        bgClass = 'bg-warning text-dark';
        iconClass = 'bi-exclamation-circle-fill';
    } else if (type === 'info') {
        bgClass = 'bg-info text-dark';
        iconClass = 'bi-info-circle-fill';
    }

    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center ${bgClass} border-0 shadow-lg mb-2`;
    toastEl.id = toastId;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body d-flex align-items-center gap-2 py-2 px-3">
                <i class="bi ${iconClass} fs-5"></i>
                <div class="fw-semibold small">${message}</div>
            </div>
            <button type="button" class="btn-close ${type === 'warning' || type === 'info' ? '' : 'btn-close-white'} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    container.appendChild(toastEl);
    const bsToast = new bootstrap.Toast(toastEl, { delay: 4500 });
    bsToast.show();

    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

function closeModal(modalId) {
    const modalEl = document.getElementById(modalId);
    if (!modalEl) return;

    try {
        const instance = bootstrap.Modal.getOrCreateInstance(modalEl);
        instance.hide();
    } catch (e) {
        console.warn('Error ocultando modal:', e);
    }

    // Limpieza de seguridad para eliminar backdrops atascados y reactivar scroll
    setTimeout(() => {
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }, 300);
}

// Estado global de la aplicación
let appState = {
    currentView: 'inicio',
    items: [],
    inventario: [],
    movimientos: [],
    vencimientos: [],
    bodegas: [],
    proyectos: [],
    config: {
        categorias: [],
        unidades: [],
        ubicaciones: [],
        causales: [],
        bodegas: [],
        proyectos: []
    }
};

// Inicialización al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {
    initUI();
    await loadConfig();
    await loadKPIs();
    await loadInventario();
    await loadItems();
    await loadMovimientos();
    await loadVencimientos();
    await loadBodegasYProyectos();
});

// ==============================================================
// 1. NAVEGACIÓN Y CONFIGURACIÓN DE INTERFAZ
// ==============================================================
function initUI() {
    // Fecha actual en el navbar
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    const systemDateEl = document.getElementById('system-date');
    if (systemDateEl) systemDateEl.textContent = `| ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}`;

    // Sidebar Toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('wrapper').classList.toggle('toggled');
        });
    }

    // Navegación Sidebar
    document.querySelectorAll('.nav-link-custom').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.getAttribute('data-view');
            navigate(view);
        });
    });

    // Escuchar cambios de hash si aplica
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.replace('#', '');
        if (hash) navigate(hash);
    });
}

function navigate(viewName) {
    appState.currentView = viewName;

    // Actualizar enlaces del sidebar
    document.querySelectorAll('.nav-link-custom').forEach(link => {
        if (link.getAttribute('data-view') === viewName) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Ocultar todas las vistas y mostrar la seleccionada
    document.querySelectorAll('.app-view').forEach(view => {
        view.style.display = 'none';
    });

    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.style.display = 'block';
    }

    // Actualizar título de la página
    const titles = {
        'inicio': 'Panel de Control',
        'inventario': 'Inventario Físico CDS',
        'movimientos': 'Historial de Movimientos',
        'items': 'Catálogo Maestro de Ítems',
        'vencimientos': 'Control de Vencimientos',
        'bodegas': 'Bodegas y Proyectos',
        'reportes': 'Kardex & Reportes Gerenciales',
        'database': 'Gestión de Base de Datos y Backups'
    };
    const pageTitleEl = document.getElementById('page-title');
    if (pageTitleEl && titles[viewName]) {
        pageTitleEl.textContent = titles[viewName];
    }

    // Refrescos automáticos según la vista
    if (viewName === 'inicio') loadKPIs();
    if (viewName === 'inventario') loadInventario();
    if (viewName === 'movimientos') loadMovimientos();
    if (viewName === 'items') loadItems();
    if (viewName === 'vencimientos') loadVencimientos();
    if (viewName === 'bodegas') loadBodegasYProyectos();
}

// ==============================================================
// 2. CARGA DE CONFIGURACIÓN Y LISTAS MAESTRAS
// ==============================================================
async function loadConfig() {
    try {
        const res = await fetch(`${API_BASE}/config`);
        const result = await res.json();
        if (result.success) {
            appState.config = result.data;
            populateSelectOptions();
        }
    } catch (err) {
        console.error('Error al cargar configuración:', err);
    }
}

function populateSelectOptions() {
    const { categorias, unidades, ubicaciones, causales, bodegas, proyectos } = appState.config;

    // Filtros de vistas
    fillSelect('filter-inv-categoria', categorias, true, 'Todas las Categorías');
    fillSelect('filter-items-categoria', categorias, true, 'Todas las Categorías');
    fillSelect('filter-mov-bodega', bodegas, true, 'Todas las Bodegas');

    // Selectores de formularios
    fillSelect('item-categoria', categorias, false);
    fillSelect('item-unidad', unidades, false);
    fillSelect('item-ubicacion', ubicaciones, false);

    fillSelect('mov-bodega-origen', bodegas, true, '-- Sin Bodega Origen --');
    fillSelect('mov-bodega-destino', bodegas, true, '-- Sin Bodega Destino --');
    fillSelect('mov-causal', causales, true, '-- Seleccionar Causal --');
    fillSelect('mov-proyecto', proyectos, true, 'Operación Central / General');
}

function fillSelect(elementId, items, allowEmpty = false, emptyText = '-- Seleccione --') {
    const select = document.getElementById(elementId);
    if (!select) return;

    let html = allowEmpty ? `<option value="ALL">${emptyText}</option>` : '';
    items.forEach(item => {
        html += `<option value="${item}">${item}</option>`;
    });
    select.innerHTML = html;
}

// ==============================================================
// 3. KPIS Y DASHBOARD EJECUTIVO
// ==============================================================
async function loadKPIs() {
    try {
        const res = await fetch(`${API_BASE}/kpis`);
        const data = await res.json();
        if (!data.success) return;

        const { kpis, categoriasStock, ultimosMovimientos } = data;

        // Tarjetas
        document.getElementById('kpi-total-items').textContent = kpis.totalItems.toLocaleString();
        document.getElementById('kpi-stock-cds').textContent = kpis.totalStockCDS.toLocaleString();
        document.getElementById('kpi-items-vencidos').textContent = kpis.itemsVencidos.toLocaleString();
        document.getElementById('kpi-proximos-vencer').textContent = kpis.itemsProximosVencer.toLocaleString();
        document.getElementById('kpi-stock-bajo').textContent = kpis.itemsStockBajo.toLocaleString();
        document.getElementById('kpi-total-movimientos').textContent = kpis.totalMovimientos.toLocaleString();

        // Badges en sidebar
        const badgeStockBajo = document.getElementById('sidebar-badge-stock-bajo');
        if (badgeStockBajo) {
            badgeStockBajo.textContent = kpis.itemsStockBajo;
            badgeStockBajo.style.display = kpis.itemsStockBajo > 0 ? 'inline-block' : 'none';
        }

        const badgeVencidos = document.getElementById('sidebar-badge-vencidos');
        if (badgeVencidos) {
            badgeVencidos.textContent = kpis.itemsVencidos;
            badgeVencidos.style.display = kpis.itemsVencidos > 0 ? 'inline-block' : 'none';
        }

        // Tabla de existencias por categoría
        const tableCat = document.getElementById('table-dashboard-categorias');
        if (tableCat) {
            tableCat.innerHTML = categoriasStock.map(c => `
                <tr>
                    <td><span class="fw-semibold">${c.categoria}</span></td>
                    <td class="text-center"><span class="badge bg-light text-dark border">${c.total_items}</span></td>
                    <td class="text-end"><strong class="text-primary">${c.stock_total.toLocaleString()}</strong></td>
                </tr>
            `).join('');
        }

        // Lista de últimos movimientos
        const listMovs = document.getElementById('list-dashboard-movimientos');
        if (listMovs) {
            listMovs.innerHTML = ultimosMovimientos.map(m => {
                let badgeClass = 'bg-primary';
                if (m.tipo_movimiento === 'ENTRADA') badgeClass = 'bg-success';
                if (m.tipo_movimiento === 'ENTREGA') badgeClass = 'bg-warning text-dark';
                if (m.tipo_movimiento === 'DISPOSICION FINAL') badgeClass = 'bg-danger';

                return `
                    <div class="list-group-item px-0 py-2 border-0 border-bottom">
                        <div class="d-flex w-100 justify-content-between align-items-center mb-1">
                            <span class="badge ${badgeClass} small">${m.tipo_movimiento}</span>
                            <small class="text-muted">${m.fecha} ${m.hora}</small>
                        </div>
                        <div class="fw-semibold small text-dark">${m.nombre_item}</div>
                        <div class="d-flex justify-content-between text-muted" style="font-size: 0.78rem;">
                            <span>${m.n_movimiento} (${m.cantidad} ${m.unidad})</span>
                            <span>${m.responsable || 'CDS'}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('Error al cargar KPIs:', err);
    }
}

// ==============================================================
// 4. INVENTARIO FÍSICO OFICIAL CDS
// ==============================================================
async function loadInventario() {
    try {
        const search = document.getElementById('filter-inv-search')?.value || '';
        const categoria = document.getElementById('filter-inv-categoria')?.value || 'ALL';
        const estadoStock = document.getElementById('filter-inv-estado')?.value || 'ALL';

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (categoria && categoria !== 'ALL') params.append('categoria', categoria);
        if (estadoStock && estadoStock !== 'ALL') params.append('estadoStock', estadoStock);

        const res = await fetch(`${API_BASE}/inventario?${params.toString()}`);
        const result = await res.json();
        if (!result.success) return;

        appState.inventario = result.data;
        renderInventarioTable(result.data);
    } catch (err) {
        console.error('Error al cargar inventario:', err);
    }
}

function renderInventarioTable(items) {
    const tbody = document.getElementById('table-inventario-body');
    if (!tbody) return;

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-muted">No se encontraron productos con los filtros seleccionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(i => {
        let badgeStyle = 'badge-stock-normal';
        if (i.estado_stock === 'STOCK BAJO') badgeStyle = 'badge-stock-bajo';
        if (i.estado_stock === 'SIN EXISTENCIAS') badgeStyle = 'badge-stock-cero';
        if (i.estado_stock === 'ERROR: SOBREGIRO') badgeStyle = 'badge-stock-sobregiro';

        return `
            <tr>
                <td><strong class="text-dark">${i.codigo}</strong></td>
                <td>
                    <div class="fw-semibold text-dark">${i.nombre}</div>
                    <small class="text-muted">${i.subcategoria || 'General'}</small>
                </td>
                <td><span class="badge bg-light text-secondary border">${i.categoria}</span></td>
                <td>${i.unidad_medida}</td>
                <td><span class="badge bg-secondary bg-opacity-10 text-secondary">${i.ubicacion_cds}</span></td>
                <td class="text-end text-success">${i.entradas}</td>
                <td class="text-end text-warning">${i.entregas_enviadas}</td>
                <td class="text-end text-danger">${i.disp_final}</td>
                <td class="text-end fs-6 fw-bold text-primary">${i.existencia}</td>
                <td class="text-end text-muted">${i.stock_minimo}</td>
                <td class="text-center">
                    <span class="badge ${badgeStyle} px-2 py-1">${i.estado_stock}</span>
                </td>
                <td class="text-center">
                    <button class="btn btn-outline-primary btn-sm py-0 px-2" onclick="verKardexDirecto(${i.codigo})" title="Ver Kardex">
                        <i class="bi bi-file-earmark-bar-graph"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ==============================================================
// 5. MOVIMIENTOS Y TRANSACCIONES (frmMovimiento)
// ==============================================================
async function loadMovimientos() {
    try {
        const search = document.getElementById('filter-mov-search')?.value || '';
        const tipo = document.getElementById('filter-mov-tipo')?.value || 'ALL';
        const bodega = document.getElementById('filter-mov-bodega')?.value || 'ALL';
        const fechaInicio = document.getElementById('filter-mov-fechainicio')?.value || '';
        const fechaFin = document.getElementById('filter-mov-fechafin')?.value || '';

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (tipo && tipo !== 'ALL') params.append('tipo', tipo);
        if (bodega && bodega !== 'ALL') params.append('bodega', bodega);
        if (fechaInicio) params.append('fechaInicio', fechaInicio);
        if (fechaFin) params.append('fechaFin', fechaFin);

        const res = await fetch(`${API_BASE}/movimientos?${params.toString()}`);
        const result = await res.json();
        if (!result.success) return;

        appState.movimientos = result.data;
        renderMovimientosTable(result.data);
    } catch (err) {
        console.error('Error al cargar movimientos:', err);
    }
}

function renderMovimientosTable(movs) {
    const tbody = document.getElementById('table-movimientos-body');
    if (!tbody) return;

    if (movs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-muted">No se encontraron movimientos registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = movs.map((m, index) => {
        let badgeClass = 'bg-secondary';
        if (m.tipo_movimiento === 'ENTRADA') badgeClass = 'bg-success';
        if (m.tipo_movimiento === 'ENTREGA') badgeClass = 'bg-warning text-dark';
        if (m.tipo_movimiento === 'DISPOSICION FINAL') badgeClass = 'bg-danger';
        if (m.tipo_movimiento === 'DEVOLUCION') badgeClass = 'bg-info text-dark';

        const isLatest = index === 0;

        return `
            <tr class="${isLatest ? 'table-light' : ''}">
                <td>
                    <strong class="text-primary">${m.n_movimiento}</strong>
                    ${isLatest ? '<span class="badge bg-primary ms-1" style="font-size: 0.65rem;">Último</span>' : ''}
                </td>
                <td>
                    <div>${m.fecha}</div>
                    <small class="text-muted">${m.hora}</small>
                </td>
                <td><span class="badge ${badgeClass}">${m.tipo_movimiento}</span></td>
                <td>${m.codigo_item}</td>
                <td><div class="fw-semibold">${m.nombre_item}</div></td>
                <td class="text-end fw-bold">${m.cantidad} ${m.unidad}</td>
                <td>${m.bodega_origen || '-'}</td>
                <td>${m.bodega_destino || '-'}</td>
                <td>
                    <div class="small fw-semibold">${m.proyecto_destino || '-'}</div>
                    <small class="text-muted">${m.causal_condicion || ''}</small>
                </td>
                <td>${m.responsable || '-'}</td>
                <td class="small text-muted">${m.observaciones || '-'}</td>
                <td class="text-center">
                    <button class="btn btn-outline-danger btn-sm py-0 px-2 shadow-sm" onclick="abrirModalEliminarMovimiento(${m.id})" title="Eliminar y revertir este movimiento">
                        <i class="bi bi-trash3"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function openModalMovimiento(preselectedCode = null) {
    const form = document.getElementById('form-movimiento');
    if (form) form.reset();

    // Resetear vistas previas e informaciones
    const infoDiv = document.getElementById('mov-item-info');
    if (infoDiv) infoDiv.style.display = 'none';

    const vencContainer = document.getElementById('mov-vencimiento-container');
    if (vencContainer) vencContainer.style.display = 'none';

    // Asegurar botón habilitado
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Registrar Transacción';
    }

    // Llenar selector de ítems activos
    const select = document.getElementById('mov-item-select');
    if (select) {
        let html = '<option value="">-- Seleccionar Ítem del Catálogo --</option>';
        appState.items.filter(i => i.estado === 'Activo').forEach(item => {
            html += `<option value="${item.codigo}">${item.codigo} - ${item.nombre}</option>`;
        });
        select.innerHTML = html;

        if (preselectedCode) {
            select.value = preselectedCode;
            handleItemSelectInMovimiento(preselectedCode);
        }
    }

    handleTipoMovimientoChange(document.getElementById('mov-tipo').value);

    const modalEl = document.getElementById('modalMovimiento');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function handleTipoMovimientoChange(tipo) {
    const origenSelect = document.getElementById('mov-bodega-origen');
    const destinoSelect = document.getElementById('mov-bodega-destino');
    const causalSelect = document.getElementById('mov-causal');
    const vencContainer = document.getElementById('mov-vencimiento-container');

    // Reglas de negocio
    if (tipo === 'ENTRADA') {
        origenSelect.value = 'ALL';
        destinoSelect.value = 'CDS';
        causalSelect.value = 'NUEVO / INICIAL';
    } else if (tipo === 'ENTREGA') {
        origenSelect.value = 'CDS';
        destinoSelect.value = 'PROYECTOS';
        causalSelect.value = 'ALL';
    } else if (tipo === 'DISPOSICION FINAL') {
        origenSelect.value = 'CDS';
        destinoSelect.value = 'DISPOSICION FINAL';
        causalSelect.value = 'Dañado';
    } else if (tipo === 'DEVOLUCION') {
        origenSelect.value = 'PROYECTOS';
        destinoSelect.value = 'CDS';
        causalSelect.value = 'ALL';
    } else {
        origenSelect.value = 'CDS';
        destinoSelect.value = 'CDS';
    }

    // Mostrar campo de fecha de vencimiento si es ENTRADA y el ítem aplica
    const selectedCode = document.getElementById('mov-item-select')?.value;
    const item = appState.items.find(i => String(i.codigo) === String(selectedCode));
    if (tipo === 'ENTRADA' && item && item.aplica_vencimiento) {
        vencContainer.style.display = 'block';
    } else {
        vencContainer.style.display = 'none';
    }

    actualizarStockPreviewEnMovimiento();
}

function handleItemSelectInMovimiento(codigo) {
    const item = appState.items.find(i => String(i.codigo) === String(codigo));
    const infoDiv = document.getElementById('mov-item-info');
    const vencContainer = document.getElementById('mov-vencimiento-container');
    const tipo = document.getElementById('mov-tipo').value;

    if (!item) {
        if (infoDiv) infoDiv.style.display = 'none';
        if (vencContainer) vencContainer.style.display = 'none';
        return;
    }

    document.getElementById('mov-preview-nombre').textContent = item.nombre;
    document.getElementById('mov-preview-ubicacion').textContent = item.ubicacion_cds || 'A1';
    document.getElementById('mov-preview-unidad').textContent = item.unidad_medida;

    infoDiv.style.display = 'block';

    if (tipo === 'ENTRADA' && item.aplica_vencimiento) {
        vencContainer.style.display = 'block';
    } else {
        vencContainer.style.display = 'none';
    }

    actualizarStockPreviewEnMovimiento();
}

async function actualizarStockPreviewEnMovimiento() {
    const selectedCode = document.getElementById('mov-item-select')?.value;
    if (!selectedCode) return;

    const item = appState.items.find(i => String(i.codigo) === String(selectedCode));
    if (!item) return;

    const tipo = document.getElementById('mov-tipo').value;
    const origenSelect = document.getElementById('mov-bodega-origen');
    const labelEl = document.getElementById('mov-preview-stock-label');
    const badgeEl = document.getElementById('mov-preview-stock');

    let bodegaRelevante = 'CDS';
    if (tipo === 'DEVOLUCION') {
        bodegaRelevante = (origenSelect && origenSelect.value && origenSelect.value !== 'ALL') ? origenSelect.value : 'PROYECTOS';
    } else if (tipo === 'ENTREGA' || tipo === 'DISPOSICION FINAL' || tipo === 'AJUSTE NEGATIVO') {
        bodegaRelevante = (origenSelect && origenSelect.value && origenSelect.value !== 'ALL') ? origenSelect.value : 'CDS';
    } else {
        bodegaRelevante = 'CDS';
    }

    try {
        const res = await fetch(`${API_BASE}/inventario/stock-bodega?codigo_item=${selectedCode}&bodega=${encodeURIComponent(bodegaRelevante)}`);
        const result = await res.json();
        const stockActual = result.success ? result.stock : 0;

        if (labelEl) {
            labelEl.textContent = `Stock Disponible [${bodegaRelevante}]:`;
        }

        if (badgeEl) {
            if (tipo === 'DEVOLUCION' || tipo === 'ENTREGA' || tipo === 'DISPOSICION FINAL' || tipo === 'AJUSTE NEGATIVO') {
                if (stockActual <= 0) {
                    badgeEl.className = 'badge bg-danger fs-6';
                    badgeEl.textContent = `0 ${item.unidad_medida} (Sin existencias)`;
                } else {
                    badgeEl.className = 'badge bg-success fs-6';
                    badgeEl.textContent = `${stockActual} ${item.unidad_medida}`;
                }
            } else {
                badgeEl.className = 'badge bg-primary fs-6';
                badgeEl.textContent = `${stockActual} ${item.unidad_medida}`;
            }
        }
    } catch (err) {
        console.warn('Error al consultar stock por bodega:', err);
    }
}

async function submitMovimiento(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Registrando...';
    }

    const payload = {
        tipo_movimiento: document.getElementById('mov-tipo').value,
        codigo_item: parseInt(document.getElementById('mov-item-select').value, 10),
        cantidad: parseFloat(document.getElementById('mov-cantidad').value),
        bodega_origen: document.getElementById('mov-bodega-origen').value === 'ALL' ? null : document.getElementById('mov-bodega-origen').value,
        bodega_destino: document.getElementById('mov-bodega-destino').value === 'ALL' ? null : document.getElementById('mov-bodega-destino').value,
        causal_condicion: document.getElementById('mov-causal').value === 'ALL' ? null : document.getElementById('mov-causal').value,
        proyecto_destino: document.getElementById('mov-proyecto').value === 'ALL' ? null : document.getElementById('mov-proyecto').value,
        responsable: document.getElementById('mov-responsable').value,
        persona_recibe_devuelve: document.getElementById('mov-persona-recibe').value || null,
        documento_referencia: document.getElementById('mov-doc-ref').value || 'MANUAL',
        observaciones: document.getElementById('mov-observaciones').value || null,
        fecha_vencimiento_lote: document.getElementById('mov-fecha-vencimiento')?.value || null
    };

    try {
        const res = await fetch(`${API_BASE}/movimientos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Registrar Transacción';
            }
            return;
        }

        // Cerrar modal limpiamente sin bloquear el thread
        closeModal('modalMovimiento');
        showToast(`✅ ${result.message}`, 'success');

        // Resetear formulario para el próximo registro
        document.getElementById('form-movimiento')?.reset();

        // Recargar datos en segundo plano
        await Promise.all([
            loadKPIs(),
            loadInventario(),
            loadMovimientos(),
            loadVencimientos()
        ]);
    } catch (err) {
        showToast(`Error al registrar movimiento: ${err.message}`, 'danger');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Registrar Transacción';
        }
    }
}

// ==============================================================
// 5.1. ELIMINACIÓN Y REVERSIÓN DE MOVIMIENTOS
// ==============================================================
async function abrirModalEliminarUltimoMovimiento() {
    try {
        const res = await fetch(`${API_BASE}/movimientos/ultimo`);
        const result = await res.json();
        if (!result.success || !result.data) {
            showToast('No hay movimientos registrados para eliminar.', 'warning');
            return;
        }

        mostrarModalEliminar(result.data);
    } catch (err) {
        showToast(`Error al consultar el último movimiento: ${err.message}`, 'danger');
    }
}

async function abrirModalEliminarMovimiento(id) {
    const mov = appState.movimientos.find(m => m.id === id);
    if (!mov) {
        try {
            const res = await fetch(`${API_BASE}/movimientos`);
            const result = await res.json();
            if (result.success) {
                const found = result.data.find(m => m.id === id);
                if (found) {
                    mostrarModalEliminar(found);
                    return;
                }
            }
        } catch (e) {}
        showToast('Movimiento no encontrado.', 'warning');
        return;
    }

    mostrarModalEliminar(mov);
}

function mostrarModalEliminar(mov) {
    document.getElementById('del-mov-id').value = mov.id;
    document.getElementById('del-mov-n').textContent = mov.n_movimiento;
    document.getElementById('del-mov-tipo').textContent = mov.tipo_movimiento;
    document.getElementById('del-mov-item').textContent = `${mov.codigo_item} - ${mov.nombre_item}`;
    document.getElementById('del-mov-cantidad').textContent = `${mov.cantidad} ${mov.unidad}`;
    document.getElementById('del-mov-fecha').textContent = `${mov.fecha} ${mov.hora}`;
    document.getElementById('del-mov-responsable').textContent = mov.responsable || 'CDS';

    const btn = document.getElementById('btn-confirmar-eliminar-mov');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Eliminar y Revertir Stock';
    }

    const modalEl = document.getElementById('modalEliminarMovimiento');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function ejecutarEliminarMovimiento() {
    const id = document.getElementById('del-mov-id').value;
    if (!id) return;

    const btn = document.getElementById('btn-confirmar-eliminar-mov');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Eliminando...';
    }

    try {
        const res = await fetch(`${API_BASE}/movimientos/${id}`, {
            method: 'DELETE'
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Eliminar y Revertir Stock';
            }
            return;
        }

        closeModal('modalEliminarMovimiento');
        showToast(`✅ ${result.message}`, 'success');

        await Promise.all([
            loadKPIs(),
            loadInventario(),
            loadMovimientos(),
            loadVencimientos()
        ]);
    } catch (err) {
        showToast(`Error al eliminar movimiento: ${err.message}`, 'danger');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Eliminar y Revertir Stock';
        }
    }
}

// ==============================================================
// 6. CATÁLOGO DE ITEMS (frmNuevoItem)
// ==============================================================
async function loadItems() {
    try {
        const search = document.getElementById('filter-items-search')?.value || '';
        const categoria = document.getElementById('filter-items-categoria')?.value || 'ALL';
        const estado = document.getElementById('filter-items-estado')?.value || 'ALL';

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (categoria && categoria !== 'ALL') params.append('categoria', categoria);
        if (estado && estado !== 'ALL') params.append('estado', estado);

        const res = await fetch(`${API_BASE}/items?${params.toString()}`);
        const result = await res.json();
        if (!result.success) return;

        appState.items = result.data;
        renderItemsTable(result.data);

        // Actualizar selector de Kardex
        const repSelect = document.getElementById('reporte-item-select');
        if (repSelect) {
            let html = '<option value="">-- Seleccionar Ítem del Catálogo --</option>';
            result.data.forEach(item => {
                html += `<option value="${item.codigo}">${item.codigo} - ${item.nombre}</option>`;
            });
            repSelect.innerHTML = html;
        }
    } catch (err) {
        console.error('Error al cargar items:', err);
    }
}

function renderItemsTable(items) {
    const tbody = document.getElementById('table-items-body');
    if (!tbody) return;

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No se encontraron ítems en el catálogo.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(i => {
        const estadoBadge = i.estado === 'Activo' 
            ? '<span class="badge bg-success">Activo</span>' 
            : '<span class="badge bg-secondary">Inactivo</span>';

        const vencBadge = i.aplica_vencimiento 
            ? '<span class="badge bg-info text-dark">SI APLICA</span>' 
            : '<span class="text-muted small">NO APLICA</span>';

        return `
            <tr>
                <td><strong class="text-dark">${i.codigo}</strong></td>
                <td>
                    <div class="fw-semibold text-dark">${i.nombre}</div>
                    <small class="text-muted">Marca: ${i.marca || '-'} | Ref: ${i.referencia || '-'}</small>
                </td>
                <td><span class="badge bg-light text-dark border">${i.categoria}</span></td>
                <td>${i.unidad_medida}</td>
                <td><span class="badge bg-secondary bg-opacity-10 text-secondary">${i.ubicacion_cds}</span></td>
                <td>${vencBadge}</td>
                <td class="text-end">${i.stock_minimo}</td>
                <td class="text-center">${estadoBadge}</td>
                <td class="text-center">
                    <button class="btn btn-outline-primary btn-sm py-0 px-2 me-1" onclick="editarItem(${i.codigo})" title="Editar Ítem">
                        <i class="bi bi-pencil-square"></i>
                    </button>
                    <button class="btn btn-outline-secondary btn-sm py-0 px-2" onclick="verKardexDirecto(${i.codigo})" title="Ver Kardex">
                        <i class="bi bi-file-earmark-bar-graph"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function sugerirSiguienteCodigo() {
    try {
        const res = await fetch(`${API_BASE}/items/next-code`);
        const result = await res.json();
        if (result.success) {
            document.getElementById('item-codigo').value = result.nextCode;
        }
    } catch (err) {
        console.error('Error al sugerir código:', err);
    }
}

function openModalNuevoItem() {
    const form = document.getElementById('form-item');
    if (form) form.reset();

    document.getElementById('item-codigo').readOnly = false;
    document.getElementById('modalNuevoItemTitle').innerHTML = '<i class="bi bi-plus-square-fill text-success me-2"></i>Alta y Edición de Ítems en Catálogo';

    sugerirSiguienteCodigo();

    const modalEl = document.getElementById('modalNuevoItem');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function editarItem(codigo) {
    const item = appState.items.find(i => i.codigo === codigo);
    if (!item) return;

    document.getElementById('item-codigo').value = item.codigo;
    document.getElementById('item-codigo').readOnly = true;
    document.getElementById('item-nombre').value = item.nombre;
    document.getElementById('item-categoria').value = item.categoria;
    document.getElementById('item-subcategoria').value = item.subcategoria || 'General';
    document.getElementById('item-unidad').value = item.unidad_medida;
    document.getElementById('item-marca').value = item.marca || 'Generico';
    document.getElementById('item-referencia').value = item.referencia || '-';
    document.getElementById('item-ubicacion').value = item.ubicacion_cds || 'A1';
    document.getElementById('item-stock-minimo').value = item.stock_minimo || 0;
    document.getElementById('item-aplica-vencimiento').value = item.aplica_vencimiento ? '1' : '0';
    document.getElementById('item-estado').value = item.estado || 'Activo';
    document.getElementById('item-observaciones').value = item.observaciones || '';

    document.getElementById('modalNuevoItemTitle').innerHTML = `<i class="bi bi-pencil-square text-primary me-2"></i>Modificar Ítem en Catálogo (${item.codigo})`;

    const modalEl = document.getElementById('modalNuevoItem');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function submitItem(e) {
    e.preventDefault();

    const codigoRaw = document.getElementById('item-codigo').value.trim();
    if (!/^\d+$/.test(codigoRaw)) {
        showToast('❌ Error: El código del ítem debe ser 100% numérico, sin letras ni guiones.', 'danger');
        return;
    }

    const codigo = parseInt(codigoRaw, 10);
    const isEdit = document.getElementById('item-codigo').readOnly;

    const payload = {
        codigo,
        nombre: document.getElementById('item-nombre').value.trim().toUpperCase(),
        categoria: document.getElementById('item-categoria').value,
        subcategoria: document.getElementById('item-subcategoria').value,
        unidad_medida: document.getElementById('item-unidad').value,
        marca: document.getElementById('item-marca').value,
        referencia: document.getElementById('item-referencia').value,
        ubicacion_cds: document.getElementById('item-ubicacion').value,
        stock_minimo: parseInt(document.getElementById('item-stock-minimo').value, 10) || 0,
        aplica_vencimiento: document.getElementById('item-aplica-vencimiento').value === '1',
        estado: document.getElementById('item-estado').value,
        observaciones: document.getElementById('item-observaciones').value
    };

    try {
        const url = isEdit ? `${API_BASE}/items/${codigo}` : `${API_BASE}/items`;
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            return;
        }

        closeModal('modalNuevoItem');
        showToast(`✅ ${result.message}`, 'success');

        await loadItems();
        await loadInventario();
        await loadKPIs();
    } catch (err) {
        showToast(`Error al guardar ítem: ${err.message}`, 'danger');
    }
}

// ==============================================================
// 7. CONTROL DE VENCIMIENTOS Y ASISTENTE DE BAJAS
// ==============================================================
async function loadVencimientos() {
    try {
        const res = await fetch(`${API_BASE}/vencimientos`);
        const result = await res.json();
        if (!result.success) return;

        appState.vencimientos = result.data;
        renderVencimientosTable(result.data);
    } catch (err) {
        console.error('Error al cargar vencimientos:', err);
    }
}

function renderVencimientosTable(lotes) {
    const tbody = document.getElementById('table-vencimientos-body');
    if (!tbody) return;

    if (lotes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No hay lotes con fecha de vencimiento pendientes de consumo.</td></tr>`;
        return;
    }

    tbody.innerHTML = lotes.map(l => {
        let badgeClass = 'badge-vigente';
        if (l.estado_actualizado === '¡VENCIDO!') badgeClass = 'badge-vencido';
        if (l.estado_actualizado === 'PROXIMO A VENCER') badgeClass = 'badge-proximo-vencer';

        return `
            <tr>
                <td><strong>${l.codigo_item}</strong></td>
                <td><span class="fw-semibold">${l.nombre_item}</span></td>
                <td><span class="badge bg-light text-dark border">${l.bodega}</span></td>
                <td>${l.fecha_ingreso}</td>
                <td><strong>${l.fecha_vencimiento}</strong></td>
                <td class="text-center font-monospace">${l.dias_restantes} días</td>
                <td class="text-end fw-bold text-primary">${l.cant_disponible}</td>
                <td class="text-center"><span class="badge ${badgeClass} px-2 py-1">${l.estado_actualizado}</span></td>
                <td class="small text-muted">${l.observaciones || '-'}</td>
            </tr>
        `;
    }).join('');
}

function openModalBajasVencidos() {
    const vencidos = appState.vencimientos.filter(l => l.estado_actualizado === '¡VENCIDO!' && l.bodega === 'CDS');
    const tbody = document.getElementById('table-bajas-body');

    if (!tbody) return;

    if (vencidos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-3 text-muted">No existen lotes vencidos en Bodega CDS pendientes de dar de baja.</td></tr>`;
    } else {
        tbody.innerHTML = vencidos.map(l => `
            <tr>
                <td class="text-center">
                    <input type="checkbox" class="check-baja-item" value="${l.id}" checked>
                </td>
                <td><strong>${l.codigo_item}</strong></td>
                <td>${l.nombre_item}</td>
                <td>${l.fecha_ingreso}</td>
                <td><span class="text-danger fw-bold">${l.fecha_vencimiento}</span></td>
                <td class="text-end fw-bold">${l.cant_disponible}</td>
                <td class="text-center"><span class="badge bg-danger">VENCIDO</span></td>
            </tr>
        `).join('');
    }

    const modalEl = document.getElementById('modalBajasVencidos');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function toggleSelectAllBajas(checkbox) {
    document.querySelectorAll('.check-baja-item').forEach(cb => {
        cb.checked = checkbox.checked;
    });
}

async function ejecutarBajasMasivas() {
    const checked = Array.from(document.querySelectorAll('.check-baja-item:checked')).map(cb => parseInt(cb.value, 10));
    if (checked.length === 0) {
        showToast('⚠️ Seleccione al menos un lote vencido para dar de baja.', 'warning');
        return;
    }

    if (!confirm(`¿Confirma el traslado de ${checked.length} lotes vencidos a la bodega DISPOSICIÓN FINAL?`)) {
        return;
    }

    try {
        const payload = {
            lotesIds: checked,
            responsable: document.getElementById('bajas-responsable').value,
            observaciones: document.getElementById('bajas-obs').value
        };

        const res = await fetch(`${API_BASE}/vencimientos/bajas-automaticas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            return;
        }

        closeModal('modalBajasVencidos');
        showToast(`✅ ${result.message}`, 'success');

        await loadKPIs();
        await loadInventario();
        await loadMovimientos();
        await loadVencimientos();
    } catch (err) {
        showToast(`Error al ejecutar bajas: ${err.message}`, 'danger');
    }
}

// ==============================================================
// 8. BODEGAS Y PROYECTOS
// ==============================================================
async function loadBodegasYProyectos() {
    try {
        const [resBod, resProy] = await Promise.all([
            fetch(`${API_BASE}/bodegas`),
            fetch(`${API_BASE}/proyectos`)
        ]);

        const dataBod = await resBod.json();
        const dataProy = await resProy.json();

        if (dataBod.success) {
            appState.bodegas = dataBod.data;
            const tbody = document.getElementById('table-bodegas-body');
            if (tbody) {
                tbody.innerHTML = dataBod.data.map(b => {
                    const esCentral = b.es_central === 1 || b.codigo === 'BOD-001';
                    return `
                    <tr>
                        <td><span class="badge bg-light text-primary border font-monospace fw-bold">${b.codigo}</span></td>
                        <td>
                            <div class="fw-bold d-flex align-items-center flex-wrap gap-1">
                                <span>${b.nombre}</span>
                                ${esCentral ? '<span class="badge bg-primary shadow-sm small" style="font-size: 0.72rem;"><i class="bi bi-star-fill text-warning me-1"></i>Central</span>' : ''}
                            </div>
                            <small class="text-muted">${b.ubicacion || ''}</small>
                        </td>
                        <td>${b.responsable || '-'}</td>
                        <td class="text-center">
                            <span class="badge ${b.estado === 'Activa' ? 'bg-success' : 'bg-secondary'}">${b.estado}</span>
                        </td>
                        <td class="text-center">
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary btn-sm py-1 px-2" onclick="editarBodega('${b.codigo}')" title="Modificar Bodega">
                                    <i class="bi bi-pencil-square"></i>
                                </button>
                                ${esCentral ? `
                                    <button class="btn btn-outline-secondary btn-sm py-1 px-2" disabled title="La Bodega Central no se puede eliminar (Solo modificar)">
                                        <i class="bi bi-lock-fill"></i>
                                    </button>
                                ` : `
                                    <button class="btn btn-outline-danger btn-sm py-1 px-2" onclick="abrirModalEliminarBodega('${b.codigo}')" title="Eliminar Bodega">
                                        <i class="bi bi-trash3"></i>
                                    </button>
                                `}
                            </div>
                        </td>
                    </tr>
                `;
                }).join('');
            }
        }

        if (dataProy.success) {
            appState.proyectos = dataProy.data;
            const tbody = document.getElementById('table-proyectos-body');
            if (tbody) {
                tbody.innerHTML = dataProy.data.map(p => `
                    <tr>
                        <td>#${p.id}</td>
                        <td>
                            <div class="fw-bold">${p.nombre}</div>
                            <small class="text-muted">${p.observaciones || ''}</small>
                        </td>
                        <td>${p.responsable || '-'}</td>
                        <td class="text-center">
                            <span class="badge ${p.estado === 'Activo' ? 'bg-success' : 'bg-secondary'}">${p.estado}</span>
                        </td>
                    </tr>
                `).join('');
            }
        }
    } catch (err) {
        console.error('Error al cargar bodegas y proyectos:', err);
    }
}

async function openModalNuevaBodega() {
    document.getElementById('form-bodega').reset();
    document.getElementById('bod-is-edit').value = '0';
    document.getElementById('modalBodegaTitle').innerHTML = '<i class="bi bi-building-add text-secondary me-2"></i>Nueva Bodega (Autogenerada)';
    
    const btn = document.getElementById('btn-guardar-bodega');
    if (btn) btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Guardar Bodega';

    try {
        const res = await fetch(`${API_BASE}/bodegas/siguiente-codigo`);
        const data = await res.json();
        if (data.success) {
            document.getElementById('bod-codigo').value = data.siguienteCodigo;
            const alertEl = document.getElementById('bod-central-alert');
            const alertText = document.getElementById('bod-central-alert-text');
            if (data.esPrimera) {
                if (alertEl) alertEl.style.display = 'flex';
                if (alertText) alertText.innerHTML = '<strong>Primera Bodega:</strong> Esta será la primera bodega registrada y funcionará como la <strong>BODEGA CENTRAL</strong> del sistema.';
            } else {
                if (alertEl) alertEl.style.display = 'none';
            }
        } else {
            document.getElementById('bod-codigo').value = 'BOD-???';
        }
    } catch (err) {
        document.getElementById('bod-codigo').value = 'BOD-???';
    }

    const modalEl = document.getElementById('modalNuevaBodega');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function editarBodega(codigo) {
    if (!appState.bodegas) return;
    const bodega = appState.bodegas.find(b => b.codigo === codigo);
    if (!bodega) return;

    document.getElementById('form-bodega').reset();
    document.getElementById('bod-is-edit').value = '1';
    document.getElementById('bod-codigo').value = bodega.codigo;
    document.getElementById('bod-nombre').value = bodega.nombre;
    document.getElementById('bod-ubicacion').value = bodega.ubicacion || '';
    document.getElementById('bod-responsable').value = bodega.responsable || '';
    document.getElementById('bod-estado').value = bodega.estado || 'Activa';
    document.getElementById('bod-obs').value = bodega.observaciones || '';

    const esCentral = bodega.es_central === 1 || bodega.codigo === 'BOD-001';
    const alertEl = document.getElementById('bod-central-alert');
    const alertText = document.getElementById('bod-central-alert-text');

    if (esCentral) {
        if (alertEl) alertEl.style.display = 'flex';
        if (alertText) alertText.innerHTML = '<strong>Bodega Central:</strong> Esta bodega es el almacén central del sistema. Puede actualizar sus datos descriptivos y responsable. Está protegida contra eliminación.';
    } else {
        if (alertEl) alertEl.style.display = 'none';
    }

    document.getElementById('modalBodegaTitle').innerHTML = `<i class="bi bi-pencil-square text-primary me-2"></i>Modificar Bodega (${bodega.codigo})`;
    const btn = document.getElementById('btn-guardar-bodega');
    if (btn) btn.innerHTML = '<i class="bi bi-save me-1"></i> Actualizar Bodega';

    const modalEl = document.getElementById('modalNuevaBodega');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function submitBodega(e) {
    e.preventDefault();
    const isEdit = document.getElementById('bod-is-edit').value === '1';
    const payload = {
        isEdit,
        codigo: document.getElementById('bod-codigo').value.trim().toUpperCase(),
        nombre: document.getElementById('bod-nombre').value.trim().toUpperCase(),
        ubicacion: document.getElementById('bod-ubicacion').value,
        responsable: document.getElementById('bod-responsable').value,
        estado: document.getElementById('bod-estado').value,
        observaciones: document.getElementById('bod-obs').value
    };

    try {
        const res = await fetch(`${API_BASE}/bodegas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeModal('modalNuevaBodega');
            showToast(`✅ ${result.message}`, 'success');
            await loadBodegasYProyectos();
            await loadConfig();
        } else {
            showToast(`⚠️ ${result.error}`, 'danger');
        }
    } catch (err) {
        showToast('Error al guardar bodega: ' + err.message, 'danger');
    }
}

function abrirModalEliminarBodega(codigo) {
    if (!appState.bodegas) return;
    const bodega = appState.bodegas.find(b => b.codigo === codigo);
    if (!bodega) return;

    if (bodega.es_central === 1 || bodega.codigo === 'BOD-001') {
        showToast('⚠️ La Bodega Central no puede ser eliminada. Solo se permite su modificación.', 'warning');
        return;
    }

    document.getElementById('del-bod-cod-input').value = bodega.codigo;
    document.getElementById('del-bod-codigo').textContent = bodega.codigo;
    document.getElementById('del-bod-nombre').textContent = bodega.nombre;
    document.getElementById('del-bod-ubicacion').textContent = bodega.ubicacion || 'No especificada';
    document.getElementById('del-bod-responsable').textContent = bodega.responsable || 'No asignado';
    document.getElementById('del-bod-estado').textContent = bodega.estado || 'Activa';

    const btn = document.getElementById('btn-confirmar-eliminar-bodega');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar Bodega';
    }

    const modalEl = document.getElementById('modalEliminarBodega');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function ejecutarEliminarBodega() {
    const codigo = document.getElementById('del-bod-cod-input').value;
    if (!codigo) return;

    const btn = document.getElementById('btn-confirmar-eliminar-bodega');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Eliminando...';
    }

    try {
        const res = await fetch(`${API_BASE}/bodegas/${encodeURIComponent(codigo)}`, {
            method: 'DELETE'
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar Bodega';
            }
            return;
        }

        closeModal('modalEliminarBodega');
        showToast(`✅ ${result.message}`, 'success');

        await loadBodegasYProyectos();
        await loadConfig();
    } catch (err) {
        showToast(`Error al eliminar bodega: ${err.message}`, 'danger');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar Bodega';
        }
    }
}

function openModalNuevoProyecto() {
    document.getElementById('form-proyecto').reset();
    const modalEl = document.getElementById('modalNuevoProyecto');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function submitProyecto(e) {
    e.preventDefault();
    const payload = {
        id: document.getElementById('proy-id').value || null,
        nombre: document.getElementById('proy-nombre').value.trim(),
        responsable: document.getElementById('proy-responsable').value,
        estado: document.getElementById('proy-estado').value,
        observaciones: document.getElementById('proy-obs').value
    };

    try {
        const res = await fetch(`${API_BASE}/proyectos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeModal('modalNuevoProyecto');
            showToast('✅ Proyecto guardado con éxito.', 'success');
            await loadBodegasYProyectos();
            await loadConfig();
        } else {
            showToast(`⚠️ ${result.error}`, 'danger');
        }
    } catch (err) {
        showToast('Error al guardar proyecto: ' + err.message, 'danger');
    }
}

// ==============================================================
// 9. KARDEX INDIVIDUAL Y REPORTES
// ==============================================================
async function loadKardexItem(codigo) {
    if (!codigo) {
        document.getElementById('kardex-container').style.display = 'none';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/reportes/kardex/${codigo}`);
        const result = await res.json();
        if (!result.success) return;

        const { item, kardex, saldo_final } = result;
        currentKardexData = result;

        document.getElementById('kardex-item-titulo').textContent = `${item.codigo} - ${item.nombre}`;
        document.getElementById('kardex-item-subtitulo').textContent = `Categoría: ${item.categoria} | Ubicación CDS: ${item.ubicacion_cds} | Unidad: ${item.unidad_medida}`;
        document.getElementById('kardex-saldo-final').textContent = `${saldo_final} ${item.unidad_medida}`;

        const tbody = document.getElementById('table-kardex-body');
        if (kardex.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-muted">No existen movimientos registrados para este ítem.</td></tr>`;
        } else {
            tbody.innerHTML = kardex.map(m => `
                <tr>
                    <td><strong class="text-primary">${item.codigo}</strong></td>
                    <td><div class="fw-semibold text-dark">${item.nombre}</div></td>
                    <td><strong>${m.n_movimiento}</strong></td>
                    <td>${m.fecha} <small class="text-muted">${m.hora}</small></td>
                    <td><span class="badge bg-light text-dark border">${m.tipo_movimiento}</span></td>
                    <td>${m.bodega_origen || '-'}</td>
                    <td>${m.bodega_destino || '-'}</td>
                    <td>${m.responsable || m.persona_recibe_devuelve || '-'}</td>
                    <td class="text-end text-success fw-bold">${m.entrada > 0 ? `+${m.entrada}` : '-'}</td>
                    <td class="text-end text-danger fw-bold">${m.salida > 0 ? `-${m.salida}` : '-'}</td>
                    <td class="text-end text-primary fw-bold fs-6">${m.saldo_acumulado}</td>
                </tr>
            `).join('');
        }

        document.getElementById('kardex-container').style.display = 'block';
    } catch (err) {
        console.error('Error al cargar kardex:', err);
    }
}

function verKardexDirecto(codigo) {
    navigate('reportes');
    const select = document.getElementById('reporte-item-select');
    if (select) {
        select.value = codigo;
        loadKardexItem(codigo);
    }
}

// ==============================================================
// 10. BUSCADOR RÁPIDO MODAL (frmBuscarItem)
// ==============================================================
function filtrarBuscadorRapido(query) {
    const q = query.toLowerCase().trim();
    const tbody = document.getElementById('table-buscador-rapido-body');
    if (!tbody) return;

    const filtered = appState.items.filter(i => 
        String(i.codigo).includes(q) || 
        i.nombre.toLowerCase().includes(q) || 
        (i.ubicacion_cds && i.ubicacion_cds.toLowerCase().includes(q))
    ).slice(0, 50);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-3 text-muted">No se encontraron coincidencias.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(i => {
        const inv = appState.inventario.find(invItem => invItem.codigo === i.codigo);
        const stock = inv ? inv.existencia : 0;
        const estadoStock = inv ? inv.estado_stock : 'SIN EXISTENCIAS';

        return `
            <tr>
                <td><strong>${i.codigo}</strong></td>
                <td><div class="fw-semibold">${i.nombre}</div></td>
                <td><span class="badge bg-light text-secondary border">${i.categoria}</span></td>
                <td><span class="badge bg-primary bg-opacity-10 text-primary">${i.ubicacion_cds}</span></td>
                <td class="text-end fw-bold text-primary">${stock} ${i.unidad_medida}</td>
                <td class="text-center"><span class="badge bg-secondary small">${estadoStock}</span></td>
                <td class="text-center">
                    <button class="btn btn-primary btn-sm py-0 px-2" onclick="seleccionarItemDesdeBuscador(${i.codigo})">
                        Operar
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function seleccionarItemDesdeBuscador(codigo) {
    bootstrap.Modal.getInstance(document.getElementById('modalBuscarItem')).hide();
    openModalMovimiento(codigo);
}

// ==============================================================
// 11. EXPORTACIÓN NATIVA A EXCEL (.XLSX) CON TABLAS FORMATEADAS
// ==============================================================
let currentKardexData = null;

// Descargador universal compatible con Navegadores y Electron Desktop
function triggerBlobDownload(blob, filename) {
    try {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            if (a.parentNode) a.parentNode.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 3000);
    } catch (err) {
        console.error('Error en triggerBlobDownload:', err);
    }
}

// Guardar libro de Excel vía Blob binario
function saveWorkbookWithBlob(workbook, fileName) {
    try {
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        triggerBlobDownload(blob, fileName);
    } catch (err) {
        // Fallback a writeFile si existiera soporte directo
        XLSX.writeFile(workbook, fileName);
    }
}

// Helper maestro para generar y descargar archivo Excel (.xlsx) estructurado en columnas
function exportToExcelTable(data, columns, sheetName, fileName) {
    if (!data || data.length === 0) {
        showToast('No hay datos disponibles para exportar.', 'warning');
        return;
    }

    if (typeof XLSX === 'undefined') {
        showToast('La librería de exportación Excel está cargando, por favor intente nuevamente en un segundo.', 'warning');
        return;
    }

    // Estructurar filas con encabezados legibles y tipos de datos limpios
    const rows = data.map(item => {
        const rowObj = {};
        columns.forEach(col => {
            let val = item[col.key];
            if (val === undefined || val === null) val = '';
            if (col.formatter) {
                val = col.formatter(val, item);
            } else if (col.type === 'number') {
                val = (typeof val === 'number') ? val : (parseFloat(val) || 0);
            }
            rowObj[col.header] = val;
        });
        return rowObj;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Ajuste automático y estético del ancho de cada columna
    const colWidths = columns.map(col => {
        let maxLen = col.header.length;
        data.forEach(item => {
            let val = item[col.key];
            if (col.formatter) val = col.formatter(val, item);
            if (val !== undefined && val !== null) {
                const len = String(val).length;
                if (len > maxLen) maxLen = len;
            }
        });
        return { wch: Math.min(Math.max(maxLen + 4, 12), 55) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || 'Datos');
    
    const today = new Date().toISOString().split('T')[0];
    const fullFileName = `${fileName}_${today}.xlsx`;
    saveWorkbookWithBlob(workbook, fullFileName);
    showToast(`Archivo Excel exportado exitosamente: ${fullFileName}`, 'success');
}

// 1. Exportar Inventario Físico CDS
function exportInventarioExcel() {
    if (!appState.inventario || appState.inventario.length === 0) {
        showToast('No hay datos de inventario para exportar.', 'warning');
        return;
    }
    const cols = [
        { header: 'Código Ítem', key: 'codigo', formatter: (v, r) => r.codigo || r.codigo_item, type: 'number' },
        { header: 'Nombre del Ítem / Material', key: 'nombre' },
        { header: 'Categoría', key: 'categoria' },
        { header: 'Subcategoría', key: 'subcategoria' },
        { header: 'Unidad de Medida', key: 'unidad_medida' },
        { header: 'Ubicación CDS', key: 'ubicacion_cds' },
        { header: 'Entradas (+)', key: 'entradas', type: 'number' },
        { header: 'Devoluciones (+)', key: 'devoluciones', type: 'number' },
        { header: 'Entregas Recibidas (+)', key: 'entregas_recibidas', type: 'number' },
        { header: 'Ajustes Positivos (+)', key: 'ajustes_pos', type: 'number' },
        { header: 'Entregas Enviadas (-)', key: 'entregas_enviadas', type: 'number' },
        { header: 'Bajas / Disp. Final (-)', key: 'disp_final', type: 'number' },
        { header: 'Ajustes Negativos (-)', key: 'ajustes_neg', type: 'number' },
        { header: 'Existencia Actual CDS', key: 'existencia', type: 'number' },
        { header: 'Stock Mínimo', key: 'stock_minimo', type: 'number' },
        { header: 'Estado del Stock', key: 'estado_stock' },
        { header: 'Aplica Vencimiento', key: 'aplica_vencimiento', formatter: v => v ? 'SÍ' : 'NO' }
    ];
    exportToExcelTable(appState.inventario, cols, 'Inventario CDS', 'Balance_Inventario_CDS');
}

// 2. Exportar Historial de Movimientos
function exportMovimientosExcel() {
    if (!appState.movimientos || appState.movimientos.length === 0) {
        showToast('No hay movimientos registrados para exportar.', 'warning');
        return;
    }
    const cols = [
        { header: 'Código Ítem', key: 'codigo_item', formatter: (v, r) => r.codigo_item || r.codigo, type: 'number' },
        { header: 'Nombre del Ítem', key: 'nombre_item' },
        { header: 'N° Movimiento', key: 'n_movimiento' },
        { header: 'Fecha', key: 'fecha' },
        { header: 'Hora', key: 'hora' },
        { header: 'Tipo Movimiento', key: 'tipo_movimiento' },
        { header: 'Cantidad', key: 'cantidad', type: 'number' },
        { header: 'Unidad', key: 'unidad' },
        { header: 'Bodega Origen', key: 'bodega_origen', formatter: v => v || '-' },
        { header: 'Bodega Destino', key: 'bodega_destino', formatter: v => v || '-' },
        { header: 'Causal / Condición', key: 'causal_condicion', formatter: v => v || '-' },
        { header: 'Ubicación CDS', key: 'ubicacion_cds', formatter: v => v || '-' },
        { header: 'Proyecto Destino', key: 'proyecto_destino', formatter: v => v || '-' },
        { header: 'Responsable', key: 'responsable', formatter: v => v || '-' },
        { header: 'Persona Recibe / Devuelve', key: 'persona_recibe_devuelve', formatter: v => v || '-' },
        { header: 'Documento Referencia', key: 'documento_referencia', formatter: v => v || '-' },
        { header: 'Vencimiento Lote', key: 'fecha_vencimiento_lote', formatter: v => v || '-' },
        { header: 'Observaciones', key: 'observaciones', formatter: v => v || '-' }
    ];
    exportToExcelTable(appState.movimientos, cols, 'Movimientos', 'Libro_Diario_Movimientos');
}

// 3. Exportar Catálogo Maestro
function exportCatalogoExcel() {
    if (!appState.items || appState.items.length === 0) {
        showToast('No hay ítems en el catálogo para exportar.', 'warning');
        return;
    }
    const cols = [
        { header: 'Código Ítem', key: 'codigo', formatter: (v, r) => r.codigo || r.codigo_item, type: 'number' },
        { header: 'Nombre del Ítem', key: 'nombre' },
        { header: 'Categoría', key: 'categoria' },
        { header: 'Subcategoría', key: 'subcategoria' },
        { header: 'Unidad de Medida', key: 'unidad_medida' },
        { header: 'Marca', key: 'marca' },
        { header: 'Referencia', key: 'referencia' },
        { header: 'Ubicación CDS', key: 'ubicacion_cds' },
        { header: 'Aplica Vencimiento', key: 'aplica_vencimiento', formatter: v => v ? 'SÍ' : 'NO' },
        { header: 'Stock Mínimo', key: 'stock_minimo', type: 'number' },
        { header: 'Estado', key: 'estado' },
        { header: 'Fecha Registro', key: 'fecha_registro' },
        { header: 'Observaciones', key: 'observaciones' }
    ];
    exportToExcelTable(appState.items, cols, 'Catálogo Maestro', 'Catalogo_Maestro_Items');
}

// 4. Exportar Lotes y Vencimientos
function exportVencimientosExcel() {
    if (!appState.vencimientos || appState.vencimientos.length === 0) {
        showToast('No hay lotes de vencimiento registrados.', 'warning');
        return;
    }
    const cols = [
        { header: 'Código Ítem', key: 'codigo_item', formatter: (v, r) => r.codigo_item || r.codigo, type: 'number' },
        { header: 'Nombre del Ítem', key: 'nombre_item' },
        { header: 'Bodega', key: 'bodega' },
        { header: 'Ubicación CDS', key: 'ubicacion_cds' },
        { header: 'Fecha Ingreso', key: 'fecha_ingreso' },
        { header: 'Fecha Vencimiento', key: 'fecha_vencimiento' },
        { header: 'Días Restantes', key: 'dias_restantes', type: 'number' },
        { header: 'Cant. Inicial', key: 'cant_inicial', type: 'number' },
        { header: 'Cant. Disponible', key: 'cant_disponible', type: 'number' },
        { header: 'Unidad', key: 'unidad_medida' },
        { header: 'Estado Caducidad', key: 'estado_actualizado' },
        { header: 'N° Movimiento Origen', key: 'n_movimiento_origen' },
        { header: 'Observaciones', key: 'observaciones' }
    ];
    exportToExcelTable(appState.vencimientos, cols, 'Control Vencimientos', 'Control_Lotes_Vencimientos');
}

// 5. Exportar Kardex del Ítem Seleccionado
function exportKardexActualExcel() {
    if (!currentKardexData || !currentKardexData.kardex || currentKardexData.kardex.length === 0) {
        showToast('Seleccione un ítem con movimientos en el Kardex para exportar.', 'warning');
        return;
    }
    const { item, kardex, saldo_final } = currentKardexData;
    const cols = [
        { header: 'Código Ítem', key: 'codigo_item', formatter: () => item.codigo, type: 'number' },
        { header: 'Nombre del Ítem', key: 'nombre_item', formatter: () => item.nombre },
        { header: 'Categoría', key: 'categoria', formatter: () => item.categoria },
        { header: 'Ubicación CDS', key: 'ubicacion_cds', formatter: () => item.ubicacion_cds },
        { header: 'N° Movimiento', key: 'n_movimiento' },
        { header: 'Fecha', key: 'fecha' },
        { header: 'Hora', key: 'hora' },
        { header: 'Tipo Movimiento', key: 'tipo_movimiento' },
        { header: 'Bodega Origen', key: 'bodega_origen', formatter: v => v || '-' },
        { header: 'Bodega Destino', key: 'bodega_destino', formatter: v => v || '-' },
        { header: 'Responsable / Recibe', key: 'responsable', formatter: (v, r) => r.responsable || r.persona_recibe_devuelve || '-' },
        { header: 'Causal / Proyecto', key: 'causal_condicion', formatter: (v, r) => r.causal_condicion || r.proyecto_destino || '-' },
        { header: 'Doc. Referencia', key: 'documento_referencia', formatter: v => v || '-' },
        { header: 'Entrada (+)', key: 'entrada', type: 'number' },
        { header: 'Salida (-)', key: 'salida', type: 'number' },
        { header: 'Saldo Físico Acumulado', key: 'saldo_acumulado', type: 'number' },
        { header: 'Unidad de Medida', key: 'unidad', formatter: () => item.unidad_medida }
    ];
    exportToExcelTable(kardex, cols, `Kardex ${item.codigo}`, `Kardex_Item_${item.codigo}_${item.nombre.replace(/[^a-zA-Z0-9]/g, '_')}`);
}

// 6. Reportes Especiales: Stock Crítico / Bajo
function exportReporteStockBajoExcel() {
    if (!appState.inventario || appState.inventario.length === 0) {
        showToast('No hay datos de inventario cargados.', 'warning');
        return;
    }
    const itemsCriticos = appState.inventario.filter(i => 
        i.estado_stock === 'STOCK BAJO' || 
        i.estado_stock === 'SIN EXISTENCIAS' || 
        i.estado_stock === 'ERROR: SOBREGIRO' ||
        i.existencia <= i.stock_minimo
    );

    if (itemsCriticos.length === 0) {
        showToast('¡Excelente! No hay ítems en condición crítica o bajo stock.', 'info');
        return;
    }

    const cols = [
        { header: 'Código Ítem', key: 'codigo', formatter: (v, r) => r.codigo || r.codigo_item, type: 'number' },
        { header: 'Nombre del Ítem / Material', key: 'nombre' },
        { header: 'Categoría', key: 'categoria' },
        { header: 'Ubicación CDS', key: 'ubicacion_cds' },
        { header: 'Existencia Actual', key: 'existencia', type: 'number' },
        { header: 'Stock Mínimo Requerido', key: 'stock_minimo', type: 'number' },
        { header: 'Unidad de Medida', key: 'unidad_medida' },
        { header: 'Déficit / Faltante', key: 'deficit', formatter: (v, r) => Math.max(0, r.stock_minimo - r.existencia) },
        { header: 'Estado Alerta', key: 'estado_stock' }
    ];
    exportToExcelTable(itemsCriticos, cols, 'Stock Crítico', 'Reporte_Stock_Critico_Bajo');
}

// 7. Reportes Especiales: Vencidos y por Vencer
function exportReporteVencidosExcel() {
    if (!appState.vencimientos || appState.vencimientos.length === 0) {
        showToast('No hay lotes con vencimiento registrados.', 'warning');
        return;
    }
    const lotesAlerta = appState.vencimientos.filter(l => 
        l.estado_actualizado === '¡VENCIDO!' || 
        l.estado_actualizado === 'PROXIMO A VENCER' ||
        l.dias_restantes <= 30
    );

    const dataToExport = lotesAlerta.length > 0 ? lotesAlerta : appState.vencimientos;

    const cols = [
        { header: 'Código Ítem', key: 'codigo_item', formatter: (v, r) => r.codigo_item || r.codigo, type: 'number' },
        { header: 'Nombre del Ítem / Material', key: 'nombre_item' },
        { header: 'Bodega', key: 'bodega' },
        { header: 'Ubicación CDS', key: 'ubicacion_cds' },
        { header: 'Fecha Vencimiento', key: 'fecha_vencimiento' },
        { header: 'Días Restantes', key: 'dias_restantes', type: 'number' },
        { header: 'Cantidad Disponible', key: 'cant_disponible', type: 'number' },
        { header: 'Unidad de Medida', key: 'unidad_medida' },
        { header: 'Estado Alerta', key: 'estado_actualizado' },
        { header: 'Acción Sugerida', key: 'accion', formatter: (v, r) => r.dias_restantes <= 0 ? 'DAR DE BAJA INMEDIATA (SCRAP)' : 'PRIORIZAR SALIDA / USO OPERATIVO' }
    ];
    exportToExcelTable(dataToExport, cols, 'Alerta Vencimientos', 'Reporte_Lotes_Vencidos_Alerta');
}

// ==============================================================
// 12. GESTIÓN, COPIAS DE SEGURIDAD Y RESTAURACIÓN DE BASE DE DATOS
// ==============================================================

// 1. Descargar archivo binario SQLite .db
async function downloadDatabaseSQLite() {
    try {
        showToast('Descargando archivo de base de datos SQLite (.db)...', 'info');
        const res = await fetch(`${API_BASE}/database/download`);
        if (!res.ok) throw new Error('Error en el servidor al solicitar el archivo .db');
        const blob = await res.blob();
        const today = new Date().toISOString().split('T')[0];
        triggerBlobDownload(blob, `inventario_backup_${today}.db`);
        showToast('Base de datos SQLite (.db) descargada correctamente.', 'success');
    } catch (err) {
        showToast('Error al descargar base de datos: ' + err.message, 'danger');
    }
}

// 2. Descargar Respaldo JSON completo
async function downloadBackupJSON() {
    try {
        showToast('Generando respaldo estructurado JSON...', 'info');
        const res = await fetch(`${API_BASE}/database/export-json`);
        const result = await res.json();
        if (!result.success) {
            showToast('Error al exportar JSON: ' + (result.error || ''), 'danger');
            return;
        }

        const jsonString = JSON.stringify(result.data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
        const today = new Date().toISOString().split('T')[0];
        triggerBlobDownload(blob, `inventario_backup_completo_${today}.json`);
        showToast('Respaldo JSON descargado con éxito.', 'success');
    } catch (err) {
        showToast('Error al descargar JSON: ' + err.message, 'danger');
    }
}

// 3. Exportar Respaldo Multi-Hoja en Excel (.xlsx)
async function exportFullExcelWorkbook() {
    try {
        if (typeof XLSX === 'undefined') {
            showToast('Librería Excel cargando, por favor reintente.', 'warning');
            return;
        }

        showToast('Generando libro Excel completo multi-hoja...', 'info');
        const res = await fetch(`${API_BASE}/database/export-json`);
        const result = await res.json();
        if (!result.success || !result.data) {
            showToast('Error al obtener datos para exportar.', 'danger');
            return;
        }

        const { items, movimientos, control_vencimientos, bodegas, proyectos } = result.data;
        const workbook = XLSX.utils.book_new();

        // Hoja 1: Catálogo de Ítems
        if (items && items.length > 0) {
            const wsItems = XLSX.utils.json_to_sheet(items);
            XLSX.utils.book_append_sheet(workbook, wsItems, 'ITEMS');
        }

        // Hoja 2: Inventario Actual
        if (appState.inventario && appState.inventario.length > 0) {
            const wsInv = XLSX.utils.json_to_sheet(appState.inventario);
            XLSX.utils.book_append_sheet(workbook, wsInv, 'INVENTARIO');
        }

        // Hoja 3: Movimientos
        if (movimientos && movimientos.length > 0) {
            const wsMov = XLSX.utils.json_to_sheet(movimientos);
            XLSX.utils.book_append_sheet(workbook, wsMov, 'MOVIMIENTOS');
        }

        // Hoja 4: Control de Vencimientos
        if (control_vencimientos && control_vencimientos.length > 0) {
            const wsVenc = XLSX.utils.json_to_sheet(control_vencimientos);
            XLSX.utils.book_append_sheet(workbook, wsVenc, 'CONTROL_VENCIMIENTOS');
        }

        // Hoja 5: Bodegas
        if (bodegas && bodegas.length > 0) {
            const wsBod = XLSX.utils.json_to_sheet(bodegas);
            XLSX.utils.book_append_sheet(workbook, wsBod, 'BODEGAS');
        }

        const today = new Date().toISOString().split('T')[0];
        const fileName = `INVENTARIO_RESPALDO_COMPLETO_${today}.xlsx`;
        saveWorkbookWithBlob(workbook, fileName);
        showToast(`Libro Excel completo exportado: ${fileName}`, 'success');
    } catch (err) {
        showToast('Error al exportar libro Excel: ' + err.message, 'danger');
    }
}

// 4. Importador Masivo desde Excel (.xlsx / .xlsm / .xls)
async function handleImportExcel() {
    const fileInput = document.getElementById('import-excel-file');
    const limpiarBase = document.getElementById('check-limpiar-base').checked;

    if (!fileInput.files || fileInput.files.length === 0) {
        showToast('Por favor seleccione un archivo Excel (.xlsx o .xlsm).', 'warning');
        return;
    }

    if (limpiarBase) {
        const confirmar = confirm('⚠️ ADVERTENCIA DE SEGURIDAD:\n\nHas marcado "Reemplazar base de datos completa". Esto borrará los movimientos anteriores y cargará el inventario inicial desde este Excel.\n\n¿Deseas continuar?');
        if (!confirmar) return;
    }

    const file = fileInput.files[0];
    const btn = document.getElementById('btn-import-excel');
    const originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span> Procesando Excel...`;

    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Buscar hoja de inventario/ítems (ITEMS, Hoja2, INVENTARIO o la primera)
                let sheetName = workbook.SheetNames.find(s => ['ITEMS', 'Hoja2', 'INVENTARIO', 'Hoja1', 'Sheet1'].includes(s)) || workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                if (!rawRows || rawRows.length === 0) {
                    showToast('No se encontraron filas de datos en la hoja seleccionada.', 'warning');
                    btn.disabled = false;
                    btn.innerHTML = originalBtnText;
                    return;
                }

                // Estandarizar columnas de cada fila
                const itemsToImport = [];
                for (const r of rawRows) {
                    // Detectar código
                    let codigo = r['Codigo'] || r['Código'] || r['Codigo Ítem'] || r['Código Ítem'] || r['CODIGO'] || r['ID'] || r['Id'] || null;
                    if (!codigo) {
                        for (const k in r) {
                            if (typeof r[k] === 'number' || (typeof r[k] === 'string' && /^\d+$/.test(r[k].trim()))) {
                                codigo = r[k];
                                break;
                            }
                        }
                    }

                    if (!codigo) continue;
                    const codeNum = parseInt(codigo, 10);
                    if (isNaN(codeNum) || codeNum <= 0) continue;

                    // Detectar nombre
                    const nombre = r['Nombre'] || r['Nombre del Ítem'] || r['Item'] || r['Ítem'] || r['ITEM'] || r['Descripcion'] || r['DESCRIPCION'] || r['Ítem / Material'] || '';
                    if (!nombre) continue;

                    // Detectar cantidad
                    const cantidad = parseFloat(r['Cantidad'] || r['CANTIDAD'] || r['Stock'] || r['Existencia'] || r['Entradas'] || 0) || 0;

                    // Detectar ubicación (ESTANTERIA + NIVEL o Ubicación)
                    let ubicacion = r['Ubicacion'] || r['Ubicación'] || r['Ubicación CDS'] || r['Ubicacion (Bod. Central)'] || '';
                    if (!ubicacion && (r['ESTANTERIA'] || r['NIVEL'])) {
                        ubicacion = `${r['ESTANTERIA'] || ''}${r['NIVEL'] || ''}`.trim();
                    }
                    if (!ubicacion) ubicacion = 'A1';

                    // Detectar categoría
                    let categoria = r['Categoria'] || r['Categoría'] || '';
                    if (!categoria) {
                        const nLower = String(nombre).toLowerCase();
                        if (nLower.includes('tornillo') || nLower.includes('tuerca') || nLower.includes('abrazadera')) categoria = 'Tornilleria';
                        else if (nLower.includes('disco') || nLower.includes('cinta') || nLower.includes('sika') || nLower.includes('espuma')) categoria = 'Consumibles';
                        else if (nLower.includes('cable') || nLower.includes('alambre')) categoria = 'Cableado';
                        else if (nLower.includes('breaker') || nLower.includes('interruptor')) categoria = 'Elementos electricos';
                        else if (nLower.includes('taladro') || nLower.includes('pulidora') || nLower.includes('llave')) categoria = 'Herramientas';
                        else categoria = 'Materiales';
                    }

                    // Unidad
                    let unidad = r['Unidad'] || r['Unidad de Medida'] || 'Unidad';

                    // Aplica vencimiento
                    const nL = String(nombre).toLowerCase();
                    const aplicaVenc = (r['Vencimiento'] === 'APLICA' || r['aplica_vencimiento'] == 1 || nL.includes('sika') || nL.includes('espuma') || nL.includes('silicona')) ? 1 : 0;

                    itemsToImport.push({
                        codigo: codeNum,
                        nombre: String(nombre).trim(),
                        categoria,
                        unidad_medida: unidad,
                        ubicacion_cds: String(ubicacion).trim().toUpperCase(),
                        cantidad,
                        aplica_vencimiento: aplicaVenc
                    });
                }

                if (itemsToImport.length === 0) {
                    showToast('No se pudieron extraer ítems válidos del archivo.', 'warning');
                    btn.disabled = false;
                    btn.innerHTML = originalBtnText;
                    return;
                }

                // Enviar al backend
                const resp = await fetch(`${API_BASE}/database/import-excel-items`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        items: itemsToImport,
                        limpiarBasePrevia: limpiarBase
                    })
                });

                const resJson = await resp.json();
                if (resJson.success) {
                    showToast(resJson.message, 'success');
                    fileInput.value = '';
                    setTimeout(() => {
                        window.location.reload();
                    }, 1200);
                } else {
                    showToast('Error en importación: ' + resJson.error, 'danger');
                }
            } catch (errParsing) {
                showToast('Error al interpretar archivo Excel: ' + errParsing.message, 'danger');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalBtnText;
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (err) {
        showToast('Error al leer el archivo: ' + err.message, 'danger');
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    }
}

// 5. Restaurar Copia JSON
async function handleRestoreJSON() {
    const fileInput = document.getElementById('restore-json-file');
    if (!fileInput.files || fileInput.files.length === 0) {
        showToast('Seleccione un archivo JSON de respaldo válido.', 'warning');
        return;
    }

    const confirmar = confirm('⚠️ ADVERTENCIA:\n\nEsta acción reemplazará toda la información actual de la base de datos por la copia de seguridad seleccionada.\n\n¿Deseas continuar?');
    if (!confirmar) return;

    const file = fileInput.files[0];
    const btn = document.getElementById('btn-restore-json');
    const originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span> Restaurando...`;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        const resp = await fetch(`${API_BASE}/database/restore-json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: parsed })
        });

        const resJson = await resp.json();
        if (resJson.success) {
            showToast(resJson.message, 'success');
            fileInput.value = '';
            setTimeout(() => {
                window.location.reload();
            }, 1200);
        } else {
            showToast('Error al restaurar: ' + resJson.error, 'danger');
        }
    } catch (err) {
        showToast('Error al procesar archivo JSON: ' + err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    }
}

// 6. Subir y Restaurar archivo binario SQLite (.db)
async function handleRestoreSQLite() {
    const fileInput = document.getElementById('restore-sqlite-file');
    if (!fileInput.files || fileInput.files.length === 0) {
        showToast('Seleccione un archivo de base de datos SQLite (.db válido).', 'warning');
        return;
    }

    const confirmar = confirm('⚠️ ADVERTENCIA CRÍTICA:\n\nVas a reemplazar la base de datos completa con el archivo SQLite (.db) seleccionado.\n\n¿Estás seguro de que deseas continuar?');
    if (!confirmar) return;

    const file = fileInput.files[0];
    const btn = document.getElementById('btn-restore-sqlite');
    const originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span> Cargando Base SQLite...`;

    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                // Convert ArrayBuffer to base64
                const bytes = new Uint8Array(e.target.result);
                let binary = '';
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64Data = window.btoa(binary);

                const resp = await fetch(`${API_BASE}/database/restore-binary`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ base64Data })
                });

                const resJson = await resp.json();
                if (resJson.success) {
                    showToast(resJson.message, 'success');
                    fileInput.value = '';
                    setTimeout(() => {
                        window.location.reload();
                    }, 1200);
                } else {
                    showToast('Error al restaurar base SQLite: ' + resJson.error, 'danger');
                }
            } catch (errInner) {
                showToast('Error al enviar archivo SQLite: ' + errInner.message, 'danger');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalBtnText;
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (err) {
        showToast('Error al leer el archivo: ' + err.message, 'danger');
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    }
}

// 7. Descargar Plantilla Excel oficial para cargue
function downloadExcelTemplate() {
    try {
        if (typeof XLSX === 'undefined') {
            showToast('Librería Excel no lista aún.', 'warning');
            return;
        }

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

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(templateData);

        ws['!cols'] = [
            { wch: 12 },
            { wch: 45 },
            { wch: 12 },
            { wch: 14 },
            { wch: 10 },
            { wch: 20 },
            { wch: 12 },
            { wch: 15 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'ITEMS');
        saveWorkbookWithBlob(wb, 'PLANTILLA_CARGUE_INVENTARIO.xlsx');
        showToast('Plantilla Excel descargada exitosamente.', 'success');
    } catch (err) {
        showToast('Error al generar plantilla: ' + err.message, 'danger');
    }
}




