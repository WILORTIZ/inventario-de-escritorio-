// ==============================================================
// INVENTARIO - SISTEMA EMPRESARIAL DE GESTIÓN FÍSICA Y VENCIMIENTOS
// LÓGICA DE CLIENTE (SPA, REST API, REGLAS DE NEGOCIO Y FORMULARIOS)
// ==============================================================

const API_BASE = '/api';

// Helper seguro para consumir la API y evitar caídas por respuestas no JSON o versiones antiguas
async function safeFetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const text = await res.text();
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
            throw new Error('La versión en ejecución del servidor se encuentra desactualizada. Cierra la aplicación e inicia la nueva versión actualizada.');
        }
        throw new Error(`Respuesta no válida del servidor (${res.status}): ${text.substring(0, 100)}`);
    }
    return await res.json();
}

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
    currentUser: JSON.parse(localStorage.getItem('inventario_user') || 'null'),
    currentView: 'inicio',
    currentSede: 'Sede Suroriental',
    currentInventario: 'CDS',
    items: [],
    inventario: [],
    movimientos: [],
    vencimientos: [],
    bodegas: [],
    proyectos: [],
    config: {
        sedes: [],
        tipos_inventario: [],
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
    checkAuth();
    await loadConfig();
    actualizarBadgesContexto();
    await recargarDatosContexto();
    await loadBodegasYProyectos();
    await loadUsuarios();
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

    // Escuchar cambios de hash si aplica
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.replace('#', '');
        if (hash) navigate(hash);
    });
}

// Control del Acordeón / Submenús Desplegables en Sidebar
function toggleSubmenu(invId) {
    const header = document.getElementById(`header-submenu-${invId}`);
    const container = document.getElementById(`submenu-${invId}`);
    if (!container || !header) return;

    const isOpen = container.classList.contains('open');
    if (isOpen) {
        container.classList.remove('open');
        header.classList.remove('open');
    } else {
        container.classList.add('open');
        header.classList.add('open');
    }
}

function asegurarSubmenuAbierto(invId) {
    const header = document.getElementById(`header-submenu-${invId}`);
    const container = document.getElementById(`submenu-${invId}`);
    if (container && header) {
        container.classList.add('open');
        header.classList.add('open');
    }
}

// ==============================================================
// 1.1. AUTENTICACIÓN, SESIONES, ROLES Y CONTROL DE INACTIVIDAD
// ==============================================================
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutos de inactividad
let lastActivityThrottle = 0;

// Helper global para validación granular de permisos
function tienePermiso(codigoPermiso) {
    if (!appState.currentUser) return false;
    if (appState.currentUser.rol === 'ADMINISTRADOR') return true;
    
    let extras = appState.currentUser.permisos_adicionales;
    if (typeof extras === 'string') {
        try {
            extras = JSON.parse(extras);
        } catch (e) {
            extras = [];
        }
    }
    if (!Array.isArray(extras)) extras = [];
    return extras.includes(codigoPermiso);
}

function getNombreUsuarioActual() {
    const user = appState.currentUser;
    if (!user) return 'Administrador CDS';
    const nombreCompleto = `${user.nombre || ''} ${user.apellido || ''}`.trim();
    if (nombreCompleto) return nombreCompleto;
    if (user.username) return user.username;
    if (user.cedula) return user.cedula;
    return 'Administrador CDS';
}

function registrarActividadUsuario() {
    const now = Date.now();
    // Throttle para no saturar localStorage en cada milisegundo de movimiento de mouse
    if (now - lastActivityThrottle > 2000) {
        lastActivityThrottle = now;
        localStorage.setItem('inventario_last_activity', now.toString());
    }
}

function iniciarDetectorInactividad() {
    // Registrar actividad inicial
    if (!localStorage.getItem('inventario_last_activity')) {
        localStorage.setItem('inventario_last_activity', Date.now().toString());
    }

    // Escuchar eventos de interacción del usuario
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(eventType => {
        window.addEventListener(eventType, registrarActividadUsuario, { passive: true });
    });

    // Verificación periódica cada 10 segundos
    setInterval(() => {
        if (!appState.currentUser) return;

        const lastActivityStr = localStorage.getItem('inventario_last_activity');
        const lastActivity = lastActivityStr ? parseInt(lastActivityStr, 10) : Date.now();
        const diff = Date.now() - lastActivity;

        if (diff >= INACTIVITY_LIMIT_MS) {
            cerrarSesionPorInactividad();
        }
    }, 10000);
}

function cerrarSesionPorInactividad() {
    appState.currentUser = null;
    localStorage.removeItem('inventario_user');
    localStorage.removeItem('inventario_last_activity');

    // Resetear vistas activas y hash a inicio para proteger vistas administrativas
    appState.currentView = 'inicio';
    try { window.location.hash = 'inicio'; } catch(e) {}
    document.querySelectorAll('.app-view').forEach(view => view.style.display = 'none');
    const viewInicio = document.getElementById('view-inicio');
    if (viewInicio) viewInicio.style.display = 'block';

    const adminSection = document.getElementById('sidebar-section-admin');
    if (adminSection) adminSection.style.display = 'none';

    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.style.display = 'flex';

    const alertBox = document.getElementById('login-alert');
    if (alertBox) {
        alertBox.className = 'alert alert-warning py-2 small fw-semibold text-dark';
        alertBox.innerHTML = '<i class="bi bi-clock-history me-2 fs-6"></i>Su sesión ha expirado por inactividad (30 minutos sin movimiento). Por favor, inicie sesión nuevamente.';
        alertBox.style.display = 'block';
    }

    showToast('⚠️ Sesión cerrada por inactividad (30 min).', 'warning');
}

function checkAuth() {
    iniciarDetectorInactividad();
    const user = appState.currentUser;
    const loginScreen = document.getElementById('login-screen');
    if (!user) {
        if (loginScreen) loginScreen.style.display = 'flex';
        return false;
    }

    // Comprobar si ya excedió el tiempo al cargar
    const lastActivityStr = localStorage.getItem('inventario_last_activity');
    if (lastActivityStr) {
        const lastActivity = parseInt(lastActivityStr, 10);
        if (Date.now() - lastActivity >= INACTIVITY_LIMIT_MS) {
            cerrarSesionPorInactividad();
            return false;
        }
    }

    // Regla de Permisos: Control Multi-Sedes vs Sede Asignada
    const puedeMultiSede = tienePermiso('ACCESO_MULTI_SEDE');
    const globalSedeSelect = document.getElementById('global-sede-select');

    if (!puedeMultiSede) {
        const userSede = user.sede || 'Sede Suroriental';
        appState.currentSede = userSede;
        if (globalSedeSelect) {
            globalSedeSelect.value = userSede;
            globalSedeSelect.disabled = true;
            globalSedeSelect.title = `🔒 Sede asignada: ${userSede} (Requiere permiso de Ver Sedes)`;
        }
    } else {
        if (globalSedeSelect) {
            globalSedeSelect.disabled = false;
            globalSedeSelect.title = 'Seleccionar Sede Operativa';
        }
    }

    // Proteger vistas administrativas si el usuario actual no es Administrador
    const isSuperAdmin = (user.rol === 'ADMINISTRADOR') || (user.cedula === '1130683079') || (user.cedula === '123456') || (user.cedula === 'admin');
    if (!isSuperAdmin) {
        const hash = (window.location.hash || '').replace('#', '');
        if (hash === 'usuarios' || hash === 'database' || appState.currentView === 'usuarios' || appState.currentView === 'database') {
            appState.currentView = 'inicio';
            try { window.location.hash = 'inicio'; } catch(e) {}
            document.querySelectorAll('.app-view').forEach(v => v.style.display = 'none');
            const vInicio = document.getElementById('view-inicio');
            if (vInicio) vInicio.style.display = 'block';
        }
    }

    localStorage.setItem('inventario_last_activity', Date.now().toString());
    if (loginScreen) loginScreen.style.display = 'none';
    actualizarWidgetUsuario(user);
    return true;
}

function actualizarWidgetUsuario(user) {
    const avatar = document.getElementById('user-avatar-text');
    const name = document.getElementById('nav-user-name');
    const rol = document.getElementById('nav-user-rol');
    const fullname = document.getElementById('dropdown-user-fullname');
    const username = document.getElementById('dropdown-user-username');

    const initial = user.nombre ? user.nombre.charAt(0).toUpperCase() : 'A';
    const nombreCompleto = `${user.nombre} ${user.apellido || ''}`.trim();
    const isSuperAdmin = (user.rol === 'ADMINISTRADOR') || (user.cedula === '1130683079') || (user.cedula === '123456') || (user.cedula === 'admin');
    
    let rolLabel = 'Usuario (Solo Ingreso)';
    if (isSuperAdmin) {
        rolLabel = 'Administrador del Sistema';
    } else if (user.rol === 'ADMINISTRADOR DE SEDE') {
        rolLabel = 'Administrador de Sede';
    } else if (user.rol === 'USUARIO') {
        rolLabel = 'Usuario (Solo Ingreso)';
    } else {
        rolLabel = user.rol || 'Usuario';
    }

    if (avatar) avatar.textContent = initial;
    if (name) name.textContent = nombreCompleto;
    if (rol) rol.textContent = rolLabel;
    if (fullname) fullname.textContent = nombreCompleto;
    if (username) username.textContent = user.cedula ? `C.C. ${user.cedula}` : `@${user.username}`;

    // Panel de Administración visible exclusivamente para el Super Administrador General
    const adminSection = document.getElementById('sidebar-section-admin');
    if (adminSection) {
        adminSection.style.display = isSuperAdmin ? 'block' : 'none';
    }

    // Si el usuario no es Super Administrador, asegurar que las vistas administrativas no estén visibles en el DOM
    if (!isSuperAdmin) {
        const viewUsr = document.getElementById('view-usuarios');
        const viewDb = document.getElementById('view-database');
        if (viewUsr && viewUsr.style.display === 'block') {
            navigate('inicio');
        }
        if (viewDb && viewDb.style.display === 'block') {
            navigate('inicio');
        }
    }
}

async function ejecutarLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const alertBox = document.getElementById('login-alert');
    const submitBtn = document.getElementById('btn-login-submit');

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!username || !password) {
        if (alertBox) {
            alertBox.className = 'alert alert-danger py-2 small';
            alertBox.textContent = 'Ingrese su número de cédula y contraseña.';
            alertBox.style.display = 'block';
        }
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Verificando...';
    }

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await res.json();

        if (result.success && result.user) {
            appState.currentUser = result.user;
            localStorage.setItem('inventario_user', JSON.stringify(result.user));
            localStorage.setItem('inventario_last_activity', Date.now().toString());

            // Regla de Permisos Multi-Sedes
            const puedeMultiSede = (result.user.rol === 'ADMINISTRADOR') || 
                (Array.isArray(result.user.permisos_adicionales) && result.user.permisos_adicionales.includes('ACCESO_MULTI_SEDE'));

            const globalSedeSelect = document.getElementById('global-sede-select');
            if (!puedeMultiSede) {
                const userSede = result.user.sede || 'Sede Suroriental';
                appState.currentSede = userSede;
                if (globalSedeSelect) {
                    globalSedeSelect.value = userSede;
                    globalSedeSelect.disabled = true;
                    globalSedeSelect.title = `🔒 Sede asignada: ${userSede} (Requiere permiso de Ver Sedes)`;
                }
            } else {
                if (globalSedeSelect) {
                    globalSedeSelect.disabled = false;
                    globalSedeSelect.title = 'Seleccionar Sede Operativa';
                }
            }
            
            if (alertBox) {
                alertBox.style.display = 'none';
                alertBox.className = 'alert alert-danger py-2 small';
            }
            
            const loginScreen = document.getElementById('login-screen');
            if (loginScreen) loginScreen.style.display = 'none';

            // Siempre restablecer a la vista de Inicio para evitar que un usuario no-admin herede vistas del admin previo
            navigate('inicio');
            try { window.location.hash = 'inicio'; } catch(e) {}

            actualizarWidgetUsuario(result.user);
            actualizarBadgesContexto();
            await recargarDatosContexto();
            showToast(`👋 ¡Bienvenido de nuevo, ${result.user.nombre}!`, 'success');
        } else {
            if (alertBox) {
                alertBox.className = 'alert alert-danger py-2 small';
                alertBox.textContent = result.error || 'Credenciales no válidas.';
                alertBox.style.display = 'block';
            }
        }
    } catch (err) {
        if (alertBox) {
            alertBox.className = 'alert alert-danger py-2 small';
            alertBox.textContent = 'No fue posible conectar con el servidor.';
            alertBox.style.display = 'block';
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-door-open-fill me-2"></i><span>Iniciar Sesión</span>';
        }
    }
}

function cerrarSesion() {
    appState.currentUser = null;
    localStorage.removeItem('inventario_user');
    localStorage.removeItem('inventario_last_activity');

    // 1. Resetear vistas activas y hash a inicio
    appState.currentView = 'inicio';
    try { window.location.hash = 'inicio'; } catch(e) {}
    document.querySelectorAll('.app-view').forEach(view => view.style.display = 'none');
    const viewInicio = document.getElementById('view-inicio');
    if (viewInicio) viewInicio.style.display = 'block';

    // 2. Ocultar sección de administración del sidebar
    const adminSection = document.getElementById('sidebar-section-admin');
    if (adminSection) {
        adminSection.style.display = 'none';
    }

    // 3. Limpiar formularios y alertas de login
    const loginUsername = document.getElementById('login-username');
    const loginPassword = document.getElementById('login-password');
    if (loginPassword) loginPassword.value = '';

    const alertBox = document.getElementById('login-alert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.className = 'alert alert-danger py-2 small';
    }

    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.style.display = 'flex';

    showToast('🔒 Sesión cerrada exitosamente.', 'info');
}

// ==============================================================
// 1.2. ADMINISTRACIÓN DE USUARIOS Y PERMISOS (PANEL DE CONTROL)
// ==============================================================
let listaUsuariosCache = [];

async function loadUsuarios() {
    try {
        const res = await fetch(`${API_BASE}/usuarios`);
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
            listaUsuariosCache = result.data;
            renderTablaUsuarios(listaUsuariosCache);
            renderSelectorUsuariosPermisos(listaUsuariosCache);
        }
    } catch (e) {
        console.error('Error cargando usuarios:', e);
    }
}

function renderTablaUsuarios(usuarios) {
    const tbody = document.getElementById('tabla-usuarios-body');
    if (!tbody) return;

    if (!usuarios || usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No hay usuarios registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = usuarios.map(u => {
        let rolBadge = `<span class="badge bg-secondary px-2 py-1"><i class="bi bi-person me-1"></i>Usuario</span>`;
        if (u.rol === 'ADMINISTRADOR') {
            rolBadge = `<span class="badge bg-primary px-2 py-1"><i class="bi bi-shield-lock-fill me-1"></i>Administrador General</span>`;
        } else if (u.rol === 'ADMINISTRADOR DE SEDE') {
            rolBadge = `<span class="badge bg-info text-dark px-2 py-1"><i class="bi bi-building me-1"></i>Admin. Sede</span>`;
        }
        
        const estadoBadge = u.estado === 'Activo'
            ? `<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">Activo</span>`
            : `<span class="badge bg-secondary px-2 py-1">Inactivo</span>`;

        const nombreCompleto = `${u.nombre} ${u.apellido || ''}`.trim();
        const cedulaStr = u.cedula || u.username;

        return `
            <tr>
                <td><strong class="text-dark"><i class="bi bi-person-vcard me-1 text-primary"></i>${cedulaStr}</strong></td>
                <td class="fw-semibold">${nombreCompleto}</td>
                <td class="text-muted small">${u.correo || '<em>Sin correo</em>'}</td>
                <td><span class="badge bg-light text-dark border"><i class="bi bi-geo-alt-fill text-danger me-1"></i>${u.sede || 'Sede Suroriental'}</span></td>
                <td>${rolBadge}</td>
                <td>${estadoBadge}</td>
                <td class="text-center">
                    <button class="btn btn-outline-primary btn-sm px-2 py-1 me-1 shadow-sm" title="Editar Usuario" onclick="abrirModalEditarUsuario(${u.id})">
                        <i class="bi bi-pencil-square"></i>
                    </button>
                    <button class="btn btn-outline-success btn-sm px-2 py-1 shadow-sm" title="Configurar Permisos" onclick="irAPestañaPermisosUsuario(${u.id})">
                        <i class="bi bi-key-fill"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filtrarListaUsuarios(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderTablaUsuarios(listaUsuariosCache);
        return;
    }
    const filtrados = listaUsuariosCache.filter(u => 
        (u.cedula && u.cedula.toLowerCase().includes(q)) ||
        (u.nombre && u.nombre.toLowerCase().includes(q)) ||
        (u.apellido && u.apellido.toLowerCase().includes(q)) ||
        (u.correo && u.correo.toLowerCase().includes(q)) ||
        (u.sede && u.sede.toLowerCase().includes(q)) ||
        (u.rol && u.rol.toLowerCase().includes(q))
    );
    renderTablaUsuarios(filtrados);
}

function abrirModalNuevoUsuario() {
    const form = document.getElementById('form-usuario');
    if (form) form.reset();
    document.getElementById('usr-id').value = '';
    
    // Poblar sedes disponibles
    const sedesList = (appState.sedes && appState.sedes.length > 0) ? appState.sedes.map(s => s.nombre) : ['Sede Suroriental', 'Sede Medellín'];
    fillSelect('usr-sede', sedesList, false);

    const cedulaInput = document.getElementById('usr-cedula');
    if (cedulaInput) {
        cedulaInput.removeAttribute('readonly');
        cedulaInput.disabled = false;
        cedulaInput.classList.remove('bg-light');
    }
    
    document.getElementById('modalUsuarioTitle').innerHTML = '<i class="bi bi-person-plus-fill text-info me-2"></i>Registrar Nuevo Usuario';
    document.getElementById('usr-password-label').innerHTML = 'Contraseña <span class="text-danger">*</span>';
    document.getElementById('usr-password').required = true;
    document.getElementById('usr-cedula-help').innerHTML = '<i class="bi bi-info-circle me-1"></i>La cédula será el usuario para iniciar sesión y no podrá modificarse una vez creada.';

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalUsuario'));
    modal.show();
}

function abrirModalEditarUsuario(id) {
    const user = listaUsuariosCache.find(u => u.id === id);
    if (!user) return;

    document.getElementById('usr-id').value = user.id;
    
    // Poblar sedes disponibles
    const sedesList = (appState.sedes && appState.sedes.length > 0) ? appState.sedes.map(s => s.nombre) : ['Sede Suroriental', 'Sede Medellín'];
    fillSelect('usr-sede', sedesList, false);

    // Cédula estrictamente inmutable
    const cedulaInput = document.getElementById('usr-cedula');
    if (cedulaInput) {
        cedulaInput.value = user.cedula || user.username;
        cedulaInput.setAttribute('readonly', 'true');
        cedulaInput.disabled = false;
        cedulaInput.classList.add('bg-light');
    }

    document.getElementById('usr-nombre').value = user.nombre || '';
    document.getElementById('usr-apellido').value = user.apellido || '';
    document.getElementById('usr-correo').value = user.correo || '';
    document.getElementById('usr-sede').value = user.sede || 'Sede Suroriental';
    document.getElementById('usr-rol').value = user.rol || 'ADMINISTRADOR DE SEDE';
    document.getElementById('usr-estado').value = user.estado || 'Activo';
    
    document.getElementById('usr-password').value = '';
    document.getElementById('usr-password').required = false;
    document.getElementById('usr-password-label').innerHTML = 'Nueva Contraseña (Opcional - Dejar vacío para conservar la actual)';
    document.getElementById('usr-cedula-help').innerHTML = '<span class="text-warning fw-semibold"><i class="bi bi-lock-fill me-1"></i>El número de cédula es inmutable y no se puede modificar.</span>';
    document.getElementById('modalUsuarioTitle').innerHTML = `<i class="bi bi-person-gear text-warning me-2"></i>Editar Usuario: ${user.nombre} (${user.cedula})`;

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalUsuario'));
    modal.show();
}

async function submitFormUsuario(e) {
    e.preventDefault();
    const id = document.getElementById('usr-id').value;
    const cedula = document.getElementById('usr-cedula').value.trim();
    const nombre = document.getElementById('usr-nombre').value.trim();
    const apellido = document.getElementById('usr-apellido').value.trim();
    const correo = document.getElementById('usr-correo').value.trim();
    const sede = document.getElementById('usr-sede').value;
    const rol = document.getElementById('usr-rol').value;
    const estado = document.getElementById('usr-estado').value;
    const password = document.getElementById('usr-password').value;

    const btn = document.getElementById('btn-guardar-usuario');
    if (btn) btn.disabled = true;

    try {
        if (id) {
            // Edición
            const payload = { nombre, apellido, correo, sede, rol, estado };
            if (password && password.trim().length > 0) payload.password = password;

            const res = await fetch(`${API_BASE}/usuarios/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.success) {
                showToast(`✅ Usuario '${nombre}' actualizado correctamente.`);
                closeModal('modalUsuario');
                await loadUsuarios();
            } else {
                showToast(result.error || 'Error actualizando usuario.', 'danger');
            }
        } else {
            // Creación
            if (!password) {
                showToast('Debe asignar una contraseña al nuevo usuario.', 'warning');
                return;
            }

            const payload = { cedula, nombre, apellido, correo, sede, rol, password, permisos_adicionales: [] };
            const res = await fetch(`${API_BASE}/usuarios`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.success) {
                showToast(`🎉 Usuario '${nombre}' con cédula ${cedula} creado exitosamente.`);
                closeModal('modalUsuario');
                await loadUsuarios();
            } else {
                showToast(result.error || 'Error creando usuario.', 'danger');
            }
        }
    } catch (err) {
        showToast('Error de conexión con el servidor.', 'danger');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function renderSelectorUsuariosPermisos(usuarios) {
    const select = document.getElementById('permisos-select-usuario');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Seleccionar Usuario --</option>' + usuarios.map(u => 
        `<option value="${u.id}">${u.nombre} ${u.apellido || ''} (C.C. ${u.cedula || u.username}) - [${u.rol}]</option>`
    ).join('');

    if (currentVal) select.value = currentVal;
}

function irAPestañaPermisosUsuario(id) {
    const tabBtn = document.getElementById('tab-btn-permisos');
    if (tabBtn) {
        const triggerEl = bootstrap.Tab.getOrCreateInstance(tabBtn);
        triggerEl.show();
    }
    const select = document.getElementById('permisos-select-usuario');
    if (select) {
        select.value = id;
        cargarPermisosUsuarioSeleccionado(id);
    }
}

function cargarPermisosUsuarioSeleccionado(id) {
    const summary = document.getElementById('permisos-user-summary');
    const btnGuardar = document.getElementById('btn-guardar-permisos-extra');
    const checks = document.querySelectorAll('.check-perm-extra');

    checks.forEach(c => c.checked = false);

    if (!id) {
        if (summary) summary.style.display = 'none';
        if (btnGuardar) btnGuardar.disabled = true;
        return;
    }

    const user = listaUsuariosCache.find(u => String(u.id) === String(id));
    if (!user) return;

    if (summary) {
        summary.style.display = 'block';
        document.getElementById('perm-user-nombre').textContent = `${user.nombre} ${user.apellido || ''} (C.C. ${user.cedula || user.username})`;
        document.getElementById('perm-user-rol').textContent = `Rol: ${user.rol}`;
        document.getElementById('perm-user-sede').textContent = `Sede: ${user.sede || 'Sede Suroriental'}`;
    }

    const extras = Array.isArray(user.permisos_adicionales) ? user.permisos_adicionales : [];
    checks.forEach(c => {
        if (extras.includes(c.value) || user.rol === 'ADMINISTRADOR') {
            c.checked = true;
        }
    });

    if (btnGuardar) btnGuardar.disabled = false;
}

async function guardarPermisosAdicionales() {
    const select = document.getElementById('permisos-select-usuario');
    const id = select ? select.value : '';
    if (!id) return;

    const selectedPerms = [];
    document.querySelectorAll('.check-perm-extra:checked').forEach(c => {
        selectedPerms.push(c.value);
    });

    const btn = document.getElementById('btn-guardar-permisos-extra');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/usuarios/${id}/permisos`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permisos_adicionales: selectedPerms })
        });
        const result = await res.json();
        if (result.success) {
            showToast('🔑 Permisos adicionales actualizados correctamente.');
            await loadUsuarios();

            // Si el usuario modificado es el usuario actualmente en sesión, sincronizar permisos en caliente
            if (appState.currentUser && String(appState.currentUser.id) === String(id)) {
                appState.currentUser.permisos_adicionales = selectedPerms;
                localStorage.setItem('inventario_user', JSON.stringify(appState.currentUser));
                checkAuth();
                actualizarBadgesContexto();
            }
        } else {
            showToast(result.error || 'Error actualizando permisos.', 'danger');
        }
    } catch (err) {
        showToast('Error de comunicación con el servidor.', 'danger');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function cambiarSede(sede) {
    if (!tienePermiso('ACCESO_MULTI_SEDE')) {
        const userSede = appState.currentUser?.sede || 'Sede Suroriental';
        if (sede !== userSede) {
            showToast(`⛔ No tiene permiso para operar en otras sedes. Su sede asignada es '${userSede}'.`, 'warning');
            const globalSedeSelect = document.getElementById('global-sede-select');
            if (globalSedeSelect) {
                globalSedeSelect.value = userSede;
                globalSedeSelect.disabled = true;
            }
            appState.currentSede = userSede;
            return;
        }
    }

    appState.currentSede = sede;
    const globalSedeSelect = document.getElementById('global-sede-select');
    if (globalSedeSelect) globalSedeSelect.value = sede;

    actualizarBadgesContexto();
    showToast(`📍 Sede activa cambiada a: ${sede}`, 'info');
    recargarDatosContexto();
}

function seleccionarInventario(tipoInv, view) {
    appState.currentInventario = tipoInv;
    
    // Asegurar que el submenú de este inventario esté abierto
    const invKey = tipoInv.toLowerCase();
    asegurarSubmenuAbierto(invKey);

    // Actualizar clases activas en sidebar
    document.querySelectorAll('.nav-link-custom').forEach(link => {
        const linkView = link.getAttribute('data-view');
        const linkInv = link.getAttribute('data-inv');
        if (linkView === view && linkInv === tipoInv) {
            link.classList.add('active');
        } else if (linkInv) {
            link.classList.remove('active');
        }
    });

    actualizarBadgesContexto();
    navigate(view);
}

function seleccionarAdmin(view) {
    asegurarSubmenuAbierto('admin');
    document.querySelectorAll('.nav-link-custom').forEach(link => {
        const linkView = link.getAttribute('data-view');
        if (linkView === view) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    navigate(view);
}

function actualizarBadgesContexto() {
    const sedeBadge = document.getElementById('navbar-sede-badge');
    if (sedeBadge) {
        sedeBadge.innerHTML = `<i class="bi bi-geo-alt-fill me-1 text-danger"></i>${appState.currentSede}`;
    }

    const invBadge = document.getElementById('navbar-inv-badge');
    if (invBadge) {
        const iconHtml = appState.currentInventario === 'MOVILIDAD' ? '<i class="fa-solid fa-helmet-safety me-1 text-warning"></i>' : '<i class="bi bi-boxes me-1 text-info"></i>';
        const label = appState.currentInventario === 'MOVILIDAD' ? 'Inventario Movilidad' : 'Inventario CDS';
        invBadge.innerHTML = `${iconHtml}${label}`;
    }

    const headerBadge = document.getElementById('header-context-badge');
    if (headerBadge) {
        headerBadge.textContent = `${appState.currentInventario} • ${appState.currentSede}`;
    }

    const footerContext = document.getElementById('sidebar-footer-context');
    if (footerContext) {
        footerContext.textContent = `${appState.currentSede} • ${appState.currentInventario}`;
    }
}

async function recargarDatosContexto() {
    await Promise.all([
        loadKPIs(),
        loadInventario(),
        loadItems(),
        loadMovimientos(),
        loadVencimientos(),
        loadTraslados(),
        actualizarBadgesTraslados()
    ]);
}

function navigate(viewName) {
    const isSuperAdmin = appState.currentUser && (
        appState.currentUser.rol === 'ADMINISTRADOR' ||
        appState.currentUser.cedula === '1130683079' ||
        appState.currentUser.cedula === '123456' ||
        appState.currentUser.cedula === 'admin'
    );

    if ((viewName === 'usuarios' || viewName === 'database') && !isSuperAdmin) {
        showToast('⛔ Acceso denegado. Este panel es exclusivo para el Administrador del Sistema.', 'warning');
        navigate('inicio');
        return;
    }

    appState.currentView = viewName;

    // Actualizar enlaces del sidebar que no tienen data-inv (o correspondientes)
    document.querySelectorAll('.nav-link-custom').forEach(link => {
        const linkView = link.getAttribute('data-view');
        const linkInv = link.getAttribute('data-inv');
        if (linkView === viewName && (!linkInv || linkInv === appState.currentInventario)) {
            link.classList.add('active');
        } else if (!linkInv || linkInv !== appState.currentInventario) {
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
    const invLabel = appState.currentInventario === 'MOVILIDAD' ? 'Movilidad' : 'CDS';
    const titles = {
        'inicio': `Panel de Control (${invLabel})`,
        'inventario': `Inventario Físico ${invLabel}`,
        'movimientos': `Movimientos ${invLabel}`,
        'items': `Catálogo Maestro Ítems`,
        'vencimientos': `Control de Vencimientos ${invLabel}`,
        'traslados': `Traslados entre Bodegas Centrales (${invLabel})`,
        'bodegas': 'Bodegas y Proyectos',
        'reportes': `Kardex & Reportes ${invLabel}`,
        'usuarios': 'Panel de Administración: Usuarios y Permisos',
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
    if (viewName === 'traslados') loadTraslados();
    if (viewName === 'bodegas') loadBodegasYProyectos();
    if (viewName === 'reportes') initFiltrosReportes();
    if (viewName === 'usuarios') loadUsuarios();
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
            appState.sedes = result.data.sedes;
            appState.tipos_inventario = result.data.tipos_inventario;
            appState.causales_movimientos = result.data.causales_movimientos || [];
            appState.permisos = result.data.permisos || [];
            populateSelectOptions();
        }
    } catch (err) {
        console.error('Error al cargar configuración:', err);
    }
}

function populateSelectOptions() {
    const { sedes, tipos_inventario, categorias, unidades, ubicaciones, causales, bodegas, proyectos } = appState.config;

    const defaultUbicaciones = (ubicaciones && ubicaciones.length > 0)
        ? ubicaciones
        : ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4', 'C5', 'D1', 'D2', 'D3', 'D4', 'D5', 'T1', 'T2', 'T3', 'T4', 'T5'];

    const sedesList = (sedes && sedes.length > 0) ? sedes.map(s => s.nombre) : ['Sede Suroriental', 'Sede Medellín'];
    const tiposList = (tipos_inventario && tipos_inventario.length > 0) ? tipos_inventario.map(t => t.codigo) : ['CDS', 'MOVILIDAD'];

    // Selectores de Sede y Tipo de Inventario en modales y global
    fillSelect('global-sede-select', sedesList, false);
    const globalSedeSelect = document.getElementById('global-sede-select');
    if (globalSedeSelect) {
        if (!tienePermiso('ACCESO_MULTI_SEDE')) {
            const userSede = appState.currentUser?.sede || 'Sede Suroriental';
            appState.currentSede = userSede;
            globalSedeSelect.value = userSede;
            globalSedeSelect.disabled = true;
            globalSedeSelect.title = `🔒 Sede asignada: ${userSede} (Requiere permiso de Ver Sedes)`;
        } else {
            globalSedeSelect.value = appState.currentSede;
            globalSedeSelect.disabled = false;
            globalSedeSelect.title = 'Seleccionar Sede Operativa';
        }
    }

    fillSelect('item-sede', sedesList, false);
    fillSelect('item-tipo-inventario', tiposList, false);
    fillSelect('mov-sede', sedesList, false);
    fillSelect('mov-tipo-inventario', tiposList, false);

    // Selectores para Bodegas y Proyectos
    fillSelect('bod-sede', sedesList, false);
    fillSelect('bod-tipo-inventario', tiposList, false);
    fillSelect('proy-sede', sedesList, false);
    fillSelect('proy-tipo-inventario', tiposList, false);

    // Filtros de vistas
    fillSelect('filter-inv-categoria', categorias, true, 'Todas las Categorías');
    fillSelect('filter-items-categoria', categorias, true, 'Todas las Categorías');
    fillSelect('filter-mov-bodega', bodegas, true, 'Todas las Bodegas');
    fillSelect('filter-bodegas-sede', sedesList, true, 'Todas las Sedes');
    fillSelect('filter-bodegas-inv', tiposList, true, 'Todos los Inventarios');

    // Selectores de formularios
    fillSelect('item-categoria', categorias, false);
    fillSelect('item-unidad', unidades, false);
    fillSelect('item-ubicacion', defaultUbicaciones, false);
    fillSelect('mov-bodega-origen', bodegas, true, '-- Sin Bodega Origen --');
    fillSelect('mov-bodega-destino', bodegas, true, '-- Sin Bodega Destino --');
    fillSelect('mov-causal', causales, true, '-- Seleccionar Causal --');
    fillSelect('mov-proyecto', proyectos, true, 'Operación Central / General');

    // Selector de sedes en modal de usuarios
    fillSelect('usr-sede', sedesList, false);
}

function fillSelect(elementIdOrEl, items, allowEmpty = false, emptyText = '-- Seleccione --') {
    const select = typeof elementIdOrEl === 'string' ? document.getElementById(elementIdOrEl) : elementIdOrEl;
    if (!select) return;

    let html = allowEmpty ? `<option value="ALL">${emptyText}</option>` : '';
    if (Array.isArray(items)) {
        items.forEach(item => {
            if (typeof item === 'object' && item !== null) {
                const val = item.codigo || item.id || item.value || item.nombre || '';
                const txt = item.nombre || item.label || item.descripcion || val;
                html += `<option value="${val}">${txt}</option>`;
            } else if (item !== undefined && item !== null) {
                html += `<option value="${item}">${item}</option>`;
            }
        });
    }
    select.innerHTML = html;
}

// ==============================================================
// 3. KPIS Y DASHBOARD EJECUTIVO
// ==============================================================
async function loadKPIs() {
    try {
        const res = await fetch(`${API_BASE}/kpis?sede=${encodeURIComponent(appState.currentSede)}&tipo_inventario=${encodeURIComponent(appState.currentInventario)}`);
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

        // Badges en sidebar según el tipo de inventario activo
        const badgeSuffix = appState.currentInventario === 'MOVILIDAD' ? 'movilidad' : 'cds';
        const badgeStockBajo = document.getElementById(`sidebar-badge-stock-bajo-${badgeSuffix}`);
        if (badgeStockBajo) {
            badgeStockBajo.textContent = kpis.itemsStockBajo;
            badgeStockBajo.style.display = kpis.itemsStockBajo > 0 ? 'inline-block' : 'none';
        }

        const badgeVencidos = document.getElementById(`sidebar-badge-vencidos-${badgeSuffix}`);
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
// 4. INVENTARIO FÍSICO OFICIAL
// ==============================================================
async function loadInventario() {
    try {
        const search = document.getElementById('filter-inv-search')?.value || '';
        const categoria = document.getElementById('filter-inv-categoria')?.value || 'ALL';
        const estadoStock = document.getElementById('filter-inv-estado')?.value || 'ALL';

        const params = new URLSearchParams();
        params.append('sede', appState.currentSede);
        params.append('tipo_inventario', appState.currentInventario);
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
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-muted">No se encontraron productos en ${appState.currentSede} (${appState.currentInventario}) con los filtros seleccionados.</td></tr>`;
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
        params.append('sede', appState.currentSede);
        params.append('tipo_inventario', appState.currentInventario);
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
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-muted">No se encontraron movimientos registrados para ${appState.currentSede} (${appState.currentInventario}).</td></tr>`;
        return;
    }

    const latestId = appState.movimientos.length > 0 ? Math.max(...appState.movimientos.map(m => m.id)) : 0;

    tbody.innerHTML = movs.map((m) => {
        let badgeClass = 'bg-secondary';
        if (m.tipo_movimiento === 'ENTRADA') badgeClass = 'bg-success';
        if (m.tipo_movimiento === 'ENTRADA POR TRASLADO') badgeClass = 'bg-primary text-white';
        if (m.tipo_movimiento === 'ENTREGA') badgeClass = 'bg-warning text-dark';
        if (m.tipo_movimiento === 'SALIDA POR TRASLADO') badgeClass = 'bg-warning bg-opacity-75 text-dark border border-warning';
        if (m.tipo_movimiento === 'DISPOSICION FINAL') badgeClass = 'bg-danger';
        if (m.tipo_movimiento === 'DEVOLUCION') badgeClass = 'bg-info text-dark';
        if (m.tipo_movimiento === 'AJUSTE POSITIVO') badgeClass = 'bg-success bg-opacity-75';
        if (m.tipo_movimiento === 'AJUSTE NEGATIVO') badgeClass = 'bg-danger bg-opacity-75';

        const isLatest = m.id === latestId;

        return `
            <tr class="${isLatest ? 'table-light border-start border-primary border-3' : ''}">
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
                    ${isLatest ? `
                        <button class="btn btn-outline-danger btn-sm py-0 px-2 shadow-sm" onclick="abrirModalEliminarMovimiento(${m.id})" title="Eliminar y revertir el último movimiento registrado">
                            <i class="bi bi-trash3"></i>
                        </button>
                    ` : `
                        <button class="btn btn-light btn-sm py-0 px-2 text-muted border-0" disabled title="Solo se permite eliminar el último movimiento registrado">
                            <i class="bi bi-lock-fill opacity-25"></i>
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

async function openModalMovimiento(preselectedCode = null) {
    const form = document.getElementById('form-movimiento');
    if (form) form.reset();

    // Resetear vistas previas e informaciones
    const infoDiv = document.getElementById('mov-item-info');
    if (infoDiv) infoDiv.style.display = 'none';

    const vencContainer = document.getElementById('mov-vencimiento-container');
    if (vencContainer) vencContainer.style.display = 'none';

    // Precargar sede y tipo de inventario activos
    const movSede = document.getElementById('mov-sede');
    if (movSede) {
        if (!tienePermiso('ACCESO_MULTI_SEDE')) {
            const userSede = appState.currentUser?.sede || 'Sede Suroriental';
            movSede.value = userSede;
            movSede.disabled = true;
            movSede.title = `🔒 Sede asignada: ${userSede} (Requiere permiso de Ver Sedes)`;
        } else {
            movSede.value = appState.currentSede;
            movSede.disabled = false;
            movSede.title = 'Seleccionar Sede';
        }
    }

    const movTipoInv = document.getElementById('mov-tipo-inventario');
    if (movTipoInv) movTipoInv.value = appState.currentInventario;

    // Auto-asignar el responsable de la transacción con el usuario activo en sesión
    const respInput = document.getElementById('mov-responsable');
    if (respInput) {
        respInput.value = getNombreUsuarioActual();
    }

    // Asegurar botón habilitado
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Registrar Transacción';
    }

    // Asegurar que los ítems del catálogo maestro estén siempre cargados
    if (!appState.items || appState.items.length === 0) {
        try {
            const res = await fetch(`${API_BASE}/items`);
            const result = await res.json();
            if (result.success && Array.isArray(result.data)) {
                appState.items = result.data;
            }
        } catch (err) {
            console.error('Error al precargar ítems para movimiento:', err);
        }
    }

    // Llenar selector de ítems activos
    const select = document.getElementById('mov-item-select');
    if (select) {
        let html = '<option value="">-- Buscar ítem por código o nombre --</option>';
        const itemsList = (appState.items || []).filter(i => !i.estado || i.estado.toLowerCase() === 'activo');
        
        if (itemsList.length === 0) {
            html += '<option value="" disabled>⚠️ No hay ítems activos disponibles en el catálogo</option>';
        } else {
            itemsList.forEach(item => {
                html += `<option value="${item.codigo}">${item.codigo} - ${item.nombre} (${item.unidad_medida || 'Unidad'})</option>`;
            });
        }
        select.innerHTML = html;

        if (preselectedCode) {
            select.value = preselectedCode;
            handleItemSelectInMovimiento(preselectedCode);
        }
    }

    handleTipoMovimientoChange(document.getElementById('mov-tipo').value);
    await actualizarContextoEnMovimiento();

    const modalEl = document.getElementById('modalMovimiento');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function getCausalesParaTipoMovimiento(tipo) {
    if (appState.config && Array.isArray(appState.config.causales_movimientos) && appState.config.causales_movimientos.length > 0) {
        const causales = appState.config.causales_movimientos
            .filter(c => c.tipo_movimiento === tipo && (c.estado === 'Activo' || !c.estado))
            .sort((a, b) => (a.orden || 0) - (b.orden || 0))
            .map(c => c.nombre);
        if (causales.length > 0) return causales;
    }
    const fallbacks = {
        'ENTRADA': ['COMPRA / PROVEEDOR', 'INVENTARIO INICIAL', 'DOTACION / HERRAMIENTAS NUEVAS', 'DONACION / OTRO INGRESO'],
        'ENTREGA': ['USO EN OBRA / PROYECTO', 'DOTACION PERSONAL', 'MANTENIMIENTO OPERATIVO', 'CONSUMO GENERAL'],
        'DEVOLUCION': ['SOBRANTE DE OBRA', 'CAMBIO DE MATERIAL', 'DESPACHO ERRADO', 'HERRAMIENTA REINTEGRADA', 'OTRA DEVOLUCION'],
        'DISPOSICION FINAL': ['DAÑADO / ROTO', 'CADUCADO / VENCIDO', 'OBSOLETO / SCRAP', 'DEFECTUOSO DE FABRICA', 'DESGASTE NO REPARABLE'],
        'AJUSTE POSITIVO': ['CONTEO FISICO / AUDITORIA', 'SOBRANTE DETECTADO EN BODEGA', 'CORRECCION DE SALDO'],
        'AJUSTE NEGATIVO': ['CONTEO FISICO / AUDITORIA', 'FALTANTE DETECTADO EN BODEGA', 'MERMA / EVAPORACION', 'CORRECCION DE SALDO']
    };
    return fallbacks[tipo] || [];
}

function fillSelectDirecto(selectEl, options) {
    if (!selectEl) return;
    selectEl.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
}

function handleTipoMovimientoChange(tipo) {
    const colOrigen = document.getElementById('col-mov-bodega-origen');
    const colDestino = document.getElementById('col-mov-bodega-destino');
    const colProyecto = document.getElementById('col-mov-proyecto');
    const colCausal = document.getElementById('col-mov-causal');
    const colPersona = document.getElementById('col-mov-persona-recibe');
    const colDocRef = document.getElementById('col-mov-doc-ref');
    const vencContainer = document.getElementById('mov-vencimiento-container');

    const lblCantidad = document.getElementById('lbl-mov-cantidad');
    const lblOrigen = document.getElementById('lbl-mov-bodega-origen');
    const lblDestino = document.getElementById('lbl-mov-bodega-destino');
    const lblProyecto = document.getElementById('lbl-mov-proyecto');
    const lblCausal = document.getElementById('lbl-mov-causal');
    const lblPersona = document.getElementById('lbl-mov-persona-recibe');
    const lblDocRef = document.getElementById('lbl-mov-doc-ref');

    const origenSelect = document.getElementById('mov-bodega-origen');
    const destinoSelect = document.getElementById('mov-bodega-destino');
    const proyectoSelect = document.getElementById('mov-proyecto');
    const causalSelect = document.getElementById('mov-causal');
    const personaInput = document.getElementById('mov-persona-recibe');
    const docRefInput = document.getElementById('mov-doc-ref');

    // Reset required flags
    if (origenSelect) origenSelect.required = false;
    if (destinoSelect) destinoSelect.required = false;
    if (proyectoSelect) proyectoSelect.required = false;
    if (personaInput) personaInput.required = false;
    if (causalSelect) causalSelect.required = false;

    // Configuración dinámica estricta según Tipo de Movimiento
    if (tipo === 'ENTRADA') {
        // 1. ENTRADA MANUAL / PROVEEDOR
        // En una entrada NO se debe permitir seleccionar bodega de origen (es inventario nuevo que entra de proveedor/externo)
        if (colOrigen) colOrigen.style.display = 'none';
        if (origenSelect) origenSelect.value = 'ALL';

        // Bodega Destino: OBLIGATORIA (Dónde entra el material a la operación)
        if (colDestino) colDestino.style.display = 'block';
        if (lblDestino) lblDestino.innerHTML = '<i class="bi bi-box-arrow-in-down-right me-1 text-success"></i>Bodega de Destino (Recepción) <span class="text-danger">*</span>';
        if (destinoSelect) {
            destinoSelect.required = true;
            if (!destinoSelect.value || destinoSelect.value === 'ALL') {
                const firstOpt = Array.from(destinoSelect.options).find(o => o.value && o.value !== 'ALL');
                destinoSelect.value = firstOpt ? firstOpt.value : 'CDS';
            }
        }

        // Proyecto: Oculto para entrada
        if (colProyecto) colProyecto.style.display = 'none';
        if (proyectoSelect) proyectoSelect.value = 'ALL';

        // Causal / Motivo de entrada
        if (colCausal) colCausal.style.display = 'block';
        if (lblCausal) lblCausal.innerHTML = '<i class="bi bi-info-circle me-1"></i>Motivo de Ingreso';
        fillSelectDirecto(causalSelect, getCausalesParaTipoMovimiento('ENTRADA'));

        // Persona que recibe en bodega
        if (colPersona) colPersona.style.display = 'block';
        if (lblPersona) lblPersona.innerHTML = '<i class="bi bi-person-badge me-1"></i>Persona que Recibe en Bodega';
        if (personaInput) personaInput.placeholder = 'Nombre del almacenista o receptor';

        // Documento
        if (colDocRef) colDocRef.style.display = 'block';
        if (lblDocRef) lblDocRef.innerHTML = '<i class="bi bi-receipt me-1"></i>Factura / Remisión de Proveedor';
        if (docRefInput) docRefInput.placeholder = 'Ej: FACT-9820, REM-1045';

        // Cantidad
        if (lblCantidad) lblCantidad.innerHTML = 'Cantidad a Ingresar <span class="text-danger">*</span>';

    } else if (tipo === 'ENTREGA') {
        // 2. ENTREGA (SALIDA A PROYECTO / OPERACIÓN)
        // Bodega Origen: OBLIGATORIA (De qué bodega sale el stock)
        if (colOrigen) colOrigen.style.display = 'block';
        if (lblOrigen) lblOrigen.innerHTML = '<i class="bi bi-box-arrow-up-right me-1 text-danger"></i>Bodega de Origen (Despacho) <span class="text-danger">*</span>';
        if (origenSelect) {
            origenSelect.required = true;
            if (!origenSelect.value || origenSelect.value === 'ALL') {
                const firstOpt = Array.from(origenSelect.options).find(o => o.value && o.value !== 'ALL');
                origenSelect.value = firstOpt ? firstOpt.value : 'CDS';
            }
        }

        // Bodega Destino: HABILITADA Y SELECCIONABLE
        if (colDestino) colDestino.style.display = 'block';
        if (lblDestino) lblDestino.innerHTML = '<i class="bi bi-box-arrow-in-down-right me-1 text-success"></i>Bodega de Destino / Recepción <span class="text-danger">*</span>';
        if (destinoSelect) {
            destinoSelect.required = true;
            if (!destinoSelect.value || destinoSelect.value === 'ALL') {
                const firstOpt = Array.from(destinoSelect.options).find(o => o.value && o.value !== 'ALL');
                destinoSelect.value = firstOpt ? firstOpt.value : 'PROYECTOS';
            }
        }

        // Proyecto / Destino: OBLIGATORIO
        if (colProyecto) colProyecto.style.display = 'block';
        if (lblProyecto) lblProyecto.innerHTML = '<i class="bi bi-buildings me-1 text-primary"></i>Proyecto / Cuadrilla Destino <span class="text-danger">*</span>';
        if (proyectoSelect) proyectoSelect.required = true;

        // Causal / Condición
        if (colCausal) colCausal.style.display = 'block';
        if (lblCausal) lblCausal.innerHTML = '<i class="bi bi-info-circle me-1"></i>Causal / Uso Operativo';
        fillSelectDirecto(causalSelect, getCausalesParaTipoMovimiento('ENTREGA'));

        // Persona que recibe: OBLIGATORIO
        if (colPersona) colPersona.style.display = 'block';
        if (lblPersona) lblPersona.innerHTML = '<i class="bi bi-person-badge me-1"></i>Persona que Recibe Material <span class="text-danger">*</span>';
        if (personaInput) {
            personaInput.required = true;
            personaInput.placeholder = 'Nombre del técnico / líder de cuadrilla';
        }

        // Documento
        if (colDocRef) colDocRef.style.display = 'block';
        if (lblDocRef) lblDocRef.innerHTML = '<i class="bi bi-receipt me-1"></i>Vale de Salida / Orden de Trabajo';
        if (docRefInput) docRefInput.placeholder = 'Ej: VALE-1002, OT-403';

        // Cantidad
        if (lblCantidad) lblCantidad.innerHTML = 'Cantidad a Entregar <span class="text-danger">*</span>';

    } else if (tipo === 'DEVOLUCION') {
        // 3. DEVOLUCIÓN (REINGRESO DESDE PROYECTO)
        if (colOrigen) colOrigen.style.display = 'none';
        if (origenSelect) origenSelect.value = 'PROYECTOS';

        // Bodega Destino: OBLIGATORIA
        if (colDestino) colDestino.style.display = 'block';
        if (lblDestino) lblDestino.innerHTML = '<i class="bi bi-box-arrow-in-down-right me-1 text-success"></i>Bodega de Reingreso <span class="text-danger">*</span>';
        if (destinoSelect) {
            destinoSelect.required = true;
            if (!destinoSelect.value || destinoSelect.value === 'ALL') {
                const firstOpt = Array.from(destinoSelect.options).find(o => o.value && o.value !== 'ALL');
                destinoSelect.value = firstOpt ? firstOpt.value : 'CDS';
            }
        }

        // Proyecto que Devuelve
        if (colProyecto) colProyecto.style.display = 'block';
        if (lblProyecto) lblProyecto.innerHTML = '<i class="bi bi-buildings me-1 text-primary"></i>Proyecto / Obra que Devuelve <span class="text-danger">*</span>';
        if (proyectoSelect) proyectoSelect.required = true;

        // Causal
        if (colCausal) colCausal.style.display = 'block';
        if (lblCausal) lblCausal.innerHTML = '<i class="bi bi-info-circle me-1"></i>Motivo de Devolución';
        fillSelectDirecto(causalSelect, getCausalesParaTipoMovimiento('DEVOLUCION'));

        // Persona que Devuelve
        if (colPersona) colPersona.style.display = 'block';
        if (lblPersona) lblPersona.innerHTML = '<i class="bi bi-person-badge me-1"></i>Persona que Devuelve <span class="text-danger">*</span>';
        if (personaInput) {
            personaInput.required = true;
            personaInput.placeholder = 'Nombre de quien devuelve el material';
        }

        // Documento
        if (colDocRef) colDocRef.style.display = 'block';
        if (lblDocRef) lblDocRef.innerHTML = '<i class="bi bi-receipt me-1"></i>Acta / Remisión de Devolución';
        if (docRefInput) docRefInput.placeholder = 'Ej: DEV-204';

        if (lblCantidad) lblCantidad.innerHTML = 'Cantidad a Devolver <span class="text-danger">*</span>';

    } else if (tipo === 'DISPOSICION FINAL') {
        // 4. DISPOSICIÓN FINAL (SCRAP / BAJA)
        if (colOrigen) colOrigen.style.display = 'block';
        if (lblOrigen) lblOrigen.innerHTML = '<i class="bi bi-box-arrow-up-right me-1 text-danger"></i>Bodega de Origen (Baja) <span class="text-danger">*</span>';
        if (origenSelect) {
            origenSelect.required = true;
            if (!origenSelect.value || origenSelect.value === 'ALL') {
                const firstOpt = Array.from(origenSelect.options).find(o => o.value && o.value !== 'ALL');
                origenSelect.value = firstOpt ? firstOpt.value : 'CDS';
            }
        }

        if (colDestino) colDestino.style.display = 'none';
        if (destinoSelect) destinoSelect.value = 'DISPOSICION FINAL';

        if (colProyecto) colProyecto.style.display = 'none';
        if (proyectoSelect) proyectoSelect.value = 'ALL';

        if (colCausal) colCausal.style.display = 'block';
        if (lblCausal) lblCausal.innerHTML = '<i class="bi bi-info-circle me-1"></i>Causal de Descarte / Baja <span class="text-danger">*</span>';
        if (causalSelect) causalSelect.required = true;
        fillSelectDirecto(causalSelect, getCausalesParaTipoMovimiento('DISPOSICION FINAL'));

        if (colPersona) colPersona.style.display = 'none';

        if (colDocRef) colDocRef.style.display = 'block';
        if (lblDocRef) lblDocRef.innerHTML = '<i class="bi bi-receipt me-1"></i>Acta de Baja / Descarte';
        if (docRefInput) docRefInput.placeholder = 'Ej: ACTA-BAJA-01';

        if (lblCantidad) lblCantidad.innerHTML = 'Cantidad a Dar de Baja <span class="text-danger">*</span>';

    } else if (tipo === 'AJUSTE POSITIVO') {
        // 5. AJUSTE POSITIVO (+)
        if (colOrigen) colOrigen.style.display = 'none';
        if (origenSelect) origenSelect.value = 'ALL';

        if (colDestino) colDestino.style.display = 'block';
        if (lblDestino) lblDestino.innerHTML = '<i class="bi bi-box-arrow-in-down-right me-1 text-success"></i>Bodega a Ajustar (+) <span class="text-danger">*</span>';
        if (destinoSelect) {
            destinoSelect.required = true;
            if (!destinoSelect.value || destinoSelect.value === 'ALL') {
                const firstOpt = Array.from(destinoSelect.options).find(o => o.value && o.value !== 'ALL');
                destinoSelect.value = firstOpt ? firstOpt.value : 'CDS';
            }
        }

        if (colProyecto) colProyecto.style.display = 'none';
        if (proyectoSelect) proyectoSelect.value = 'ALL';

        if (colCausal) colCausal.style.display = 'block';
        if (lblCausal) lblCausal.innerHTML = '<i class="bi bi-info-circle me-1"></i>Motivo del Ajuste (+)';
        fillSelectDirecto(causalSelect, getCausalesParaTipoMovimiento('AJUSTE POSITIVO'));

        if (colPersona) colPersona.style.display = 'none';

        if (colDocRef) colDocRef.style.display = 'block';
        if (lblDocRef) lblDocRef.innerHTML = '<i class="bi bi-receipt me-1"></i>Acta de Conteo / Auditoría';
        if (docRefInput) docRefInput.placeholder = 'Ej: AUDIT-2026-01';

        if (lblCantidad) lblCantidad.innerHTML = 'Cantidad a Adicionar (+) <span class="text-danger">*</span>';

    } else if (tipo === 'AJUSTE NEGATIVO') {
        // 6. AJUSTE NEGATIVO (-)
        if (colOrigen) colOrigen.style.display = 'block';
        if (lblOrigen) lblOrigen.innerHTML = '<i class="bi bi-box-arrow-up-right me-1 text-danger"></i>Bodega a Ajustar (-) <span class="text-danger">*</span>';
        if (origenSelect) {
            origenSelect.required = true;
            if (!origenSelect.value || origenSelect.value === 'ALL') {
                const firstOpt = Array.from(origenSelect.options).find(o => o.value && o.value !== 'ALL');
                origenSelect.value = firstOpt ? firstOpt.value : 'CDS';
            }
        }

        if (colDestino) colDestino.style.display = 'none';
        if (destinoSelect) destinoSelect.value = 'ALL';

        if (colProyecto) colProyecto.style.display = 'none';
        if (proyectoSelect) proyectoSelect.value = 'ALL';

        if (colCausal) colCausal.style.display = 'block';
        if (lblCausal) lblCausal.innerHTML = '<i class="bi bi-info-circle me-1"></i>Motivo del Ajuste (-)';
        fillSelectDirecto(causalSelect, getCausalesParaTipoMovimiento('AJUSTE NEGATIVO'));

        if (colPersona) colPersona.style.display = 'none';

        if (colDocRef) colDocRef.style.display = 'block';
        if (lblDocRef) lblDocRef.innerHTML = '<i class="bi bi-receipt me-1"></i>Acta de Conteo / Auditoría';
        if (docRefInput) docRefInput.placeholder = 'Ej: AUDIT-2026-01';

        if (lblCantidad) lblCantidad.innerHTML = 'Cantidad a Descontar (-) <span class="text-danger">*</span>';
    }

    // Fecha de vencimiento solo visible si es ENTRADA y el ítem aplica
    const selectedCode = document.getElementById('mov-item-select')?.value;
    const item = appState.items ? appState.items.find(i => String(i.codigo) === String(selectedCode)) : null;
    if (tipo === 'ENTRADA' && item && item.aplica_vencimiento) {
        if (vencContainer) vencContainer.style.display = 'block';
    } else {
        if (vencContainer) vencContainer.style.display = 'none';
    }

    actualizarStockPreviewEnMovimiento();
}

function handleItemSelectInMovimiento(codigo) {
    const item = appState.items ? appState.items.find(i => String(i.codigo) === String(codigo)) : null;
    const infoDiv = document.getElementById('mov-item-info');
    const vencContainer = document.getElementById('mov-vencimiento-container');
    const tipo = document.getElementById('mov-tipo')?.value || 'ENTRADA';

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
        if (vencContainer) vencContainer.style.display = 'block';
    } else {
        if (vencContainer) vencContainer.style.display = 'none';
    }

    actualizarStockPreviewEnMovimiento();
}

async function actualizarContextoEnMovimiento() {
    const movSede = document.getElementById('mov-sede')?.value || appState.currentSede;
    const movTipoInv = document.getElementById('mov-tipo-inventario')?.value || appState.currentInventario;

    try {
        const [resBod, resProy] = await Promise.all([
            fetch(`${API_BASE}/bodegas?sede=${encodeURIComponent(movSede)}&tipo_inventario=${encodeURIComponent(movTipoInv)}`),
            fetch(`${API_BASE}/proyectos?sede=${encodeURIComponent(movSede)}&tipo_inventario=${encodeURIComponent(movTipoInv)}`)
        ]);

        const dataBod = await resBod.json();
        const dataProy = await resProy.json();

        if (dataBod.success && Array.isArray(dataBod.data)) {
            const currentOrigen = document.getElementById('mov-bodega-origen')?.value;
            const currentDestino = document.getElementById('mov-bodega-destino')?.value;
            let bodList = dataBod.data.map(b => b.nombre);
            if (bodList.length === 0) {
                bodList = ['CDS', 'PROYECTOS'];
            }
            fillSelect('mov-bodega-origen', bodList, false);
            fillSelect('mov-bodega-destino', bodList, false);
            if (currentOrigen && document.getElementById('mov-bodega-origen') && bodList.includes(currentOrigen)) {
                document.getElementById('mov-bodega-origen').value = currentOrigen;
            }
            if (currentDestino && document.getElementById('mov-bodega-destino') && bodList.includes(currentDestino)) {
                document.getElementById('mov-bodega-destino').value = currentDestino;
            }
        }

        if (dataProy.success && Array.isArray(dataProy.data)) {
            const currentProy = document.getElementById('mov-proyecto')?.value;
            let proyList = dataProy.data.map(p => p.nombre);
            if (proyList.length === 0) {
                proyList = ['OPERACION'];
            }
            fillSelect('mov-proyecto', proyList, false);
            if (currentProy && document.getElementById('mov-proyecto') && proyList.includes(currentProy)) {
                document.getElementById('mov-proyecto').value = currentProy;
            }
        }
    } catch (err) {
        console.warn('Error al actualizar listas contextuales en movimiento:', err);
    }

    const currentTipo = document.getElementById('mov-tipo')?.value || 'ENTRADA';
    handleTipoMovimientoChange(currentTipo);
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
    const movSede = document.getElementById('mov-sede')?.value || appState.currentSede;
    const movTipoInv = document.getElementById('mov-tipo-inventario')?.value || appState.currentInventario;

    let bodegaRelevante = 'CDS';
    if (tipo === 'DEVOLUCION') {
        bodegaRelevante = (origenSelect && origenSelect.value && origenSelect.value !== 'ALL') ? origenSelect.value : 'PROYECTOS';
    } else if (tipo === 'ENTREGA' || tipo === 'DISPOSICION FINAL' || tipo === 'AJUSTE NEGATIVO') {
        bodegaRelevante = (origenSelect && origenSelect.value && origenSelect.value !== 'ALL') ? origenSelect.value : 'CDS';
    } else {
        bodegaRelevante = 'CDS';
    }

    try {
        const res = await fetch(`${API_BASE}/inventario/stock-bodega?codigo_item=${selectedCode}&bodega=${encodeURIComponent(bodegaRelevante)}&sede=${encodeURIComponent(movSede)}&tipo_inventario=${encodeURIComponent(movTipoInv)}`);
        const result = await res.json();
        const stockActual = result.success ? result.stock : 0;

        if (labelEl) {
            labelEl.textContent = `Stock Disponible [${bodegaRelevante} - ${movSede}]:`;
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

    let sedeVal = document.getElementById('mov-sede')?.value || appState.currentSede;
    if (!tienePermiso('ACCESO_MULTI_SEDE')) {
        sedeVal = appState.currentUser?.sede || 'Sede Suroriental';
    }

    const tipoMov = document.getElementById('mov-tipo').value;
    let bOrigen = null;
    let bDestino = null;
    let pDestino = null;

    if (tipoMov === 'ENTRADA') {
        bOrigen = null; // Entrada directa / Compra de nuevo inventario sin bodega de origen
        bDestino = document.getElementById('mov-bodega-destino')?.value || 'CDS';
        pDestino = null;
    } else if (tipoMov === 'ENTREGA') {
        bOrigen = document.getElementById('mov-bodega-origen')?.value || 'CDS';
        bDestino = document.getElementById('mov-bodega-destino')?.value || 'PROYECTOS';
        pDestino = document.getElementById('mov-proyecto')?.value || 'OPERACION';
    } else if (tipoMov === 'DEVOLUCION') {
        bOrigen = 'PROYECTOS';
        bDestino = document.getElementById('mov-bodega-destino')?.value || 'CDS';
        pDestino = document.getElementById('mov-proyecto')?.value || 'OPERACION';
    } else if (tipoMov === 'DISPOSICION FINAL') {
        bOrigen = document.getElementById('mov-bodega-origen')?.value || 'CDS';
        bDestino = 'DISPOSICION FINAL';
        pDestino = null;
    } else if (tipoMov === 'AJUSTE POSITIVO') {
        bOrigen = null;
        bDestino = document.getElementById('mov-bodega-destino')?.value || 'CDS';
        pDestino = null;
    } else if (tipoMov === 'AJUSTE NEGATIVO') {
        bOrigen = document.getElementById('mov-bodega-origen')?.value || 'CDS';
        bDestino = null;
        pDestino = null;
    }

    const payload = {
        sede: sedeVal,
        tipo_inventario: document.getElementById('mov-tipo-inventario')?.value || appState.currentInventario,
        tipo_movimiento: tipoMov,
        codigo_item: parseInt(document.getElementById('mov-item-select').value, 10),
        cantidad: parseFloat(document.getElementById('mov-cantidad').value),
        bodega_origen: bOrigen,
        bodega_destino: bDestino,
        causal_condicion: document.getElementById('mov-causal')?.value || null,
        proyecto_destino: pDestino,
        responsable: document.getElementById('mov-responsable')?.value?.trim() || getNombreUsuarioActual(),
        persona_recibe_devuelve: document.getElementById('mov-persona-recibe')?.value || null,
        documento_referencia: document.getElementById('mov-doc-ref')?.value || 'MANUAL',
        observaciones: document.getElementById('mov-observaciones')?.value || null,
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
        await recargarDatosContexto();
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
        const res = await fetch(`${API_BASE}/movimientos/ultimo?sede=${encodeURIComponent(appState.currentSede)}&tipo_inventario=${encodeURIComponent(appState.currentInventario)}`);
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
    const latestId = appState.movimientos.length > 0 ? Math.max(...appState.movimientos.map(m => m.id)) : 0;
    if (id !== latestId) {
        showToast('⚠️ Solo se permite eliminar y revertir el último movimiento registrado en el sistema para mantener la integridad del kardex.', 'warning');
        return;
    }

    const mov = appState.movimientos.find(m => m.id === id);
    if (!mov) {
        try {
            const res = await fetch(`${API_BASE}/movimientos?sede=${encodeURIComponent(appState.currentSede)}&tipo_inventario=${encodeURIComponent(appState.currentInventario)}`);
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

        await recargarDatosContexto();
    } catch (err) {
        showToast(`Error al eliminar movimiento: ${err.message}`, 'danger');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Eliminar y Revertir Stock';
        }
    }
}

// ==============================================================
// 6. CATÁLOGO MAESTRO DE ITEMS (frmNuevoItem)
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
            let html = '<option value="">-- Seleccionar Ítem del Catálogo Maestro --</option>';
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
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No se encontraron ítems en el catálogo maestro.</td></tr>`;
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
    const codigoInput = document.getElementById('item-codigo');
    // Si el campo está en solo lectura (modo edición), no permitir alterar el código
    if (codigoInput && codigoInput.readOnly) return;

    try {
        const res = await fetch(`${API_BASE}/items/next-code`);
        const result = await res.json();
        if (result.success && codigoInput && !codigoInput.readOnly) {
            codigoInput.value = result.nextCode;
        }
    } catch (err) {
        console.error('Error al sugerir código:', err);
    }
}

function openModalNuevoItem() {
    if (appState.currentUser?.rol === 'USUARIO' && !tienePermiso('CREAR_ITEMS')) {
        showToast('🔒 El rol USUARIO no tiene permiso para crear nuevos ítems en el catálogo.', 'warning');
        return;
    }

    const form = document.getElementById('form-item');
    if (form) form.reset();

    const sedeSelect = document.getElementById('item-sede');
    if (sedeSelect) {
        if (!tienePermiso('ACCESO_MULTI_SEDE')) {
            const userSede = appState.currentUser?.sede || 'Sede Suroriental';
            sedeSelect.value = userSede;
            sedeSelect.disabled = true;
            sedeSelect.title = `🔒 Sede asignada: ${userSede} (Requiere permiso de Ver Sedes)`;
        } else {
            sedeSelect.value = appState.currentSede;
            sedeSelect.disabled = false;
            sedeSelect.title = 'Seleccionar Sede';
        }
    }

    const tipoInvSelect = document.getElementById('item-tipo-inventario');
    if (tipoInvSelect) tipoInvSelect.value = appState.currentInventario;

    const codigoInput = document.getElementById('item-codigo');
    codigoInput.readOnly = false;
    codigoInput.classList.remove('bg-light');

    const autoBtn = document.getElementById('btn-auto-codigo');
    if (autoBtn) {
        autoBtn.disabled = false;
        autoBtn.style.display = '';
    }

    const helpEl = document.getElementById('item-codigo-help');
    if (helpEl) {
        helpEl.innerHTML = '<span class="text-muted"><i class="bi bi-info-circle me-1"></i>Código numérico único en el Catálogo Maestro</span>';
    }

    document.getElementById('modalNuevoItemTitle').innerHTML = `<i class="bi bi-plus-square-fill text-success me-2"></i>Alta de Ítem en Catálogo Maestro`;

    // Seleccionar la primera ubicación disponible por defecto
    const ubicacionSelect = document.getElementById('item-ubicacion');
    if (ubicacionSelect && ubicacionSelect.options.length > 0) {
        ubicacionSelect.selectedIndex = 0;
    }

    sugerirSiguienteCodigo();

    const modalEl = document.getElementById('modalNuevoItem');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function editarItem(codigo) {
    if (appState.currentUser?.rol === 'USUARIO' && !tienePermiso('CREAR_ITEMS')) {
        showToast('🔒 El rol USUARIO no tiene permiso para modificar ítems en el catálogo.', 'warning');
        return;
    }

    const item = appState.items.find(i => i.codigo === codigo);
    if (!item) return;

    // Sede y Tipo de Inventario
    const sedeSelect = document.getElementById('item-sede');
    if (sedeSelect) {
        if (!tienePermiso('ACCESO_MULTI_SEDE')) {
            const userSede = appState.currentUser?.sede || 'Sede Suroriental';
            sedeSelect.value = userSede;
            sedeSelect.disabled = true;
            sedeSelect.title = `🔒 Sede asignada: ${userSede} (Requiere permiso de Ver Sedes)`;
        } else {
            sedeSelect.value = item.sede || appState.currentSede;
            sedeSelect.disabled = false;
            sedeSelect.title = 'Seleccionar Sede';
        }
    }

    const tipoInvSelect = document.getElementById('item-tipo-inventario');
    if (tipoInvSelect) tipoInvSelect.value = item.tipo_inventario || appState.currentInventario;

    // 1. Bloqueo estricto del código: una vez creado el ítem NO se permite modificar el código
    const codigoInput = document.getElementById('item-codigo');
    codigoInput.value = item.codigo;
    codigoInput.readOnly = true;
    codigoInput.classList.add('bg-light');

    const autoBtn = document.getElementById('btn-auto-codigo');
    if (autoBtn) {
        autoBtn.disabled = true;
        autoBtn.style.display = 'none';
    }

    const helpEl = document.getElementById('item-codigo-help');
    if (helpEl) {
        helpEl.innerHTML = '<span class="text-danger fw-semibold"><i class="bi bi-lock-fill me-1"></i>Código bloqueado (no modificable)</span>';
    }

    document.getElementById('item-nombre').value = item.nombre;
    document.getElementById('item-categoria').value = item.categoria;
    document.getElementById('item-subcategoria').value = item.subcategoria || 'General';
    document.getElementById('item-unidad').value = item.unidad_medida;
    document.getElementById('item-marca').value = item.marca || 'Generico';
    document.getElementById('item-referencia').value = item.referencia || '-';

    // 2. Selección de Ubicación garantizada
    const ubicacionSelect = document.getElementById('item-ubicacion');
    const itemUbicacion = item.ubicacion_cds || 'A1';
    if (ubicacionSelect) {
        const optionExists = Array.from(ubicacionSelect.options).some(opt => opt.value === itemUbicacion);
        if (!optionExists && itemUbicacion) {
            const opt = document.createElement('option');
            opt.value = itemUbicacion;
            opt.textContent = itemUbicacion;
            ubicacionSelect.appendChild(opt);
        }
        ubicacionSelect.value = itemUbicacion;
    }

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

    let sedeVal = document.getElementById('item-sede')?.value || appState.currentSede;
    if (!tienePermiso('ACCESO_MULTI_SEDE')) {
        sedeVal = appState.currentUser?.sede || 'Sede Suroriental';
    }

    const payload = {
        codigo,
        sede: sedeVal,
        tipo_inventario: document.getElementById('item-tipo-inventario')?.value || appState.currentInventario,
        nombre: document.getElementById('item-nombre').value.trim().toUpperCase(),
        categoria: document.getElementById('item-categoria').value,
        subcategoria: document.getElementById('item-subcategoria').value,
        unidad_medida: document.getElementById('item-unidad').value,
        marca: document.getElementById('item-marca').value,
        referencia: document.getElementById('item-referencia').value,
        ubicacion_cds: document.getElementById('item-ubicacion').value || 'A1',
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

        await recargarDatosContexto();
    } catch (err) {
        showToast(`Error al guardar ítem: ${err.message}`, 'danger');
    }
}

// ==============================================================
// 7. CONTROL DE VENCIMIENTOS Y ASISTENTE DE BAJAS
// ==============================================================
async function loadVencimientos() {
    try {
        const res = await fetch(`${API_BASE}/vencimientos?sede=${encodeURIComponent(appState.currentSede)}&tipo_inventario=${encodeURIComponent(appState.currentInventario)}`);
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

    // Auto-asignar responsable de la baja con el usuario activo
    const respBajas = document.getElementById('bajas-responsable');
    if (respBajas) {
        respBajas.value = getNombreUsuarioActual();
    }

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
            responsable: document.getElementById('bajas-responsable')?.value?.trim() || getNombreUsuarioActual(),
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

        await recargarDatosContexto();
    } catch (err) {
        showToast(`Error al ejecutar bajas: ${err.message}`, 'danger');
    }
}

// ==============================================================
// 7.1. TRASLADOS ENTRE BODEGAS CENTRALES Y TRASLADOS PENDIENTES
// ==============================================================
async function loadTraslados() {
    try {
        const search = document.getElementById('filter-traslados-search')?.value?.trim() || '';
        const params = new URLSearchParams();
        params.append('sede', appState.currentSede);
        params.append('tipo_inventario', appState.currentInventario);
        if (search) params.append('search', search);

        const res = await fetch(`${API_BASE}/traslados?${params.toString()}`);
        const result = await res.json();
        if (!result.success) return;

        appState.traslados = result.data;

        // Cálculos de KPIs de traslados para el contexto actual
        const entrantes = result.data.filter(t => t.sede_destino === appState.currentSede && t.tipo_inventario_destino === appState.currentInventario);
        const entrantesPendientes = entrantes.filter(t => t.estado === 'PENDIENTE');

        const salientes = result.data.filter(t => t.sede_origen === appState.currentSede && t.tipo_inventario_origen === appState.currentInventario);
        const salientesTransito = salientes.filter(t => t.estado === 'PENDIENTE');

        const aceptados = result.data.filter(t => t.estado === 'ACEPTADO');
        const rechazados = result.data.filter(t => t.estado === 'RECHAZADO');

        // Actualizar contadores en KPI Cards
        const kpiEntrantes = document.getElementById('kpi-traslados-entrantes');
        if (kpiEntrantes) kpiEntrantes.textContent = entrantesPendientes.length;

        const kpiSalientes = document.getElementById('kpi-traslados-salientes');
        if (kpiSalientes) kpiSalientes.textContent = salientesTransito.length;

        const kpiAceptados = document.getElementById('kpi-traslados-aceptados');
        if (kpiAceptados) kpiAceptados.textContent = aceptados.length;

        const kpiRechazados = document.getElementById('kpi-traslados-rechazados');
        if (kpiRechazados) kpiRechazados.textContent = rechazados.length;

        // Badges en las pestañas internas
        const tabBadgeEntrantes = document.getElementById('tab-badge-entrantes');
        if (tabBadgeEntrantes) {
            tabBadgeEntrantes.textContent = entrantesPendientes.length;
            tabBadgeEntrantes.style.display = entrantesPendientes.length > 0 ? 'inline-block' : 'none';
        }

        const tabBadgeSalientes = document.getElementById('tab-badge-salientes');
        if (tabBadgeSalientes) {
            tabBadgeSalientes.textContent = salientesTransito.length;
            tabBadgeSalientes.style.display = salientesTransito.length > 0 ? 'inline-block' : 'none';
        }

        // Renderizar tablas
        renderTrasladosEntrantesTable(entrantes);
        renderTrasladosSalientesTable(salientes);
        renderHistoricoTrasladosTable(result.data);
    } catch (err) {
        console.error('Error al cargar traslados:', err);
    }
}

function renderTrasladosEntrantesTable(traslados) {
    const tbody = document.getElementById('table-traslados-entrantes-body');
    if (!tbody) return;

    if (traslados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No hay traslados entrantes registrados para ${appState.currentSede} (${appState.currentInventario}).</td></tr>`;
        return;
    }

    tbody.innerHTML = traslados.map(t => {
        let badgeEstado = 'bg-warning text-dark';
        if (t.estado === 'ACEPTADO') badgeEstado = 'bg-success';
        if (t.estado === 'RECHAZADO') badgeEstado = 'bg-danger';
        if (t.estado === 'CANCELADO') badgeEstado = 'bg-secondary';

        const esPendiente = t.estado === 'PENDIENTE';

        return `
            <tr class="${esPendiente ? 'table-warning bg-opacity-25 fw-semibold' : ''}">
                <td><strong class="text-primary font-monospace">${t.n_traslado}</strong></td>
                <td>
                    <div>${t.fecha_solicitud}</div>
                    <small class="text-muted">${t.hora_solicitud}</small>
                </td>
                <td>
                    <div class="fw-bold text-dark"><i class="bi bi-geo-alt-fill text-danger me-1"></i>${t.sede_origen}</div>
                    <span class="badge bg-primary bg-opacity-10 text-primary border">${t.tipo_inventario_origen}</span>
                </td>
                <td>
                    <strong class="text-dark">${t.codigo_item}</strong> - ${t.nombre_item}
                </td>
                <td class="text-end fw-bold text-primary fs-6">${t.cantidad} ${t.unidad}</td>
                <td>
                    <div>${t.responsable_solicita}</div>
                    <small class="text-muted font-monospace">${t.documento_referencia || '-'}</small>
                </td>
                <td class="small text-muted">${t.observaciones || '-'}</td>
                <td class="text-center">
                    <span class="badge ${badgeEstado} px-2 py-1">${t.estado}</span>
                </td>
                <td class="text-center">
                    ${esPendiente ? `
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-success btn-sm px-2 py-1 shadow-sm" onclick="abrirModalAceptarTraslado(${t.id})" title="Aceptar y recibir en esta bodega central">
                                <i class="bi bi-check-lg me-1"></i> Aceptar
                            </button>
                            <button class="btn btn-outline-danger btn-sm px-2 py-1" onclick="abrirModalRechazarTraslado(${t.id})" title="Rechazar traslado">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    ` : `
                        <small class="text-muted">${t.fecha_resolucion || 'Procesado'}</small>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

function renderTrasladosSalientesTable(traslados) {
    const tbody = document.getElementById('table-traslados-salientes-body');
    if (!tbody) return;

    if (traslados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-muted">No se han emitido traslados salientes desde ${appState.currentSede} (${appState.currentInventario}).</td></tr>`;
        return;
    }

    tbody.innerHTML = traslados.map(t => {
        let badgeEstado = 'bg-warning text-dark';
        if (t.estado === 'ACEPTADO') badgeEstado = 'bg-success';
        if (t.estado === 'RECHAZADO') badgeEstado = 'bg-danger';
        if (t.estado === 'CANCELADO') badgeEstado = 'bg-secondary';

        const esPendiente = t.estado === 'PENDIENTE';

        return `
            <tr>
                <td><strong class="text-primary font-monospace">${t.n_traslado}</strong></td>
                <td>
                    <div>${t.fecha_solicitud}</div>
                    <small class="text-muted">${t.hora_solicitud}</small>
                </td>
                <td>
                    <div class="fw-bold text-dark"><i class="bi bi-geo-alt-fill text-danger me-1"></i>${t.sede_destino}</div>
                    <span class="badge bg-info bg-opacity-10 text-info border">${t.tipo_inventario_destino}</span>
                </td>
                <td>
                    <strong class="text-dark">${t.codigo_item}</strong> - ${t.nombre_item}
                </td>
                <td class="text-end fw-bold text-dark fs-6">${t.cantidad} ${t.unidad}</td>
                <td>${t.responsable_solicita}</td>
                <td class="font-monospace small">${t.documento_referencia || '-'}</td>
                <td class="small text-muted">${t.observaciones || '-'}</td>
                <td class="text-center">
                    <span class="badge ${badgeEstado} px-2 py-1">${t.estado}</span>
                </td>
                <td class="text-center">
                    ${esPendiente ? `
                        <button class="btn btn-outline-secondary btn-sm px-2 py-0" onclick="cancelarTraslado(${t.id})" title="Cancelar solicitud de traslado">
                            <i class="bi bi-slash-circle me-1"></i> Cancelar
                        </button>
                    ` : `
                        <small class="text-muted">${t.responsable_recibe ? 'Recibido por ' + t.responsable_recibe : '-'}</small>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

function renderHistoricoTrasladosTable(traslados) {
    const tbody = document.getElementById('table-traslados-historico-body');
    if (!tbody) return;

    if (traslados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No existen registros en el historial de traslados.</td></tr>`;
        return;
    }

    tbody.innerHTML = traslados.map(t => {
        let badgeEstado = 'bg-warning text-dark';
        if (t.estado === 'ACEPTADO') badgeEstado = 'bg-success';
        if (t.estado === 'RECHAZADO') badgeEstado = 'bg-danger';
        if (t.estado === 'CANCELADO') badgeEstado = 'bg-secondary';

        return `
            <tr>
                <td><strong class="text-primary font-monospace">${t.n_traslado}</strong></td>
                <td>
                    <div>${t.fecha_solicitud}</div>
                    <small class="text-muted">${t.hora_solicitud}</small>
                </td>
                <td>
                    <div class="small">
                        <strong class="text-primary">${t.sede_origen} [${t.tipo_inventario_origen}]</strong>
                        <i class="bi bi-arrow-right mx-1 text-muted"></i>
                        <strong class="text-success">${t.sede_destino} [${t.tipo_inventario_destino}]</strong>
                    </div>
                </td>
                <td><strong>${t.codigo_item}</strong> - ${t.nombre_item}</td>
                <td class="text-end fw-bold">${t.cantidad} ${t.unidad}</td>
                <td>
                    <div class="small"><span class="text-muted">Emisor:</span> ${t.responsable_solicita}</div>
                    ${t.responsable_recibe ? `<div class="small"><span class="text-muted">Receptor:</span> ${t.responsable_recibe}</div>` : ''}
                </td>
                <td class="text-center">
                    <span class="badge ${badgeEstado} px-2 py-1">${t.estado}</span>
                </td>
                <td class="small">
                    <div>${t.fecha_resolucion || 'Pendiente'}</div>
                    ${t.motivo_rechazo ? `<small class="text-danger">${t.motivo_rechazo}</small>` : ''}
                </td>
                <td class="small font-monospace">
                    ${t.n_movimiento_salida ? `<div><span class="text-danger">Salida:</span> ${t.n_movimiento_salida}</div>` : ''}
                    ${t.n_movimiento_entrada ? `<div><span class="text-success">Entrada:</span> ${t.n_movimiento_entrada}</div>` : ''}
                    ${!t.n_movimiento_salida && !t.n_movimiento_entrada ? '<span class="text-muted">-</span>' : ''}
                </td>
            </tr>
        `;
    }).join('');
}

async function actualizarBadgesTraslados() {
    try {
        const res = await fetch(`${API_BASE}/traslados/pendientes-count`);
        const result = await res.json();
        if (!result.success || !result.data) return;

        let totalCds = 0;
        let totalMovilidad = 0;

        result.data.forEach(c => {
            if (c.sede_destino === appState.currentSede) {
                if (c.tipo_inventario_destino === 'CDS') totalCds += c.total_pendientes;
                if (c.tipo_inventario_destino === 'MOVILIDAD') totalMovilidad += c.total_pendientes;
            }
        });

        const badgeCds = document.getElementById('sidebar-badge-traslados-cds');
        if (badgeCds) {
            badgeCds.textContent = totalCds;
            badgeCds.style.display = totalCds > 0 ? 'inline-block' : 'none';
        }

        const badgeMov = document.getElementById('sidebar-badge-traslados-movilidad');
        if (badgeMov) {
            badgeMov.textContent = totalMovilidad;
            badgeMov.style.display = totalMovilidad > 0 ? 'inline-block' : 'none';
        }
    } catch (err) {
        console.warn('Error al actualizar badges de traslados:', err);
    }
}

async function openModalNuevoTraslado() {
    if (appState.currentUser?.rol === 'USUARIO' && !tienePermiso('GESTIONAR_TRASLADOS')) {
        showToast('🔒 El rol USUARIO no tiene permiso para solicitar o gestionar traslados.', 'warning');
        return;
    }

    const form = document.getElementById('form-nuevo-traslado');
    if (form) form.reset();

    // Asegurar que la configuración esté cargada
    if (!appState.config || !appState.config.sedes) {
        await loadConfig();
    }

    // 1. Origen configurado con la sede e inventario activos
    const origenSede = appState.currentSede || 'Sede Suroriental';
    const origenInv = appState.currentInventario || 'CDS';

    document.getElementById('tras-origen-sede-label').textContent = origenSede;
    document.getElementById('tras-origen-sede').value = origenSede;

    const invNombre = origenInv === 'MOVILIDAD' ? 'Inventario Movilidad' : 'Inventario CDS';
    document.getElementById('tras-origen-inv-label').textContent = invNombre;
    document.getElementById('tras-origen-tipo-inv').value = origenInv;

    // 2. Destino: todas las bodegas centrales posibles excepto el origen exacto
    const sedes = (appState.config && appState.config.sedes && appState.config.sedes.length > 0)
        ? appState.config.sedes
        : [{ nombre: 'Sede Suroriental' }, { nombre: 'Sede Medellín' }];

    const tiposInv = (appState.config && appState.config.tipos_inventario && appState.config.tipos_inventario.length > 0)
        ? appState.config.tipos_inventario
        : [{ codigo: 'CDS', nombre: 'Inventario CDS' }, { codigo: 'MOVILIDAD', nombre: 'Inventario Movilidad' }];

    const destinoSelect = document.getElementById('tras-destino-select');
    if (destinoSelect) {
        let html = '<option value="">-- Seleccionar Bodega Central Destino --</option>';
        let countDestinos = 0;
        sedes.forEach(s => {
            tiposInv.forEach(t => {
                const sNombre = s.nombre;
                const tCodigo = t.codigo;
                const tNombre = t.nombre || (tCodigo === 'MOVILIDAD' ? 'Inventario Movilidad' : 'Inventario CDS');
                const esMismoOrigen = (sNombre === origenSede && tCodigo === origenInv);
                
                // REGLA: No se puede realizar un traslado a su misma bodega central de origen
                if (!esMismoOrigen) {
                    html += `<option value="${sNombre}|${tCodigo}">${sNombre} • ${tNombre} (Bodega Central)</option>`;
                    countDestinos++;
                }
            });
        });

        if (countDestinos === 0) {
            html += '<option value="" disabled>No hay otras bodegas centrales disponibles</option>';
        }

        destinoSelect.innerHTML = html;
    }

    // 3. Llenar ítems del catálogo maestro
    if (!appState.items || appState.items.length === 0) {
        await loadItems();
    }

    const itemSelect = document.getElementById('tras-item-select');
    if (itemSelect) {
        let html = '<option value="">-- Seleccionar Ítem del Catálogo Maestro --</option>';
        (appState.items || []).filter(i => i.estado === 'Activo').forEach(item => {
            html += `<option value="${item.codigo}">${item.codigo} - ${item.nombre}</option>`;
        });
        itemSelect.innerHTML = html;
    }

    // 4. Ocultar info de ítem y resetear botón
    const infoDiv = document.getElementById('tras-item-info');
    if (infoDiv) infoDiv.style.display = 'none';

    // Auto-asignar solicitante/emisor del traslado con el usuario activo
    const solicitanteInput = document.getElementById('tras-solicitante');
    if (solicitanteInput) {
        solicitanteInput.value = getNombreUsuarioActual();
    }

    const btnSubmit = document.getElementById('btn-submit-traslado');
    if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="bi bi-send-fill me-1"></i> Emitir Traslado Pendiente';
    }

    const modalEl = document.getElementById('modalNuevoTraslado');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function handleItemSelectInTraslado(codigo) {
    const item = appState.items.find(i => String(i.codigo) === String(codigo));
    const infoDiv = document.getElementById('tras-item-info');
    const unidadLabel = document.getElementById('tras-unidad-label');

    if (!item) {
        if (infoDiv) infoDiv.style.display = 'none';
        return;
    }

    document.getElementById('tras-preview-nombre').textContent = item.nombre;
    document.getElementById('tras-preview-ubicacion').textContent = item.ubicacion_cds || 'A1';
    if (unidadLabel) unidadLabel.textContent = item.unidad_medida;

    infoDiv.style.display = 'block';
    actualizarStockPreviewEnTraslado();
}

async function actualizarStockPreviewEnTraslado() {
    const selectedCode = document.getElementById('tras-item-select')?.value;
    if (!selectedCode) return;

    const item = appState.items.find(i => String(i.codigo) === String(selectedCode));
    if (!item) return;

    const badgeEl = document.getElementById('tras-preview-stock');
    const labelEl = document.getElementById('tras-preview-stock-label');

    try {
        const res = await fetch(`${API_BASE}/inventario/stock-bodega?codigo_item=${selectedCode}&bodega=CDS&sede=${encodeURIComponent(appState.currentSede)}&tipo_inventario=${encodeURIComponent(appState.currentInventario)}`);
        const result = await res.json();
        const stockActual = result.success ? result.stock : 0;

        if (labelEl) {
            labelEl.textContent = `Stock en ${appState.currentSede} [${appState.currentInventario}]:`;
        }

        if (badgeEl) {
            if (stockActual <= 0) {
                badgeEl.className = 'badge bg-danger fs-6';
                badgeEl.textContent = `0 ${item.unidad_medida} (Sin existencias)`;
            } else {
                badgeEl.className = 'badge bg-success fs-6';
                badgeEl.textContent = `${stockActual} ${item.unidad_medida}`;
            }
        }

        validarCantidadTraslado(stockActual);
    } catch (err) {
        console.warn('Error al consultar stock de origen:', err);
    }
}

function validarCantidadTraslado(stockVal = null) {
    const cantInput = document.getElementById('tras-cantidad');
    const badgeEl = document.getElementById('tras-preview-stock');
    if (!cantInput || !badgeEl) return;

    const stockText = badgeEl.textContent;
    const stockAvailable = stockVal !== null ? stockVal : parseFloat(stockText);
    const cant = parseFloat(cantInput.value) || 0;

    if (!isNaN(stockAvailable) && cant > stockAvailable) {
        cantInput.classList.add('is-invalid');
    } else {
        cantInput.classList.remove('is-invalid');
    }
}

async function submitNuevoTraslado(e) {
    e.preventDefault();

    const destinoRaw = document.getElementById('tras-destino-select').value;
    if (!destinoRaw || !destinoRaw.includes('|')) {
        showToast('⚠️ Debe seleccionar una bodega central de destino válida.', 'warning');
        return;
    }

    const [sede_destino, tipo_inventario_destino] = destinoRaw.split('|');
    const codigo_item = parseInt(document.getElementById('tras-item-select').value, 10);
    const cantidad = parseFloat(document.getElementById('tras-cantidad').value);
    const responsable_solicita = document.getElementById('tras-solicitante')?.value?.trim() || getNombreUsuarioActual();
    const documento_referencia = document.getElementById('tras-doc-ref').value.trim();
    const observaciones = document.getElementById('tras-observaciones').value.trim();

    const payload = {
        sede_origen: appState.currentSede,
        tipo_inventario_origen: appState.currentInventario,
        sede_destino,
        tipo_inventario_destino,
        codigo_item,
        cantidad,
        responsable_solicita,
        documento_referencia,
        observaciones
    };

    const submitBtn = document.getElementById('btn-submit-traslado');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Emitiendo...';
    }

    try {
        const res = await fetch(`${API_BASE}/traslados`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="bi bi-send-fill me-1"></i> Emitir Traslado Pendiente';
            }
            return;
        }

        closeModal('modalNuevoTraslado');
        showToast(`✅ ${result.message}`, 'success');

        await recargarDatosContexto();
    } catch (err) {
        showToast(`Error al emitir traslado: ${err.message}`, 'danger');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-send-fill me-1"></i> Emitir Traslado Pendiente';
        }
    }
}

function abrirModalAceptarTraslado(id) {
    const traslado = appState.traslados.find(t => t.id === id);
    if (!traslado) return;

    document.getElementById('aceptar-tras-id').value = traslado.id;
    document.getElementById('aceptar-tras-n').textContent = traslado.n_traslado;
    document.getElementById('aceptar-tras-fecha').textContent = `${traslado.fecha_solicitud} ${traslado.hora_solicitud}`;
    document.getElementById('aceptar-tras-origen').textContent = `${traslado.sede_origen} [${traslado.tipo_inventario_origen}]`;
    document.getElementById('aceptar-tras-destino').textContent = `${traslado.sede_destino} [${traslado.tipo_inventario_destino}]`;
    document.getElementById('aceptar-tras-item').textContent = `${traslado.codigo_item} - ${traslado.nombre_item}`;
    document.getElementById('aceptar-tras-cantidad').textContent = `${traslado.cantidad} ${traslado.unidad}`;
    document.getElementById('aceptar-tras-emisor').textContent = traslado.responsable_solicita;

    const respInput = document.getElementById('aceptar-tras-responsable');
    if (respInput) respInput.value = getNombreUsuarioActual();

    const modalEl = document.getElementById('modalAceptarTraslado');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function ejecutarAceptarTraslado(e) {
    e.preventDefault();

    const id = document.getElementById('aceptar-tras-id').value;
    const responsable_recibe = document.getElementById('aceptar-tras-responsable')?.value?.trim() || getNombreUsuarioActual();

    if (!responsable_recibe) {
        showToast('⚠️ Ingrese el nombre del responsable que recibe el material.', 'warning');
        return;
    }

    const submitBtn = document.getElementById('btn-confirmar-aceptar-tras');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Procesando...';
    }

    try {
        const res = await fetch(`${API_BASE}/traslados/${id}/aceptar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ responsable_recibe })
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Confirmar y Aceptar Traslado';
            }
            return;
        }

        closeModal('modalAceptarTraslado');
        showToast(`✅ ${result.message}`, 'success');

        await recargarDatosContexto();
    } catch (err) {
        showToast(`Error al aceptar traslado: ${err.message}`, 'danger');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Confirmar y Aceptar Traslado';
        }
    }
}

function abrirModalRechazarTraslado(id) {
    const traslado = appState.traslados.find(t => t.id === id);
    if (!traslado) return;

    document.getElementById('rechazar-tras-id').value = traslado.id;
    document.getElementById('rechazar-tras-n').textContent = traslado.n_traslado;
    document.getElementById('rechazar-tras-item').textContent = `${traslado.codigo_item} - ${traslado.nombre_item}`;
    document.getElementById('rechazar-tras-ruta').textContent = `${traslado.sede_origen} [${traslado.tipo_inventario_origen}] ➔ ${traslado.sede_destino} [${traslado.tipo_inventario_destino}]`;
    document.getElementById('rechazar-tras-cantidad').textContent = `${traslado.cantidad} ${traslado.unidad}`;

    const motivoInput = document.getElementById('rechazar-tras-motivo');
    if (motivoInput) motivoInput.value = '';

    const respInput = document.getElementById('rechazar-tras-responsable');
    if (respInput) respInput.value = getNombreUsuarioActual();

    const modalEl = document.getElementById('modalRechazarTraslado');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function ejecutarRechazarTraslado(e) {
    e.preventDefault();

    const id = document.getElementById('rechazar-tras-id').value;
    const motivo_rechazo = document.getElementById('rechazar-tras-motivo').value.trim();
    const responsable_recibe = document.getElementById('rechazar-tras-responsable')?.value?.trim() || getNombreUsuarioActual();

    if (!motivo_rechazo) {
        showToast('⚠️ Debe indicar el motivo del rechazo del traslado.', 'warning');
        return;
    }

    const submitBtn = document.getElementById('btn-confirmar-rechazar-tras');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Rechazando...';
    }

    try {
        const res = await fetch(`${API_BASE}/traslados/${id}/rechazar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo_rechazo, responsable_recibe })
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="bi bi-x-octagon-fill me-1"></i> Confirmar Rechazo';
            }
            return;
        }

        closeModal('modalRechazarTraslado');
        showToast(`ℹ️ ${result.message}`, 'warning');

        await recargarDatosContexto();
    } catch (err) {
        showToast(`Error al rechazar traslado: ${err.message}`, 'danger');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-x-octagon-fill me-1"></i> Confirmar Rechazo';
        }
    }
}

async function cancelarTraslado(id) {
    const traslado = appState.traslados.find(t => t.id === id);
    if (!traslado) return;

    if (!confirm(`¿Está seguro de que desea cancelar la solicitud de traslado ${traslado.n_traslado}?`)) {
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/traslados/${id}/cancelar`, {
            method: 'POST'
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            return;
        }

        showToast(`✅ ${result.message}`, 'info');
        await recargarDatosContexto();
    } catch (err) {
        showToast(`Error al cancelar traslado: ${err.message}`, 'danger');
    }
}

// ==============================================================
// 8. BODEGAS Y PROYECTOS
// ==============================================================
function sincronizarFiltrosBodegasConContexto() {
    const sedeFilter = document.getElementById('filter-bodegas-sede');
    const invFilter = document.getElementById('filter-bodegas-inv');
    if (sedeFilter) sedeFilter.value = appState.currentSede;
    if (invFilter) invFilter.value = appState.currentInventario;
    loadBodegasYProyectos();
}

async function loadBodegasYProyectos() {
    try {
        const sedeFilterEl = document.getElementById('filter-bodegas-sede');
        const invFilterEl = document.getElementById('filter-bodegas-inv');

        const sede = sedeFilterEl ? sedeFilterEl.value : 'TODAS';
        const tipo_inventario = invFilterEl ? invFilterEl.value : 'TODOS';

        const params = new URLSearchParams();
        if (sede && sede !== 'TODAS' && sede !== 'ALL') params.append('sede', sede);
        if (tipo_inventario && tipo_inventario !== 'TODOS' && tipo_inventario !== 'ALL') params.append('tipo_inventario', tipo_inventario);

        const [resBod, resProy] = await Promise.all([
            fetch(`${API_BASE}/bodegas?${params.toString()}`),
            fetch(`${API_BASE}/proyectos?${params.toString()}`)
        ]);

        const dataBod = await resBod.json();
        const dataProy = await resProy.json();

        if (dataBod.success) {
            appState.bodegas = dataBod.data;
            const badgeEl = document.getElementById('badge-count-bodegas');
            if (badgeEl) badgeEl.textContent = dataBod.data.length;
            renderBodegasTable(dataBod.data);
        }

        if (dataProy.success) {
            appState.proyectos = dataProy.data;
            const badgeEl = document.getElementById('badge-count-proyectos');
            if (badgeEl) badgeEl.textContent = dataProy.data.length;
            renderProyectosTable(dataProy.data);
        }

        // Cargar Categorías y Ubicaciones del Inventario
        await loadCategorias();
        await loadUbicaciones();
    } catch (err) {
        console.error('Error al cargar bodegas, proyectos, categorías y ubicaciones:', err);
    }
}

function renderBodegasTable(bodegas) {
    const tbody = document.getElementById('table-bodegas-body');
    if (!tbody) return;

    if (!bodegas || bodegas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No se encontraron bodegas para los filtros seleccionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = bodegas.map(b => {
        const esCentral = b.es_central === 1 || b.codigo === 'BOD-001';
        return `
            <tr>
                <td><span class="badge bg-light text-primary border font-monospace fw-bold fs-6">${b.codigo}</span></td>
                <td>
                    <div class="fw-bold text-dark d-flex align-items-center flex-wrap gap-1">
                        <span>${b.nombre}</span>
                        ${esCentral ? '<span class="badge bg-primary shadow-sm small" style="font-size: 0.72rem;"><i class="bi bi-star-fill text-warning me-1"></i>Central</span>' : ''}
                    </div>
                    ${b.observaciones ? `<small class="text-muted">${b.observaciones}</small>` : ''}
                </td>
                <td><i class="bi bi-geo-alt text-muted me-1"></i>${b.ubicacion || 'No especificada'}</td>
                <td>
                    <div class="fw-semibold text-dark"><i class="bi bi-geo-alt-fill text-danger me-1"></i>${b.sede || 'Global'}</div>
                </td>
                <td>
                    <span class="badge bg-info bg-opacity-10 text-info border">${b.tipo_inventario || 'CDS'}</span>
                </td>
                <td>${b.responsable || '<span class="text-muted">-</span>'}</td>
                <td class="text-center">
                    <span class="badge ${b.estado === 'Activa' ? 'bg-success' : 'bg-secondary'} px-2 py-1">${b.estado}</span>
                </td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary btn-sm py-1 px-2 shadow-xs" onclick="editarBodega('${b.codigo}')" title="Modificar Bodega">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        ${esCentral ? `
                            <button class="btn btn-outline-secondary btn-sm py-1 px-2" disabled title="La Bodega Central no se puede eliminar (Solo modificar)">
                                <i class="bi bi-lock-fill"></i>
                            </button>
                        ` : `
                            <button class="btn btn-outline-danger btn-sm py-1 px-2 shadow-xs" onclick="abrirModalEliminarBodega('${b.codigo}')" title="Eliminar Bodega">
                                <i class="bi bi-trash3"></i>
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filtrarTablaBodegasUI(query) {
    const q = (query || '').toLowerCase().trim();
    if (!appState.bodegas) return;
    if (!q) {
        renderBodegasTable(appState.bodegas);
        return;
    }
    const filtrados = appState.bodegas.filter(b => 
        (b.codigo && b.codigo.toLowerCase().includes(q)) ||
        (b.nombre && b.nombre.toLowerCase().includes(q)) ||
        (b.ubicacion && b.ubicacion.toLowerCase().includes(q)) ||
        (b.responsable && b.responsable.toLowerCase().includes(q)) ||
        (b.sede && b.sede.toLowerCase().includes(q))
    );
    renderBodegasTable(filtrados);
}

function renderProyectosTable(proyectos) {
    const tbody = document.getElementById('table-proyectos-body');
    if (!tbody) return;

    if (!proyectos || proyectos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No se encontraron proyectos o destinos finales para los filtros seleccionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = proyectos.map(p => `
        <tr>
            <td><span class="badge bg-light text-secondary border font-monospace fw-bold">#${p.id}</span></td>
            <td>
                <div class="fw-bold text-dark">${p.nombre}</div>
            </td>
            <td>
                <small class="text-muted">${p.observaciones || '-'}</small>
            </td>
            <td>
                <div class="fw-semibold text-dark"><i class="bi bi-geo-alt-fill text-danger me-1"></i>${p.sede || 'Global'}</div>
            </td>
            <td>
                <span class="badge bg-warning bg-opacity-10 text-dark border">${p.tipo_inventario || 'CDS'}</span>
            </td>
            <td>${p.responsable || '<span class="text-muted">-</span>'}</td>
            <td class="text-center">
                <span class="badge ${p.estado === 'Activo' ? 'bg-success' : 'bg-secondary'} px-2 py-1">${p.estado}</span>
            </td>
            <td class="text-center">
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary btn-sm py-1 px-2 shadow-xs" onclick="editarProyecto(${p.id})" title="Modificar Proyecto">
                        <i class="bi bi-pencil-square"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm py-1 px-2 shadow-xs" onclick="abrirModalEliminarProyecto(${p.id})" title="Eliminar Proyecto">
                        <i class="bi bi-trash3"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filtrarTablaProyectosUI(query) {
    const q = (query || '').toLowerCase().trim();
    if (!appState.proyectos) return;
    if (!q) {
        renderProyectosTable(appState.proyectos);
        return;
    }
    const filtrados = appState.proyectos.filter(p => 
        String(p.id).includes(q) ||
        (p.nombre && p.nombre.toLowerCase().includes(q)) ||
        (p.observaciones && p.observaciones.toLowerCase().includes(q)) ||
        (p.responsable && p.responsable.toLowerCase().includes(q)) ||
        (p.sede && p.sede.toLowerCase().includes(q))
    );
    renderProyectosTable(filtrados);
}

async function openModalNuevaBodega() {
    if (appState.currentUser?.rol === 'USUARIO' && !tienePermiso('ADMINISTRAR_BODEGAS')) {
        showToast('🔒 El rol USUARIO no tiene permiso para crear bodegas.', 'warning');
        return;
    }

    document.getElementById('form-bodega').reset();
    document.getElementById('bod-is-edit').value = '0';
    document.getElementById('modalBodegaTitle').innerHTML = '<i class="bi bi-building-add text-secondary me-2"></i>Nueva Bodega (Autogenerada)';
    
    // Setear Sede y Tipo de Inventario por defecto al contexto actual
    const sedeSelect = document.getElementById('bod-sede');
    if (sedeSelect) {
        if (!tienePermiso('ACCESO_MULTI_SEDE')) {
            const userSede = appState.currentUser?.sede || 'Sede Suroriental';
            sedeSelect.value = userSede;
            sedeSelect.disabled = true;
            sedeSelect.title = `🔒 Sede asignada: ${userSede} (Requiere permiso de Ver Sedes)`;
        } else {
            sedeSelect.value = appState.currentSede;
            sedeSelect.disabled = false;
            sedeSelect.title = 'Seleccionar Sede';
        }
    }

    const invSelect = document.getElementById('bod-tipo-inventario');
    if (invSelect) invSelect.value = appState.currentInventario;

    const bodResp = document.getElementById('bod-responsable');
    if (bodResp) bodResp.value = getNombreUsuarioActual();

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

    const sedeSelect = document.getElementById('bod-sede');
    if (sedeSelect) {
        if (!tienePermiso('ACCESO_MULTI_SEDE')) {
            const userSede = appState.currentUser?.sede || 'Sede Suroriental';
            sedeSelect.value = userSede;
            sedeSelect.disabled = true;
            sedeSelect.title = `🔒 Sede asignada: ${userSede} (Requiere permiso de Ver Sedes)`;
        } else {
            sedeSelect.value = bodega.sede || appState.currentSede;
            sedeSelect.disabled = false;
            sedeSelect.title = 'Seleccionar Sede';
        }
    }

    const invSelect = document.getElementById('bod-tipo-inventario');
    if (invSelect) invSelect.value = bodega.tipo_inventario || appState.currentInventario;

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

    let sedeVal = document.getElementById('bod-sede')?.value || appState.currentSede;
    if (!tienePermiso('ACCESO_MULTI_SEDE')) {
        sedeVal = appState.currentUser?.sede || 'Sede Suroriental';
    }

    const payload = {
        isEdit,
        codigo: document.getElementById('bod-codigo').value.trim().toUpperCase(),
        nombre: document.getElementById('bod-nombre').value.trim().toUpperCase(),
        ubicacion: document.getElementById('bod-ubicacion').value,
        responsable: document.getElementById('bod-responsable').value,
        estado: document.getElementById('bod-estado').value,
        observaciones: document.getElementById('bod-obs').value,
        sede: sedeVal,
        tipo_inventario: document.getElementById('bod-tipo-inventario')?.value || appState.currentInventario
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
    if (appState.currentUser?.rol === 'USUARIO' && !tienePermiso('ADMINISTRAR_BODEGAS')) {
        showToast('🔒 El rol USUARIO no tiene permiso para crear proyectos o frentes de obra.', 'warning');
        return;
    }

    document.getElementById('form-proyecto').reset();
    document.getElementById('proy-id').value = '';
    document.getElementById('modalProyectoTitle').innerHTML = '<i class="bi bi-cone-striped text-warning me-2"></i>Nuevo Frente / Proyecto';

    const sedeSelect = document.getElementById('proy-sede');
    if (sedeSelect) {
        if (!tienePermiso('ACCESO_MULTI_SEDE')) {
            const userSede = appState.currentUser?.sede || 'Sede Suroriental';
            sedeSelect.value = userSede;
            sedeSelect.disabled = true;
            sedeSelect.title = `🔒 Sede asignada: ${userSede} (Requiere permiso de Ver Sedes)`;
        } else {
            sedeSelect.value = appState.currentSede;
            sedeSelect.disabled = false;
            sedeSelect.title = 'Seleccionar Sede';
        }
    }

    const invSelect = document.getElementById('proy-tipo-inventario');
    if (invSelect) invSelect.value = appState.currentInventario;

    const proyResp = document.getElementById('proy-responsable');
    if (proyResp) proyResp.value = getNombreUsuarioActual();

    const modalEl = document.getElementById('modalNuevoProyecto');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function editarProyecto(id) {
    if (!appState.proyectos) return;
    const proy = appState.proyectos.find(p => p.id === id);
    if (!proy) return;

    document.getElementById('form-proyecto').reset();
    document.getElementById('proy-id').value = proy.id;
    document.getElementById('proy-nombre').value = proy.nombre;
    document.getElementById('proy-responsable').value = proy.responsable || '';
    document.getElementById('proy-estado').value = proy.estado || 'Activo';
    document.getElementById('proy-obs').value = proy.observaciones || '';

    const sedeSelect = document.getElementById('proy-sede');
    if (sedeSelect) {
        if (!tienePermiso('ACCESO_MULTI_SEDE')) {
            const userSede = appState.currentUser?.sede || 'Sede Suroriental';
            sedeSelect.value = userSede;
            sedeSelect.disabled = true;
            sedeSelect.title = `🔒 Sede asignada: ${userSede} (Requiere permiso de Ver Sedes)`;
        } else {
            sedeSelect.value = proy.sede || appState.currentSede;
            sedeSelect.disabled = false;
            sedeSelect.title = 'Seleccionar Sede';
        }
    }

    const invSelect = document.getElementById('proy-tipo-inventario');
    if (invSelect) invSelect.value = proy.tipo_inventario || appState.currentInventario;

    document.getElementById('modalProyectoTitle').innerHTML = `<i class="bi bi-pencil-square text-warning me-2"></i>Modificar Proyecto (#${proy.id})`;

    const modalEl = document.getElementById('modalNuevoProyecto');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function submitProyecto(e) {
    e.preventDefault();

    let sedeVal = document.getElementById('proy-sede')?.value || appState.currentSede;
    if (!tienePermiso('ACCESO_MULTI_SEDE')) {
        sedeVal = appState.currentUser?.sede || 'Sede Suroriental';
    }

    const payload = {
        id: document.getElementById('proy-id').value || null,
        nombre: document.getElementById('proy-nombre').value.trim(),
        responsable: document.getElementById('proy-responsable').value,
        estado: document.getElementById('proy-estado').value,
        observaciones: document.getElementById('proy-obs').value,
        sede: sedeVal,
        tipo_inventario: document.getElementById('proy-tipo-inventario')?.value || appState.currentInventario
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

function abrirModalEliminarProyecto(id) {
    if (!appState.proyectos) return;
    const proy = appState.proyectos.find(p => p.id === id);
    if (!proy) return;

    document.getElementById('del-proy-id-input').value = proy.id;
    document.getElementById('del-proy-id-text').textContent = `#${proy.id}`;
    document.getElementById('del-proy-nombre').textContent = proy.nombre;
    document.getElementById('del-proy-responsable').textContent = proy.responsable || 'No asignado';
    document.getElementById('del-proy-estado').textContent = proy.estado || 'Activo';

    const btn = document.getElementById('btn-confirmar-eliminar-proy');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar Proyecto';
    }

    const modalEl = document.getElementById('modalEliminarProyecto');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function ejecutarEliminarProyecto() {
    const id = document.getElementById('del-proy-id-input').value;
    if (!id) return;

    const btn = document.getElementById('btn-confirmar-eliminar-proy');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Eliminando...';
    }

    try {
        const res = await fetch(`${API_BASE}/proyectos/${id}`, {
            method: 'DELETE'
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar Proyecto';
            }
            return;
        }

        closeModal('modalEliminarProyecto');
        showToast(`✅ ${result.message}`, 'success');

        await loadBodegasYProyectos();
        await loadConfig();
    } catch (err) {
        showToast(`Error al eliminar proyecto: ${err.message}`, 'danger');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar Proyecto';
        }
    }
}

// ==============================================================
// 8.3. GESTIÓN DE CATEGORÍAS DE INVENTARIO
// ==============================================================
async function loadCategorias() {
    try {
        const res = await fetch(`${API_BASE}/categorias`);
        const result = await res.json();
        if (result.success) {
            appState.categoriasList = result.data;
            const badgeEl = document.getElementById('badge-count-categorias');
            if (badgeEl) badgeEl.textContent = result.data.length;
            renderCategoriasTable(result.data);
        }
    } catch (err) {
        console.error('Error al cargar categorías:', err);
    }
}

function renderCategoriasTable(categorias) {
    const tbody = document.getElementById('table-categorias-body');
    if (!tbody) return;

    if (!categorias || categorias.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No hay categorías configuradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = categorias.map((c, index) => {
        const safeName = String(c.nombre || '').replace(/'/g, "\\'");
        return `
            <tr>
                <td><span class="badge bg-light text-secondary border font-monospace fw-bold">#${c.orden || (index + 1)}</span></td>
                <td>
                    <div class="fw-bold text-dark"><i class="bi bi-tag-fill text-success me-1"></i>${c.nombre}</div>
                </td>
                <td><small class="text-muted">${c.descripcion || 'Sin descripción'}</small></td>
                <td class="text-center">
                    <span class="badge ${c.total_items > 0 ? 'bg-primary-subtle text-primary border border-primary-subtle' : 'bg-secondary-subtle text-muted border'} px-2.5 py-1">
                        <i class="bi bi-box-seam me-1"></i>${c.total_items || 0} ítems
                    </span>
                </td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary btn-sm py-1 px-2 shadow-xs" onclick="editarCategoria(${c.id}, '${safeName}', ${c.orden || 0})" title="Modificar Categoría">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm py-1 px-2 shadow-xs" onclick="abrirModalEliminarCategoria(${c.id}, '${safeName}', ${c.total_items || 0})" title="Eliminar Categoría">
                            <i class="bi bi-trash3"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filtrarTablaCategoriasUI(query) {
    const q = (query || '').toLowerCase().trim();
    if (!appState.categoriasList) return;
    if (!q) {
        renderCategoriasTable(appState.categoriasList);
        return;
    }
    const filtrados = appState.categoriasList.filter(c => 
        (c.nombre && c.nombre.toLowerCase().includes(q)) ||
        (c.descripcion && c.descripcion.toLowerCase().includes(q)) ||
        String(c.orden).includes(q)
    );
    renderCategoriasTable(filtrados);
}

function openModalNuevaCategoria() {
    document.getElementById('form-categoria')?.reset();
    document.getElementById('cat-id').value = '';
    document.getElementById('modalCategoriaTitle').innerHTML = '<i class="bi bi-tags-fill me-2"></i>Nueva Categoría de Materiales';
    
    // Sugerir siguiente orden
    const list = appState.categoriasList || [];
    let maxOrd = 0;
    list.forEach(c => { if (c.orden && c.orden > maxOrd) maxOrd = c.orden; });
    document.getElementById('cat-orden').value = maxOrd + 1;

    const modalEl = document.getElementById('modalNuevaCategoria');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function editarCategoria(id, nombre, orden) {
    document.getElementById('form-categoria')?.reset();
    document.getElementById('cat-id').value = id;
    document.getElementById('cat-nombre').value = nombre;
    document.getElementById('cat-orden').value = orden || '';
    document.getElementById('modalCategoriaTitle').innerHTML = `<i class="bi bi-pencil-square me-2"></i>Modificar Categoría (${nombre})`;

    const modalEl = document.getElementById('modalNuevaCategoria');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function submitCategoria(e) {
    e.preventDefault();
    const id = document.getElementById('cat-id').value;
    const nombre = document.getElementById('cat-nombre').value.trim().toUpperCase();
    const orden = document.getElementById('cat-orden').value;

    if (!nombre) {
        showToast('El nombre de la categoría es obligatorio.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-guardar-categoria');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    try {
        const url = id ? `${API_BASE}/categorias/${id}` : `${API_BASE}/categorias`;
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, orden: parseInt(orden, 10) || undefined })
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Guardar Categoría';
            }
            return;
        }

        closeModal('modalNuevaCategoria');
        showToast(`✅ ${result.message}`, 'success');

        await loadConfig();
        await loadCategorias();
        if (typeof loadItems === 'function') loadItems();
        if (typeof loadInventario === 'function') loadInventario();
    } catch (err) {
        showToast(`Error al guardar categoría: ${err.message}`, 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Guardar Categoría';
        }
    }
}

function abrirModalEliminarCategoria(id, nombre, totalItems) {
    document.getElementById('del-cat-id-input').value = id;
    document.getElementById('del-cat-nombre').textContent = nombre;
    document.getElementById('del-cat-items').textContent = `${totalItems} ítem(s)`;

    const btn = document.getElementById('btn-confirmar-eliminar-cat');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar';
    }

    const modalEl = document.getElementById('modalEliminarCategoria');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function ejecutarEliminarCategoria() {
    const id = document.getElementById('del-cat-id-input').value;
    if (!id) return;

    const btn = document.getElementById('btn-confirmar-eliminar-cat');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Eliminando...';
    }

    try {
        const res = await fetch(`${API_BASE}/categorias/${id}`, {
            method: 'DELETE'
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar';
            }
            return;
        }

        closeModal('modalEliminarCategoria');
        showToast(`✅ ${result.message}`, 'success');

        await loadConfig();
        await loadCategorias();
        if (typeof loadItems === 'function') loadItems();
        if (typeof loadInventario === 'function') loadInventario();
    } catch (err) {
        showToast(`Error al eliminar categoría: ${err.message}`, 'danger');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar';
        }
    }
}

// ==============================================================
// 8.4. GESTIÓN DE UBICACIONES FÍSICAS (CDS)
// ==============================================================
async function loadUbicaciones() {
    try {
        const res = await fetch(`${API_BASE}/ubicaciones`);
        const result = await res.json();
        if (result.success) {
            appState.ubicacionesList = result.data;
            const badgeEl = document.getElementById('badge-count-ubicaciones');
            if (badgeEl) badgeEl.textContent = result.data.length;
            renderUbicacionesTable(result.data);
        }
    } catch (err) {
        console.error('Error al cargar ubicaciones:', err);
    }
}

function renderUbicacionesTable(ubicaciones) {
    const tbody = document.getElementById('table-ubicaciones-body');
    if (!tbody) return;

    if (!ubicaciones || ubicaciones.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">No hay ubicaciones configuradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = ubicaciones.map((u, index) => {
        const safeName = String(u.nombre || '').replace(/'/g, "\\'");
        return `
            <tr>
                <td><span class="badge bg-light text-secondary border font-monospace fw-bold">#${u.orden || (index + 1)}</span></td>
                <td>
                    <div class="fw-bold text-dark"><i class="bi bi-geo-alt-fill text-info me-1"></i>${u.nombre}</div>
                </td>
                <td class="text-center">
                    <span class="badge ${u.total_items > 0 ? 'bg-info-subtle text-info-emphasis border border-info-subtle' : 'bg-secondary-subtle text-muted border'} px-2.5 py-1">
                        <i class="bi bi-box-seam me-1"></i>${u.total_items || 0} ítems
                    </span>
                </td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary btn-sm py-1 px-2 shadow-xs" onclick="editarUbicacion(${u.id}, '${safeName}', ${u.orden || 0})" title="Modificar Ubicación">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm py-1 px-2 shadow-xs" onclick="abrirModalEliminarUbicacion(${u.id}, '${safeName}', ${u.total_items || 0})" title="Eliminar Ubicación">
                            <i class="bi bi-trash3"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filtrarTablaUbicacionesUI(query) {
    const q = (query || '').toLowerCase().trim();
    if (!appState.ubicacionesList) return;
    if (!q) {
        renderUbicacionesTable(appState.ubicacionesList);
        return;
    }
    const filtrados = appState.ubicacionesList.filter(u => 
        (u.nombre && u.nombre.toLowerCase().includes(q)) ||
        String(u.orden).includes(q)
    );
    renderUbicacionesTable(filtrados);
}

function openModalNuevaUbicacion() {
    document.getElementById('form-ubicacion')?.reset();
    document.getElementById('ubi-id').value = '';
    document.getElementById('modalUbicacionTitle').innerHTML = '<i class="bi bi-geo-fill me-2"></i>Nueva Ubicación / Posición Física';
    
    // Sugerir siguiente orden
    const list = appState.ubicacionesList || [];
    let maxOrd = 0;
    list.forEach(u => { if (u.orden && u.orden > maxOrd) maxOrd = u.orden; });
    document.getElementById('ubi-orden').value = maxOrd + 1;

    const modalEl = document.getElementById('modalNuevaUbicacion');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function editarUbicacion(id, nombre, orden) {
    document.getElementById('form-ubicacion')?.reset();
    document.getElementById('ubi-id').value = id;
    document.getElementById('ubi-nombre').value = nombre;
    document.getElementById('ubi-orden').value = orden || '';
    document.getElementById('modalUbicacionTitle').innerHTML = `<i class="bi bi-pencil-square me-2"></i>Modificar Ubicación (${nombre})`;

    const modalEl = document.getElementById('modalNuevaUbicacion');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function submitUbicacion(e) {
    e.preventDefault();
    const id = document.getElementById('ubi-id').value;
    const nombre = document.getElementById('ubi-nombre').value.trim().toUpperCase();
    const orden = document.getElementById('ubi-orden').value;

    if (!nombre) {
        showToast('El código o nombre de la ubicación es obligatorio.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-guardar-ubicacion');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    try {
        const url = id ? `${API_BASE}/ubicaciones/${id}` : `${API_BASE}/ubicaciones`;
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, orden: parseInt(orden, 10) || undefined })
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Guardar Ubicación';
            }
            return;
        }

        closeModal('modalNuevaUbicacion');
        showToast(`✅ ${result.message}`, 'success');

        await loadConfig();
        await loadUbicaciones();
        if (typeof loadItems === 'function') loadItems();
        if (typeof loadInventario === 'function') loadInventario();
    } catch (err) {
        showToast(`Error al guardar ubicación: ${err.message}`, 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Guardar Ubicación';
        }
    }
}

function abrirModalEliminarUbicacion(id, nombre, totalItems) {
    document.getElementById('del-ubi-id-input').value = id;
    document.getElementById('del-ubi-nombre').textContent = nombre;
    document.getElementById('del-ubi-items').textContent = `${totalItems} ítem(s)`;

    const btn = document.getElementById('btn-confirmar-eliminar-ubi');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar';
    }

    const modalEl = document.getElementById('modalEliminarUbicacion');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function ejecutarEliminarUbicacion() {
    const id = document.getElementById('del-ubi-id-input').value;
    if (!id) return;

    const btn = document.getElementById('btn-confirmar-eliminar-ubi');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Eliminando...';
    }

    try {
        const res = await fetch(`${API_BASE}/ubicaciones/${id}`, {
            method: 'DELETE'
        });

        const result = await res.json();
        if (!result.success) {
            showToast(`⚠️ ${result.error}`, 'danger');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar';
            }
            return;
        }

        closeModal('modalEliminarUbicacion');
        showToast(`✅ ${result.message}`, 'success');

        await loadConfig();
        await loadUbicaciones();
        if (typeof loadItems === 'function') loadItems();
        if (typeof loadInventario === 'function') loadInventario();
    } catch (err) {
        showToast(`Error al eliminar ubicación: ${err.message}`, 'danger');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash3-fill me-1"></i> Confirmar y Eliminar';
        }
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
        const result = await safeFetchJSON(`${API_BASE}/reportes/kardex/${codigo}`);
        if (!result.success) return;

        const { item, kardex, saldo_final } = result;
        currentKardexData = result;

        document.getElementById('kardex-item-titulo').textContent = `${item.codigo} - ${item.nombre}`;
        document.getElementById('kardex-item-subtitulo').textContent = `Sede: ${item.sede || appState.currentSede} | Inventario: ${item.tipo_inventario || appState.currentInventario} | Categoría: ${item.categoria} | Ubicación: ${item.ubicacion_cds} | Unidad: ${item.unidad_medida}`;
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

// Guardar libro de Excel vía XLSX.writeFile y Blob binario
function saveWorkbookWithBlob(workbook, fileName) {
    try {
        if (typeof XLSX !== 'undefined' && typeof XLSX.writeFile === 'function') {
            XLSX.writeFile(workbook, fileName);
            return;
        }
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        triggerBlobDownload(blob, fileName);
    } catch (err) {
        console.warn('Fallback triggerBlobDownload tras error en writeFile:', err);
        try {
            const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            triggerBlobDownload(blob, fileName);
        } catch (e2) {
            console.error('Error total al exportar Excel:', e2);
            showToast('Error al descargar el archivo Excel: ' + (e2.message || err.message), 'danger');
        }
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

// ==============================================================
// 11. SISTEMA INTEGRAL DE REPORTES GERENCIALES CON FILTRADO PREVIO
// ==============================================================

// Estado del último reporte filtrado para exportación o previsualización
let reporteFiltradoActivo = {
    tipo: 'MOVIMIENTOS',
    data: [],
    columns: [],
    title: 'Reporte de Movimientos',
    sheetName: 'Movimientos',
    filename: 'Libro_Movimientos'
};

// 1. Inicialización de selectores de filtrado rápido y modal
function initFiltrosReportes() {
    // A. Fechas por defecto (Mes actual) si están vacías
    const now = new Date();
    const primerDiaMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const hoyStr = now.toISOString().split('T')[0];

    const qDesde = document.getElementById('rep-quick-fecha-desde');
    const qHasta = document.getElementById('rep-quick-fecha-hasta');
    if (qDesde && !qDesde.value) qDesde.value = primerDiaMes;
    if (qHasta && !qHasta.value) qHasta.value = hoyStr;

    // B. Llenar categorías en filtro rápido y modal
    const categorias = (appState.config && appState.config.categorias && appState.config.categorias.length > 0)
        ? appState.config.categorias.map(c => typeof c === 'string' ? c : c.nombre)
        : Array.from(new Set((appState.items || []).map(i => i.categoria).filter(Boolean)));

    const qCat = document.getElementById('rep-quick-categoria');
    if (qCat) {
        let html = '<option value="TODAS">-- Todas las Categorías --</option>';
        categorias.forEach(cat => {
            html += `<option value="${cat}">${cat}</option>`;
        });
        qCat.innerHTML = html;
    }

    const mCat = document.getElementById('modal-filtro-categoria');
    if (mCat) {
        let html = '<option value="TODAS">-- Todas las Categorías --</option>';
        categorias.forEach(cat => {
            html += `<option value="${cat}">${cat}</option>`;
        });
        mCat.innerHTML = html;
    }

    // C. Llenar ubicaciones en filtro rápido y modal
    const ubicaciones = (appState.config && appState.config.ubicaciones && appState.config.ubicaciones.length > 0)
        ? appState.config.ubicaciones.map(u => typeof u === 'string' ? u : u.nombre)
        : Array.from(new Set((appState.items || []).map(i => i.ubicacion_cds).filter(Boolean)));

    const qUbi = document.getElementById('rep-quick-ubicacion');
    if (qUbi) {
        let html = '<option value="TODAS">-- Todas las Ubicaciones --</option>';
        ubicaciones.forEach(ubi => {
            html += `<option value="${ubi}">${ubi}</option>`;
        });
        qUbi.innerHTML = html;
    }

    const mUbi = document.getElementById('modal-filtro-ubicacion');
    if (mUbi) {
        let html = '<option value="TODAS">-- Todas las Ubicaciones --</option>';
        ubicaciones.forEach(ubi => {
            html += `<option value="${ubi}">${ubi}</option>`;
        });
        mUbi.innerHTML = html;
    }

    // D. Llenar Sedes en modal
    const sedes = (appState.config && appState.config.sedes && appState.config.sedes.length > 0)
        ? appState.config.sedes.map(s => typeof s === 'string' ? s : s.nombre)
        : ['Sede Suroriental', 'Sede Medellín'];

    const mSede = document.getElementById('modal-filtro-sede');
    if (mSede) {
        if (!tienePermiso('ACCESO_MULTI_SEDE')) {
            const userSede = appState.currentUser?.sede || 'Sede Suroriental';
            mSede.innerHTML = `<option value="${userSede}">${userSede}</option>`;
            mSede.value = userSede;
            mSede.disabled = true;
            mSede.title = `🔒 Sede asignada: ${userSede} (Requiere permiso de Ver Sedes)`;
        } else {
            let html = '<option value="TODAS">-- Todas las Sedes --</option>';
            sedes.forEach(s => {
                const isSelected = s === appState.currentSede ? 'selected' : '';
                html += `<option value="${s}" ${isSelected}>${s}</option>`;
            });
            mSede.innerHTML = html;
            mSede.disabled = false;
            mSede.title = 'Filtrar por Sede';
        }
    }

    // E. Llenar Tipos de Inventario en modal
    const tiposInv = (appState.config && appState.config.tipos_inventario && appState.config.tipos_inventario.length > 0)
        ? appState.config.tipos_inventario
        : [{ codigo: 'CDS', nombre: 'Inventario CDS' }, { codigo: 'MOVILIDAD', nombre: 'Inventario Movilidad' }];

    const mInv = document.getElementById('modal-filtro-tipo-inv');
    if (mInv) {
        let html = '<option value="TODOS">-- Todos los Inventarios --</option>';
        tiposInv.forEach(t => {
            const cod = t.codigo || t;
            const nom = t.nombre || cod;
            const isSelected = cod === appState.currentInventario ? 'selected' : '';
            html += `<option value="${cod}" ${isSelected}>${nom}</option>`;
        });
        mInv.innerHTML = html;
    }

    // F. Llenar Bodegas en modal
    const mBod = document.getElementById('modal-filtro-bodega');
    if (mBod && appState.bodegas) {
        let html = '<option value="TODAS">-- Todas las Bodegas --</option>';
        appState.bodegas.forEach(b => {
            html += `<option value="${b.codigo}">${b.codigo} - ${b.nombre} (${b.sede || 'Global'})</option>`;
        });
        mBod.innerHTML = html;
    }

    // G. Llenar Proyectos en modal
    const mProy = document.getElementById('modal-filtro-proyecto');
    if (mProy && appState.proyectos) {
        let html = '<option value="TODOS">-- Todos los Proyectos --</option>';
        appState.proyectos.forEach(p => {
            html += `<option value="${p.nombre}">${p.nombre} (${p.sede || 'Global'})</option>`;
        });
        mProy.innerHTML = html;
    }
}

// 2. Helpers para rangos de fecha rápidos
function calculateDatePreset(preset) {
    const now = new Date();
    const hoy = now.toISOString().split('T')[0];

    if (preset === 'HOY') {
        return { desde: hoy, hasta: hoy };
    }
    if (preset === '7DIAS') {
        const d7 = new Date();
        d7.setDate(d7.getDate() - 7);
        return { desde: d7.toISOString().split('T')[0], hasta: hoy };
    }
    if (preset === 'MES') {
        const dMes = new Date(now.getFullYear(), now.getMonth(), 1);
        return { desde: dMes.toISOString().split('T')[0], hasta: hoy };
    }
    if (preset === 'MES_ANT') {
        const primDiaMesAnt = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const ultDiaMesAnt = new Date(now.getFullYear(), now.getMonth(), 0);
        return { desde: primDiaMesAnt.toISOString().split('T')[0], hasta: ultDiaMesAnt.toISOString().split('T')[0] };
    }
    if (preset === 'TODO') {
        return { desde: '', hasta: '' };
    }
    return { desde: '', hasta: '' };
}

function setQuickDateRange(preset) {
    const range = calculateDatePreset(preset);
    const dEl = document.getElementById('rep-quick-fecha-desde');
    const hEl = document.getElementById('rep-quick-fecha-hasta');
    if (dEl) dEl.value = range.desde;
    if (hEl) hEl.value = range.hasta;
    actualizarPrevisualizacionReporte();
}

function setModalDateRange(preset) {
    const range = calculateDatePreset(preset);
    const dEl = document.getElementById('modal-filtro-fecha-desde');
    const hEl = document.getElementById('modal-filtro-fecha-hasta');
    if (dEl) dEl.value = range.desde;
    if (hEl) hEl.value = range.hasta;
    ejecutarFiltroReporteModal();
}

// 3. Abrir el Modal de Filtros Previo a la Generación
function openModalFiltroReporte(tipoDefault = 'MOVIMIENTOS') {
    initFiltrosReportes();

    // Seleccionar el radio button correspondiente
    const mapRadios = {
        'MOVIMIENTOS': 'rep-tipo-movs',
        'BALANCE': 'rep-tipo-balance',
        'STOCK_CRITICO': 'rep-tipo-critico',
        'VENCIMIENTOS': 'rep-tipo-venc',
        'CATALOGO': 'rep-tipo-cat'
    };

    const targetRadioId = mapRadios[tipoDefault] || 'rep-tipo-mov';
    const radioEl = document.getElementById(targetRadioId);
    if (radioEl) radioEl.checked = true;

    // Fechas por defecto si están vacías
    const dEl = document.getElementById('modal-filtro-fecha-desde');
    const hEl = document.getElementById('modal-filtro-fecha-hasta');
    if (dEl && !dEl.value) {
        const now = new Date();
        dEl.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    }
    if (hEl && !hEl.value) {
        hEl.value = new Date().toISOString().split('T')[0];
    }

    onCambioTipoReporteModal();

    const modalEl = document.getElementById('modalFiltroReporte');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

// 4. Cambio de tipo de reporte dentro del Modal
function onCambioTipoReporteModal() {
    const selectedRadio = document.querySelector('input[name="rep-tipo-modal"]:checked');
    const tipo = selectedRadio ? selectedRadio.value : 'MOVIMIENTOS';

    // Ajustar visibilidad de filtros según el reporte seleccionado
    const gTipoMov = document.getElementById('group-filtro-tipo-mov');
    const gBodega = document.getElementById('group-filtro-bodega');
    const gProyecto = document.getElementById('group-filtro-proyecto');
    const gEstadoVenc = document.getElementById('group-filtro-estado-venc');
    const gEstadoStock = document.getElementById('group-filtro-estado-stock');
    const gFechaDesde = document.getElementById('group-filtro-fechas-desde');
    const gFechaHasta = document.getElementById('group-filtro-fechas-hasta');

    if (gTipoMov) gTipoMov.style.display = (tipo === 'MOVIMIENTOS') ? 'block' : 'none';
    if (gBodega) gBodega.style.display = (tipo === 'MOVIMIENTOS' || tipo === 'VENCIMIENTOS') ? 'block' : 'none';
    if (gProyecto) gProyecto.style.display = (tipo === 'MOVIMIENTOS') ? 'block' : 'none';
    if (gEstadoVenc) gEstadoVenc.style.display = (tipo === 'VENCIMIENTOS') ? 'block' : 'none';
    if (gEstadoStock) gEstadoStock.style.display = (tipo === 'BALANCE' || tipo === 'STOCK_CRITICO') ? 'block' : 'none';
    
    // El catálogo maestro no depende de fechas de movimientos
    if (gFechaDesde) gFechaDesde.style.display = (tipo === 'CATALOGO') ? 'none' : 'block';
    if (gFechaHasta) gFechaHasta.style.display = (tipo === 'CATALOGO') ? 'none' : 'block';

    ejecutarFiltroReporteModal();
}

// 5. Restablecer filtros del modal
function resetearFiltrosModalReporte() {
    const now = new Date();
    const dEl = document.getElementById('modal-filtro-fecha-desde');
    const hEl = document.getElementById('modal-filtro-fecha-hasta');
    if (dEl) dEl.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    if (hEl) hEl.value = now.toISOString().split('T')[0];

    const mSede = document.getElementById('modal-filtro-sede');
    if (mSede) {
        if (!tienePermiso('ACCESO_MULTI_SEDE')) {
            const userSede = appState.currentUser?.sede || 'Sede Suroriental';
            mSede.value = userSede;
            mSede.disabled = true;
        } else {
            mSede.value = appState.currentSede || 'TODAS';
            mSede.disabled = false;
        }
    }

    const mInv = document.getElementById('modal-filtro-tipo-inv');
    if (mInv) mInv.value = appState.currentInventario || 'TODOS';

    const mCat = document.getElementById('modal-filtro-categoria');
    if (mCat) mCat.value = 'TODAS';

    const mUbi = document.getElementById('modal-filtro-ubicacion');
    if (mUbi) mUbi.value = 'TODAS';

    const mMov = document.getElementById('modal-filtro-tipo-mov');
    if (mMov) mMov.value = 'TODOS';

    const mBod = document.getElementById('modal-filtro-bodega');
    if (mBod) mBod.value = 'TODAS';

    const mProy = document.getElementById('modal-filtro-proyecto');
    if (mProy) mProy.value = 'TODOS';

    const mVenc = document.getElementById('modal-filtro-estado-venc');
    if (mVenc) mVenc.value = 'TODOS';

    const mStock = document.getElementById('modal-filtro-estado-stock');
    if (mStock) mStock.value = 'TODOS';

    const mSearch = document.getElementById('modal-filtro-search');
    if (mSearch) mSearch.value = '';

    ejecutarFiltroReporteModal();
}

// 6. Ejecutar consulta de filtrado en tiempo real dentro del Modal
async function ejecutarFiltroReporteModal() {
    const selectedRadio = document.querySelector('input[name="rep-tipo-modal"]:checked');
    const tipo = selectedRadio ? selectedRadio.value : 'MOVIMIENTOS';

    let sedeFiltro = document.getElementById('modal-filtro-sede')?.value || 'TODAS';
    if (!tienePermiso('ACCESO_MULTI_SEDE')) {
        sedeFiltro = appState.currentUser?.sede || 'Sede Suroriental';
    }

    const payload = {
        tipo_reporte: tipo,
        fecha_desde: document.getElementById('modal-filtro-fecha-desde')?.value || '',
        fecha_hasta: document.getElementById('modal-filtro-fecha-hasta')?.value || '',
        sede: sedeFiltro,
        tipo_inventario: document.getElementById('modal-filtro-tipo-inv')?.value || 'TODOS',
        categoria: document.getElementById('modal-filtro-categoria')?.value || 'TODAS',
        ubicacion: document.getElementById('modal-filtro-ubicacion')?.value || 'TODAS',
        bodega: document.getElementById('modal-filtro-bodega')?.value || 'TODAS',
        proyecto: document.getElementById('modal-filtro-proyecto')?.value || 'TODOS',
        tipo_movimiento: document.getElementById('modal-filtro-tipo-mov')?.value || 'TODOS',
        estado_stock: document.getElementById('modal-filtro-estado-stock')?.value || 'TODOS',
        estado_vencimiento: document.getElementById('modal-filtro-estado-venc')?.value || 'TODOS',
        search: document.getElementById('modal-filtro-search')?.value?.trim() || ''
    };

    const badgeCount = document.getElementById('modal-filtro-count-badge');
    const summaryText = document.getElementById('modal-filtro-summary-text');
    if (badgeCount) badgeCount.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Consultando...`;

    try {
        const result = await safeFetchJSON(`${API_BASE}/reportes/filtrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!result.success) {
            if (badgeCount) badgeCount.textContent = '0 registros';
            if (summaryText) summaryText.textContent = result.error || 'Error al filtrar';
            return;
        }

        const data = result.data || [];
        const total = result.total !== undefined ? result.total : data.length;

        if (badgeCount) badgeCount.textContent = `${total} registros encontrados`;
        if (summaryText) summaryText.textContent = `Filtros activos listos para exportar`;

        // Generar definición de columnas y renderizar vista previa
        const columnDefs = obtenerDefinicionColumnasReporte(tipo);
        reporteFiltradoActivo = {
            tipo,
            data,
            columns: columnDefs.columns,
            title: columnDefs.title,
            sheetName: columnDefs.sheetName,
            filename: columnDefs.filename
        };

        renderTablaPreviewModal(data, columnDefs.columns);
    } catch (err) {
        console.error('Error al filtrar reporte modal:', err);
        if (badgeCount) badgeCount.textContent = '0 registros';
        if (summaryText) summaryText.textContent = 'Error al consultar datos: ' + err.message;
    }
}

// 7. Definición de Columnas y Metadatos por Tipo de Reporte
function obtenerDefinicionColumnasReporte(tipo) {
    if (tipo === 'MOVIMIENTOS') {
        return {
            title: 'Libro de Movimientos',
            sheetName: 'Movimientos',
            filename: 'Libro_Movimientos_Filtrado',
            columns: [
                { header: 'Código Ítem', key: 'codigo_item', type: 'number' },
                { header: 'Nombre del Ítem', key: 'nombre_item' },
                { header: 'N° Movimiento', key: 'n_movimiento' },
                { header: 'Fecha', key: 'fecha' },
                { header: 'Hora', key: 'hora' },
                { header: 'Tipo Movimiento', key: 'tipo_movimiento' },
                { header: 'Cantidad', key: 'cantidad', type: 'number' },
                { header: 'Unidad', key: 'unidad' },
                { header: 'Sede', key: 'sede' },
                { header: 'Inventario', key: 'tipo_inventario' },
                { header: 'Bodega Origen', key: 'bodega_origen', formatter: v => v || '-' },
                { header: 'Bodega Destino', key: 'bodega_destino', formatter: v => v || '-' },
                { header: 'Causal / Proyecto', key: 'causal_condicion', formatter: (v, r) => v || r.proyecto_destino || '-' },
                { header: 'Ubicación CDS', key: 'ubicacion_cds', formatter: v => v || '-' },
                { header: 'Responsable', key: 'responsable', formatter: v => v || '-' },
                { header: 'Persona Recibe / Devuelve', key: 'persona_recibe_devuelve', formatter: v => v || '-' },
                { header: 'Doc. Referencia', key: 'documento_referencia', formatter: v => v || '-' },
                { header: 'Vencimiento Lote', key: 'fecha_vencimiento_lote', formatter: v => v || '-' },
                { header: 'Observaciones', key: 'observaciones', formatter: v => v || '-' }
            ]
        };
    }

    if (tipo === 'BALANCE') {
        return {
            title: 'Balance General de Inventario Físico',
            sheetName: 'Balance Stock',
            filename: 'Balance_Stock_Filtrado',
            columns: [
                { header: 'Código Ítem', key: 'codigo', type: 'number' },
                { header: 'Nombre del Ítem / Material', key: 'nombre' },
                { header: 'Categoría', key: 'categoria' },
                { header: 'Subcategoría', key: 'subcategoria' },
                { header: 'Unidad de Medida', key: 'unidad_medida' },
                { header: 'Ubicación CDS', key: 'ubicacion_cds' },
                { header: 'Sede', key: 'sede' },
                { header: 'Inventario', key: 'tipo_inventario' },
                { header: 'Entradas (+)', key: 'entradas', type: 'number' },
                { header: 'Devoluciones (+)', key: 'devoluciones', type: 'number' },
                { header: 'Traslados In (+)', key: 'entregas_recibidas', type: 'number' },
                { header: 'Ajustes Pos (+)', key: 'ajustes_pos', type: 'number' },
                { header: 'Entregas / Salidas (-)', key: 'entregas_enviadas', type: 'number' },
                { header: 'Bajas / Disp. Final (-)', key: 'disp_final', type: 'number' },
                { header: 'Ajustes Neg (-)', key: 'ajustes_neg', type: 'number' },
                { header: 'Existencia Actual', key: 'existencia', type: 'number' },
                { header: 'Stock Mínimo', key: 'stock_minimo', type: 'number' },
                { header: 'Estado del Stock', key: 'estado_stock' },
                { header: 'Aplica Vencimiento', key: 'aplica_vencimiento', formatter: v => v ? 'SÍ' : 'NO' }
            ]
        };
    }

    if (tipo === 'STOCK_CRITICO') {
        return {
            title: 'Reporte de Stock Crítico / Bajo',
            sheetName: 'Stock Crítico',
            filename: 'Reporte_Stock_Critico_Filtrado',
            columns: [
                { header: 'Código Ítem', key: 'codigo', type: 'number' },
                { header: 'Nombre del Ítem / Material', key: 'nombre' },
                { header: 'Categoría', key: 'categoria' },
                { header: 'Ubicación CDS', key: 'ubicacion_cds' },
                { header: 'Sede', key: 'sede' },
                { header: 'Inventario', key: 'tipo_inventario' },
                { header: 'Existencia Actual', key: 'existencia', type: 'number' },
                { header: 'Stock Mínimo', key: 'stock_minimo', type: 'number' },
                { header: 'Déficit / Faltante', key: 'deficit', formatter: (v, r) => Math.max(0, (r.stock_minimo || 0) - (r.existencia || 0)), type: 'number' },
                { header: 'Unidad de Medida', key: 'unidad_medida' },
                { header: 'Estado de Alerta', key: 'estado_stock' }
            ]
        };
    }

    if (tipo === 'VENCIMIENTOS') {
        return {
            title: 'Control de Lotes y Vencimientos',
            sheetName: 'Lotes y Vencimientos',
            filename: 'Control_Vencimientos_Filtrado',
            columns: [
                { header: 'Código Ítem', key: 'codigo_item', type: 'number' },
                { header: 'Nombre del Ítem / Material', key: 'nombre_item' },
                { header: 'Sede', key: 'sede' },
                { header: 'Inventario', key: 'tipo_inventario' },
                { header: 'Bodega', key: 'bodega' },
                { header: 'Ubicación CDS', key: 'ubicacion_cds' },
                { header: 'Fecha Ingreso', key: 'fecha_ingreso' },
                { header: 'Fecha Vencimiento', key: 'fecha_vencimiento' },
                { header: 'Días Restantes', key: 'dias_restantes', type: 'number' },
                { header: 'Cant. Inicial', key: 'cant_inicial', type: 'number' },
                { header: 'Cant. Disponible', key: 'cant_disponible', type: 'number' },
                { header: 'Unidad', key: 'unidad_medida' },
                { header: 'Estado Caducidad', key: 'estado_actualizado' },
                { header: 'Acción Recomendada', key: 'accion', formatter: (v, r) => r.dias_restantes <= 0 ? 'DAR DE BAJA (SCRAP)' : (r.dias_restantes <= 30 ? 'PRIORIZAR SALIDA' : 'CONSERVACIÓN') },
                { header: 'N° Mov. Origen', key: 'n_movimiento_origen' },
                { header: 'Observaciones', key: 'observaciones', formatter: v => v || '-' }
            ]
        };
    }

    // Default: CATALOGO
    return {
        title: 'Catálogo Maestro de Ítems',
        sheetName: 'Catálogo Maestro',
        filename: 'Catalogo_Maestro_Filtrado',
        columns: [
            { header: 'Código Ítem', key: 'codigo', type: 'number' },
            { header: 'Nombre del Ítem / Descripción', key: 'nombre' },
            { header: 'Categoría', key: 'categoria' },
            { header: 'Subcategoría', key: 'subcategoria' },
            { header: 'Unidad de Medida', key: 'unidad_medida' },
            { header: 'Marca', key: 'marca', formatter: v => v || '-' },
            { header: 'Referencia', key: 'referencia', formatter: v => v || '-' },
            { header: 'Ubicación CDS', key: 'ubicacion_cds' },
            { header: 'Sede', key: 'sede' },
            { header: 'Inventario', key: 'tipo_inventario' },
            { header: 'Stock Mínimo', key: 'stock_minimo', type: 'number' },
            { header: 'Aplica Vencimiento', key: 'aplica_vencimiento', formatter: v => v ? 'SÍ' : 'NO' },
            { header: 'Estado', key: 'estado' },
            { header: 'Fecha Registro', key: 'fecha_registro' },
            { header: 'Observaciones', key: 'observaciones', formatter: v => v || '-' }
        ]
    };
}

// 8. Renderizar tabla de previsualización en el Modal
function renderTablaPreviewModal(data, columns) {
    const thead = document.getElementById('thead-modal-filtro-preview');
    const tbody = document.getElementById('tbody-modal-filtro-preview');
    if (!thead || !tbody) return;

    // Encabezados de las columnas
    thead.innerHTML = `<tr>${columns.slice(0, 8).map(c => `<th>${c.header}</th>`).join('')}</tr>`;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${Math.min(columns.length, 8)}" class="text-center py-3 text-muted">No se encontraron registros con los filtros seleccionados.</td></tr>`;
        return;
    }

    // Renderizar las primeras 30 filas para velocidad
    const previewRows = data.slice(0, 30);
    tbody.innerHTML = previewRows.map(row => {
        const cells = columns.slice(0, 8).map(col => {
            let val = row[col.key];
            if (val === undefined || val === null) val = '';
            if (col.formatter) val = col.formatter(val, row);
            return `<td>${val}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    if (data.length > 30) {
        tbody.innerHTML += `<tr><td colspan="${Math.min(columns.length, 8)}" class="text-center py-2 text-primary fw-semibold bg-light">... Mostrando 30 de ${data.length} registros (El Excel contendrá el 100% de los datos)</td></tr>`;
    }
}

// 9. Descargar Excel directamente desde el Modal de Filtro
function descargarExcelDesdeModalFiltro() {
    if (!reporteFiltradoActivo || !reporteFiltradoActivo.data || reporteFiltradoActivo.data.length === 0) {
        showToast('⚠️ No hay registros que coincidan con los filtros seleccionados para descargar.', 'warning');
        return;
    }

    exportToExcelTable(
        reporteFiltradoActivo.data,
        reporteFiltradoActivo.columns,
        reporteFiltradoActivo.sheetName,
        reporteFiltradoActivo.filename
    );
}

// 10. Mostrar resultados en el visualizador interactivo en pantalla desde el Modal
function mostrarResultadosEnPantallaDesdeModal() {
    if (!reporteFiltradoActivo || !reporteFiltradoActivo.data) {
        showToast('No hay datos filtrados para mostrar.', 'warning');
        return;
    }

    closeModal('modalFiltroReporte');
    renderReporteLive(reporteFiltradoActivo);
}

// 11. Renderizar tabla interactiva en pantalla (reporte-live-container)
function renderReporteLive(reporteObj) {
    const container = document.getElementById('reporte-live-container');
    const titleEl = document.getElementById('reporte-live-title');
    const subtitleEl = document.getElementById('reporte-live-subtitle');
    const badgeEl = document.getElementById('reporte-live-badge-count');
    const thead = document.getElementById('thead-reporte-live');
    const tbody = document.getElementById('tbody-reporte-live');

    if (!container || !thead || !tbody) return;

    if (titleEl) titleEl.innerHTML = `<i class="bi bi-table text-primary me-2"></i>${reporteObj.title}`;
    if (subtitleEl) subtitleEl.textContent = `Generado el ${new Date().toLocaleString('es-ES')} con los filtros seleccionados`;
    if (badgeEl) badgeEl.textContent = `${reporteObj.data.length} registros`;

    // Encabezados
    thead.innerHTML = `<tr>${reporteObj.columns.map(c => `<th>${c.header}</th>`).join('')}</tr>`;

    if (reporteObj.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${reporteObj.columns.length}" class="text-center py-4 text-muted">No se encontraron registros para los filtros aplicados.</td></tr>`;
    } else {
        tbody.innerHTML = reporteObj.data.map(row => {
            const cells = reporteObj.columns.map(col => {
                let val = row[col.key];
                if (val === undefined || val === null) val = '';
                if (col.formatter) val = col.formatter(val, row);
                const isNum = col.type === 'number' || typeof val === 'number';
                return `<td class="${isNum ? 'text-end font-monospace' : ''}">${val}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
    }

    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 12. Exportar la tabla actualmente mostrada en pantalla
function exportarReporteLiveActual() {
    if (!reporteFiltradoActivo || !reporteFiltradoActivo.data || reporteFiltradoActivo.data.length === 0) {
        showToast('No hay datos en pantalla para exportar.', 'warning');
        return;
    }
    exportToExcelTable(
        reporteFiltradoActivo.data,
        reporteFiltradoActivo.columns,
        reporteFiltradoActivo.sheetName,
        reporteFiltradoActivo.filename
    );
}

// 13. Cerrar visualizador de reporte en vivo
function cerrarVisualizadorReporteLive() {
    const container = document.getElementById('reporte-live-container');
    if (container) container.style.display = 'none';
}

// 14. Limpiar filtros rápidos de la barra superior en reportes
function limpiarFiltrosRapidosReportes() {
    const dEl = document.getElementById('rep-quick-fecha-desde');
    const hEl = document.getElementById('rep-quick-fecha-hasta');
    const cEl = document.getElementById('rep-quick-categoria');
    const uEl = document.getElementById('rep-quick-ubicacion');
    const mEl = document.getElementById('rep-quick-tipo-mov');

    if (dEl) dEl.value = '';
    if (hEl) hEl.value = '';
    if (cEl) cEl.value = 'TODAS';
    if (uEl) uEl.value = 'TODAS';
    if (mEl) mEl.value = 'TODOS';

    showToast('Filtros rápidos restablecidos.', 'info');
    cerrarVisualizadorReporteLive();
}

// 15. Aplicar filtros rápidos y mostrar resultados directamente en pantalla
async function aplicarFiltrosYMostrarEnPantalla(tipo = 'MOVIMIENTOS') {
    const payload = {
        tipo_reporte: tipo,
        fecha_desde: document.getElementById('rep-quick-fecha-desde')?.value || '',
        fecha_hasta: document.getElementById('rep-quick-fecha-hasta')?.value || '',
        categoria: document.getElementById('rep-quick-categoria')?.value || 'TODAS',
        ubicacion: document.getElementById('rep-quick-ubicacion')?.value || 'TODAS',
        tipo_movimiento: document.getElementById('rep-quick-tipo-mov')?.value || 'TODOS',
        sede: appState.currentSede,
        tipo_inventario: appState.currentInventario
    };

    try {
        showToast('Consultando registros filtrados...', 'info');
        const result = await safeFetchJSON(`${API_BASE}/reportes/filtrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!result.success) {
            showToast('⚠️ Error: ' + result.error, 'danger');
            return;
        }

        const columnDefs = obtenerDefinicionColumnasReporte(tipo);
        reporteFiltradoActivo = {
            tipo,
            data: result.data || [],
            columns: columnDefs.columns,
            title: columnDefs.title,
            sheetName: columnDefs.sheetName,
            filename: columnDefs.filename
        };

        renderReporteLive(reporteFiltradoActivo);
    } catch (err) {
        showToast('Error al consultar reporte: ' + err.message, 'danger');
    }
}

function actualizarPrevisualizacionReporte() {
    const container = document.getElementById('reporte-live-container');
    if (container && container.style.display !== 'none') {
        aplicarFiltrosYMostrarEnPantalla(reporteFiltradoActivo.tipo || 'MOVIMIENTOS');
    }
}

// 16. Métodos de Descarga Excel con Filtros Rápidos Aplicados
async function exportInventarioExcelFiltrado() {
    await exportarReporteConFiltrosRapidos('BALANCE');
}

async function exportReporteStockBajoExcelFiltrado() {
    await exportarReporteConFiltrosRapidos('STOCK_CRITICO');
}

async function exportReporteVencidosExcelFiltrado() {
    await exportarReporteConFiltrosRapidos('VENCIMIENTOS');
}

async function exportMovimientosExcelFiltrado() {
    await exportarReporteConFiltrosRapidos('MOVIMIENTOS');
}

async function exportCatalogoExcelFiltrado() {
    await exportarReporteConFiltrosRapidos('CATALOGO');
}

async function exportarReporteConFiltrosRapidos(tipo) {
    const payload = {
        tipo_reporte: tipo,
        fecha_desde: document.getElementById('rep-quick-fecha-desde')?.value || '',
        fecha_hasta: document.getElementById('rep-quick-fecha-hasta')?.value || '',
        categoria: document.getElementById('rep-quick-categoria')?.value || 'TODAS',
        ubicacion: document.getElementById('rep-quick-ubicacion')?.value || 'TODAS',
        tipo_movimiento: document.getElementById('rep-quick-tipo-mov')?.value || 'TODOS',
        sede: appState.currentSede,
        tipo_inventario: appState.currentInventario
    };

    try {
        showToast('Generando reporte filtrado para Excel...', 'info');
        const result = await safeFetchJSON(`${API_BASE}/reportes/filtrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!result.success || !result.data || result.data.length === 0) {
            showToast('⚠️ No se encontraron registros con los filtros activos para exportar.', 'warning');
            return;
        }

        const columnDefs = obtenerDefinicionColumnasReporte(tipo);
        exportToExcelTable(result.data, columnDefs.columns, columnDefs.sheetName, columnDefs.filename);
    } catch (err) {
        showToast('Error al exportar reporte: ' + err.message, 'danger');
    }
}

// 17. Métodos directos de exportación desde vistas principales
async function exportMovimientosExcel() {
    try {
        if (appState.movimientos && appState.movimientos.length > 0) {
            const columnDefs = obtenerDefinicionColumnasReporte('MOVIMIENTOS');
            exportToExcelTable(appState.movimientos, columnDefs.columns, 'Movimientos', 'Libro_Movimientos_General');
        } else {
            await exportarReporteConFiltrosRapidos('MOVIMIENTOS');
        }
    } catch (err) {
        console.error('Error al exportar movimientos:', err);
        showToast('Error al exportar movimientos: ' + err.message, 'danger');
    }
}

function exportInventarioExcel() {
    try {
        if (!appState.inventario || appState.inventario.length === 0) {
            showToast('No hay datos de inventario cargados para exportar.', 'warning');
            return;
        }
        const columnDefs = obtenerDefinicionColumnasReporte('BALANCE');
        exportToExcelTable(appState.inventario, columnDefs.columns, 'Inventario', 'Balance_Inventario_CDS');
    } catch (err) {
        console.error('Error al exportar inventario:', err);
        showToast('Error al exportar inventario: ' + err.message, 'danger');
    }
}

function exportCatalogoExcel() {
    try {
        if (!appState.items || appState.items.length === 0) {
            showToast('No hay ítems en el catálogo para exportar.', 'warning');
            return;
        }
        const columnDefs = obtenerDefinicionColumnasReporte('CATALOGO');
        exportToExcelTable(appState.items, columnDefs.columns, 'Catalogo', 'Catalogo_Maestro_Items');
    } catch (err) {
        console.error('Error al exportar catálogo:', err);
        showToast('Error al exportar catálogo: ' + err.message, 'danger');
    }
}

function exportVencimientosExcel() {
    try {
        if (!appState.vencimientos || appState.vencimientos.length === 0) {
            showToast('No hay registros de vencimientos para exportar.', 'warning');
            return;
        }
        const columnDefs = obtenerDefinicionColumnasReporte('VENCIMIENTOS');
        exportToExcelTable(appState.vencimientos, columnDefs.columns, 'Vencimientos', 'Control_Lotes_Vencimientos');
    } catch (err) {
        console.error('Error al exportar vencimientos:', err);
        showToast('Error al exportar vencimientos: ' + err.message, 'danger');
    }
}

function exportKardexActualExcel() {
    try {
        if (!currentKardexData || !currentKardexData.kardex || currentKardexData.kardex.length === 0) {
            showToast('⚠️ Seleccione un ítem con movimientos en el Kardex para exportar.', 'warning');
            return;
        }
        const { item, kardex } = currentKardexData;
        const columns = [
            { header: 'Código', key: 'codigo_item', formatter: () => item.codigo },
            { header: 'Ítem / Material', key: 'nombre_item', formatter: () => item.nombre },
            { header: 'N° Movimiento', key: 'n_movimiento' },
            { header: 'Fecha', key: 'fecha' },
            { header: 'Hora', key: 'hora' },
            { header: 'Tipo Movimiento', key: 'tipo_movimiento' },
            { header: 'Bodega Origen', key: 'bodega_origen', formatter: v => v || '-' },
            { header: 'Bodega Destino', key: 'bodega_destino', formatter: v => v || '-' },
            { header: 'Responsable', key: 'responsable', formatter: (v, r) => v || r.persona_recibe_devuelve || '-' },
            { header: 'Entrada (+)', key: 'entrada', type: 'number' },
            { header: 'Salida (-)', key: 'salida', type: 'number' },
            { header: 'Saldo Físico Acumulado', key: 'saldo_acumulado', type: 'number' }
        ];
        exportToExcelTable(kardex, columns, `Kardex_${item.codigo}`, `Kardex_Item_${item.codigo}`);
    } catch (err) {
        console.error('Error al exportar kardex:', err);
        showToast('Error al exportar kardex: ' + err.message, 'danger');
    }
}

// 18. Motor de Impresión Profesional y Generación de PDF Limpio
function imprimirReporteHTML(titulo, subtitulo, columns, data, metadata = {}) {
    if (!data || data.length === 0) {
        showToast('⚠️ No hay registros para imprimir con los filtros seleccionados.', 'warning');
        return;
    }

    const fechaGen = new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    const usuarioGen = getNombreUsuarioActual();
    const sede = metadata.sede || appState.currentSede || 'Sede Suroriental';
    const tipoInv = metadata.tipo_inventario || appState.currentInventario || 'CDS';

    // Generar filas de tabla
    const theadHTML = `<tr>${columns.map(c => `<th>${c.header}</th>`).join('')}</tr>`;
    const tbodyHTML = data.map((row) => {
        const cells = columns.map(col => {
            let val = row[col.key];
            if (val === undefined || val === null) val = '';
            if (col.formatter) val = col.formatter(val, row);
            const isNum = col.type === 'number' || typeof val === 'number';
            return `<td class="${isNum ? 'num' : ''}">${val}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    const printWindow = window.open('', '_blank', 'width=1150,height=850');
    if (!printWindow) {
        showToast('⚠️ El navegador bloqueó la ventana emergente de impresión. Por favor habilite los pop-ups para esta aplicación.', 'warning');
        return;
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>${titulo} - INVENTARIO CDS</title>
        <style>
            @page {
                size: letter landscape;
                margin: 10mm;
            }
            body {
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
                font-size: 9pt;
                color: #1a1a1a;
                margin: 0;
                padding: 15px;
                background: #fff;
            }
            .header-box {
                border-bottom: 2px solid #0d6efd;
                padding-bottom: 10px;
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
            }
            .title-main {
                font-size: 15pt;
                font-weight: bold;
                color: #0b5ed7;
                margin: 0;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .subtitle {
                font-size: 11pt;
                font-weight: bold;
                color: #212529;
                margin: 3px 0 0 0;
            }
            .meta-info {
                font-size: 8pt;
                color: #495057;
                text-align: right;
                line-height: 1.35;
            }
            .filter-badge-bar {
                background-color: #f8f9fa;
                border: 1px solid #dee2e6;
                padding: 5px 10px;
                font-size: 8pt;
                border-radius: 4px;
                margin-bottom: 10px;
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
            }
            .filter-item {
                display: inline-flex;
                gap: 4px;
            }
            .filter-item strong {
                color: #0d6efd;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 25px;
                font-size: 8pt;
            }
            th {
                background-color: #f1f4f9;
                color: #000;
                border: 1px solid #bcc3cc;
                padding: 5px 6px;
                font-weight: bold;
                text-align: left;
            }
            td {
                border: 1px solid #dcdfe3;
                padding: 4px 6px;
                vertical-align: middle;
            }
            tr:nth-child(even) {
                background-color: #fbfcfd;
            }
            td.num {
                text-align: right;
                font-family: 'Consolas', monospace;
                font-weight: 500;
            }
            .signatures-box {
                margin-top: 30px;
                display: flex;
                justify-content: space-between;
                page-break-inside: avoid;
                gap: 20px;
            }
            .sign-line {
                width: 30%;
                border-top: 1px solid #333;
                padding-top: 5px;
                text-align: center;
                font-size: 8pt;
                color: #333;
            }
            .footer-info {
                margin-top: 15px;
                border-top: 1px solid #eee;
                padding-top: 6px;
                font-size: 7.5pt;
                color: #888;
                display: flex;
                justify-content: space-between;
            }
            @media print {
                body { padding: 0; }
                .no-print { display: none !important; }
            }
        </style>
    </head>
    <body>
        <div class="no-print" style="margin-bottom: 15px; background: #e7f1ff; border: 1px solid #b6d4fe; padding: 10px 15px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 9pt; color: #084298;"><strong>Vista previa de impresión lista.</strong> Puede imprimir en papel o guardar como PDF en orientación horizontal.</span>
            <button onclick="window.print()" style="background: #0d6efd; color: #fff; border: none; padding: 7px 18px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 9pt;">🖨️ Imprimir / Guardar PDF</button>
        </div>

        <div class="header-box">
            <div>
                <h1 class="title-main">INVENTARIO CDS</h1>
                <div class="subtitle">${titulo}</div>
                <div style="font-size: 8.5pt; color: #6c757d; margin-top: 2px;">${subtitulo || 'Sistema de Control Físico, Trazabilidad y Auditoría de Inventarios'}</div>
            </div>
            <div class="meta-info">
                <div><strong>Sede Operativa:</strong> ${sede}</div>
                <div><strong>Inventario:</strong> ${tipoInv}</div>
                <div><strong>Responsable Emisor:</strong> ${usuarioGen}</div>
                <div><strong>Fecha de Emisión:</strong> ${fechaGen}</div>
                <div><strong>Total Registros:</strong> ${data.length}</div>
            </div>
        </div>

        ${metadata.filtrosTexto ? `
        <div class="filter-badge-bar">
            ${metadata.filtrosTexto}
        </div>
        ` : ''}

        <table>
            <thead>${theadHTML}</thead>
            <tbody>${tbodyHTML}</tbody>
        </table>

        <div class="signatures-box">
            <div class="sign-line">
                <strong>Responsable de Entrega / Despacho</strong><br>
                Nombre y Firma
            </div>
            <div class="sign-line">
                <strong>Responsable de Recepción / Almacén</strong><br>
                Nombre y Firma
            </div>
            <div class="sign-line">
                <strong>Auditoría / Control Interno</strong><br>
                Nombre y Firma
            </div>
        </div>

        <div class="footer-info">
            <span>INVENTARIO CDS • Documento Oficial de Control y Auditoría</span>
            <span>Página Oficial • Registros Verificados</span>
        </div>

        <script>
            window.onload = function() {
                setTimeout(function() {
                    window.print();
                }, 350);
            };
        </script>
    </body>
    </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

function imprimirReporteFiltradoModal() {
    if (!reporteFiltradoActivo || !reporteFiltradoActivo.data || reporteFiltradoActivo.data.length === 0) {
        showToast('⚠️ No hay registros con los filtros seleccionados para imprimir.', 'warning');
        return;
    }

    const dDesde = document.getElementById('modal-filtro-fecha-desde')?.value || '';
    const dHasta = document.getElementById('modal-filtro-fecha-hasta')?.value || '';
    const sede = document.getElementById('modal-filtro-sede')?.value || 'TODAS';
    const inv = document.getElementById('modal-filtro-tipo-inv')?.value || 'TODOS';
    const cat = document.getElementById('modal-filtro-categoria')?.value || 'TODAS';
    const ubi = document.getElementById('modal-filtro-ubicacion')?.value || 'TODAS';
    const tMov = document.getElementById('modal-filtro-tipo-mov')?.value || 'TODOS';
    const bod = document.getElementById('modal-filtro-bodega')?.value || 'TODAS';

    let filtrosTexto = '';
    if (dDesde || dHasta) filtrosTexto += `<div class="filter-item"><strong>Rango Fechas:</strong> ${dDesde || 'Inicio'} a ${dHasta || 'Hoy'}</div>`;
    if (sede && sede !== 'TODAS') filtrosTexto += `<div class="filter-item"><strong>Sede:</strong> ${sede}</div>`;
    if (inv && inv !== 'TODOS') filtrosTexto += `<div class="filter-item"><strong>Inventario:</strong> ${inv}</div>`;
    if (cat && cat !== 'TODAS') filtrosTexto += `<div class="filter-item"><strong>Categoría:</strong> ${cat}</div>`;
    if (ubi && ubi !== 'TODAS') filtrosTexto += `<div class="filter-item"><strong>Ubicación:</strong> ${ubi}</div>`;
    if (tMov && tMov !== 'TODOS') filtrosTexto += `<div class="filter-item"><strong>Tipo Mov:</strong> ${tMov}</div>`;
    if (bod && bod !== 'TODAS') filtrosTexto += `<div class="filter-item"><strong>Bodega:</strong> ${bod}</div>`;

    imprimirReporteHTML(
        reporteFiltradoActivo.title,
        `Reporte Filtrado Oficial • Generado en tiempo real`,
        reporteFiltradoActivo.columns,
        reporteFiltradoActivo.data,
        { sede, tipo_inventario: inv, filtrosTexto }
    );
}

function imprimirReporteLiveActual() {
    imprimirReporteFiltradoModal();
}

function imprimirKardexActual() {
    if (!currentKardexData || !currentKardexData.kardex || currentKardexData.kardex.length === 0) {
        showToast('⚠️ Seleccione un ítem con movimientos en el Kardex para imprimir.', 'warning');
        return;
    }
    const { item, kardex, saldo_final } = currentKardexData;
    const columns = [
        { header: 'N° Mov.', key: 'n_movimiento' },
        { header: 'Fecha', key: 'fecha' },
        { header: 'Hora', key: 'hora' },
        { header: 'Tipo Movimiento', key: 'tipo_movimiento' },
        { header: 'Origen', key: 'bodega_origen', formatter: v => v || '-' },
        { header: 'Destino / Proyecto', key: 'bodega_destino', formatter: (v, r) => v || r.proyecto_destino || '-' },
        { header: 'Responsable', key: 'responsable', formatter: (v, r) => v || r.persona_recibe_devuelve || '-' },
        { header: 'Doc. Referencia', key: 'documento_referencia', formatter: v => v || '-' },
        { header: 'Entrada (+)', key: 'entrada', type: 'number' },
        { header: 'Salida (-)', key: 'salida', type: 'number' },
        { header: 'Saldo Físico', key: 'saldo_acumulado', type: 'number' }
    ];

    const subtitulo = `Ítem: ${item.codigo} - ${item.nombre} | Categoría: ${item.categoria || 'General'} | Ubicación: ${item.ubicacion_cds || 'A1'}`;
    const metadata = {
        sede: item.sede || appState.currentSede,
        tipo_inventario: item.tipo_inventario || appState.currentInventario,
        filtrosTexto: `<div class="filter-item"><strong>Código:</strong> ${item.codigo}</div><div class="filter-item"><strong>Ítem:</strong> ${item.nombre}</div><div class="filter-item"><strong>Ubicación:</strong> ${item.ubicacion_cds || 'A1'}</div><div class="filter-item"><strong>Saldo Actual CDS:</strong> ${saldo_final} ${item.unidad_medida || 'Unidad'}</div>`
    };

    imprimirReporteHTML(`KARDEX INDIVIDUAL • ÍTEM ${item.codigo}`, subtitulo, columns, kardex, metadata);
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




