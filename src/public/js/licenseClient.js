/**
 * INVENTARIO CDS - MÓDULO CLIENTE DE LICENCIAMIENTO OFFLINE
 * Esquema Challenge-Response (HMAC-SHA256) con Protección Anti-Manipulación de Reloj
 */

(function () {
    let currentLicense = null;

    // Estilos CSS para el badge y modal de activación
    const licenseStyles = `
        .license-badge-pill {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.35rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.78rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
            border: 1px solid transparent;
            user-select: none;
        }
        .license-badge-pill:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        }
        .license-active {
            background: rgba(16, 185, 129, 0.15);
            color: #34d399;
            border-color: rgba(16, 185, 129, 0.35);
        }
        .license-warning {
            background: rgba(245, 158, 11, 0.15);
            color: #fbbf24;
            border-color: rgba(245, 158, 11, 0.4);
            animation: pulse-warning 2s infinite;
        }
        .license-danger {
            background: rgba(239, 68, 68, 0.2);
            color: #f87171;
            border-color: rgba(239, 68, 68, 0.45);
            animation: pulse-danger 1.5s infinite;
        }
        @keyframes pulse-warning {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        @keyframes pulse-danger {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.03); }
        }
        
        /* Modal de Licencia */
        #licenseModalBackdrop {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(5, 10, 20, 0.85);
            backdrop-filter: blur(8px);
            z-index: 99999;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }
        .license-modal-card {
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 20px;
            width: 100%;
            max-width: 520px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
            color: #f8fafc;
            overflow: hidden;
            animation: modalFadeIn 0.3s ease-out;
        }
        @keyframes modalFadeIn {
            from { opacity: 0; transform: scale(0.95) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .license-modal-header {
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            padding: 1.25rem 1.5rem;
            border-bottom: 1px solid #334155;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .license-modal-body {
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1.2rem;
        }
        .challenge-code-box {
            background: #090e1a;
            border: 2px solid #38bdf8;
            border-radius: 12px;
            padding: 0.85rem;
            text-align: center;
            font-family: 'JetBrains Mono', monospace, monospace;
            font-size: 1.8rem;
            font-weight: 800;
            letter-spacing: 5px;
            color: #38bdf8;
            user-select: all;
            box-shadow: 0 0 15px rgba(56, 189, 248, 0.2);
        }
    `;

    // Inyectar CSS
    const styleEl = document.createElement('style');
    styleEl.innerHTML = licenseStyles;
    document.head.appendChild(styleEl);

    // Renderizar Modal en el DOM
    function injectModal() {
        if (document.getElementById('licenseModalBackdrop')) return;

        const modalHtml = `
            <div id="licenseModalBackdrop">
                <div class="license-modal-card">
                    <div class="license-modal-header">
                        <div class="d-flex align-items-center gap-2">
                            <span class="fs-4">🔐</span>
                            <div>
                                <h6 class="mb-0 fw-bold text-white">Control de Licencia • INVENTARIO CDS</h6>
                                <small class="text-secondary" id="licPlanSubtitle">Sistema de Gestión y Trazabilidad</small>
                            </div>
                        </div>
                        <button type="button" class="btn-close btn-close-white" onclick="window.LicenseClient.closeModal()" id="btnLicClose" aria-label="Cerrar"></button>
                    </div>
                    <div class="license-modal-body">
                        <!-- Alerta de Manipulación de Reloj -->
                        <div id="licClockAlert" class="alert alert-danger py-2 small" style="display: none;">
                            <strong>⚠️ Manipulación de Fecha Detectada:</strong><br>
                            El reloj del computador fue atrasado. Por favor configure la fecha y hora correcta de su sistema para continuar.
                        </div>

                        <!-- Estado Actual -->
                        <div class="d-flex justify-content-between align-items-center bg-dark bg-opacity-50 p-2.5 rounded-3 border border-secondary border-opacity-25">
                            <div>
                                <small class="text-secondary d-block">Estado del Sistema</small>
                                <strong id="licStatusText" class="text-info">Consultando...</strong>
                            </div>
                            <div class="text-end">
                                <small class="text-secondary d-block">Vencimiento</small>
                                <strong id="licExpireText" class="text-white small">--</strong>
                            </div>
                        </div>

                        <!-- Código de Desafío (Challenge) -->
                        <div>
                            <label class="form-label text-secondary small fw-bold mb-1 d-flex justify-content-between">
                                <span>1. Código de este Equipo (Desafío)</span>
                                <span class="text-info small" style="cursor: pointer;" onclick="window.LicenseClient.copyChallenge()">📋 Copiar Código</span>
                            </label>
                            <div class="challenge-code-box" id="licChallengeBox">------</div>
                            <small class="text-muted d-block mt-1" style="font-size: 0.75rem;">
                                Dicta este código de 6 dígitos a tu administrador o proveedor para recibir tu clave de activación.
                            </small>
                        </div>

                        <!-- Botón WhatsApp Directo -->
                        <button type="button" class="btn btn-success w-100 fw-bold py-2 d-flex align-items-center justify-content-center gap-2 shadow-sm" onclick="window.LicenseClient.requestViaWhatsApp()">
                            <i class="bi bi-whatsapp fs-5"></i> Solicitar Clave por WhatsApp
                        </button>

                        <hr class="border-secondary my-1">

                        <!-- Campo para Ingresar Clave -->
                        <div>
                            <label class="form-label text-secondary small fw-bold mb-1">
                                2. Ingresa la Clave de Activación Recibida
                            </label>
                            <input type="text" id="licActivationInput" class="form-control bg-dark text-white border-secondary text-center fw-bold py-2 fs-6" placeholder="Ej: 30-6DACC320" autocomplete="off" style="letter-spacing: 2px; text-transform: uppercase;">
                        </div>

                        <!-- Botón Activar -->
                        <button type="button" class="btn btn-primary w-100 fw-bold py-2.5 shadow" onclick="window.LicenseClient.activate()">
                            <i class="bi bi-key-fill me-1"></i> Activar y Desbloquear Aplicación
                        </button>
                    </div>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = modalHtml;
        document.body.appendChild(div.firstElementChild);
    }

    // Consultar estado de la licencia al servidor
    async function checkLicenseStatus(autoOpenIfInvalid = false) {
        try {
            const res = await fetch('/api/licencia/status');
            if (!res.ok) return;
            currentLicense = await res.json();
            updateUI(autoOpenIfInvalid);
        } catch (e) {
            console.warn('[Licencia] No se pudo verificar estado:', e);
        }
    }

    // Actualizar elementos de la interfaz (Navbar Badge y Modal)
    function updateUI(autoOpenIfInvalid = false) {
        if (!currentLicense) return;

        // Actualizar datos del modal
        const statusEl = document.getElementById('licStatusText');
        const expireEl = document.getElementById('licExpireText');
        const challengeEl = document.getElementById('licChallengeBox');
        const planEl = document.getElementById('licPlanSubtitle');
        const clockAlert = document.getElementById('licClockAlert');
        const closeBtn = document.getElementById('btnLicClose');

        if (challengeEl) challengeEl.innerText = currentLicense.challenge || '------';
        if (planEl) planEl.innerText = currentLicense.planName || 'INVENTARIO CDS';
        if (expireEl) expireEl.innerText = currentLicense.expiresAt || 'No activada';

        if (statusEl) {
            if (currentLicense.status === 'CLOCK_TAMPERED') {
                statusEl.innerHTML = '<span class="text-danger fw-bold">⚠️ Fecha Manipulada</span>';
                if (clockAlert) clockAlert.style.display = 'block';
            } else if (currentLicense.status === 'EXPIRED') {
                statusEl.innerHTML = '<span class="text-danger fw-bold">🔴 Licencia Expirada</span>';
                if (clockAlert) clockAlert.style.display = 'none';
            } else if (currentLicense.isTrial) {
                statusEl.innerHTML = `<span class="text-warning fw-bold">🟡 Período de Prueba (${currentLicense.daysRemaining}d restantes)</span>`;
                if (clockAlert) clockAlert.style.display = 'none';
            } else {
                statusEl.innerHTML = `<span class="text-success fw-bold">🟢 Licencia Activa (${currentLicense.daysRemaining}d restantes)</span>`;
                if (clockAlert) clockAlert.style.display = 'none';
            }
        }

        // Si la licencia expiró o el reloj está manipulado, no permitir cerrar el modal
        if (!currentLicense.isValid) {
            if (closeBtn) closeBtn.style.display = 'none';
            if (autoOpenIfInvalid) {
                openModal();
            }
        } else {
            if (closeBtn) closeBtn.style.display = 'block';
        }

        // Actualizar o inyectar Badge en la barra de navegación
        injectNavbarBadge();
    }

    function injectNavbarBadge() {
        if (!currentLicense) return;

        let badge = document.getElementById('licenseNavBadge');
        if (!badge) {
            badge = document.createElement('a');
            badge.id = 'licenseNavBadge';
            badge.href = '#';
            badge.onclick = (e) => { e.preventDefault(); openModal(); };

            // Buscar contenedor en header o navbar
            const headerRight = document.querySelector('.navbar .ms-auto') || document.querySelector('header .header-actions') || document.querySelector('.navbar');
            if (headerRight) {
                headerRight.prepend(badge);
            } else {
                badge.style.position = 'fixed';
                badge.style.bottom = '15px';
                badge.style.right = '15px';
                badge.style.zIndex = '9999';
                document.body.appendChild(badge);
            }
        }

        if (currentLicense.status === 'CLOCK_TAMPERED') {
            badge.className = 'license-badge-pill license-danger';
            badge.innerHTML = '<i class="bi bi-clock-history"></i> Error Fecha';
        } else if (currentLicense.status === 'EXPIRED') {
            badge.className = 'license-badge-pill license-danger';
            badge.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> Licencia Expirada';
        } else if (currentLicense.daysRemaining <= 5) {
            badge.className = 'license-badge-pill license-warning';
            badge.innerHTML = `<i class="bi bi-hourglass-split"></i> Vence en ${currentLicense.daysRemaining}d`;
        } else {
            badge.className = 'license-badge-pill license-active';
            badge.innerHTML = `<i class="bi bi-shield-fill-check"></i> Licencia: ${currentLicense.daysRemaining}d`;
        }
    }

    function openModal() {
        injectModal();
        checkLicenseStatus(false);
        const bd = document.getElementById('licenseModalBackdrop');
        if (bd) bd.style.display = 'flex';
    }

    function closeModal() {
        if (currentLicense && !currentLicense.isValid) {
            alert('Debe ingresar una clave de activación válida para continuar usando el sistema.');
            return;
        }
        const bd = document.getElementById('licenseModalBackdrop');
        if (bd) bd.style.display = 'none';
    }

    function copyChallenge() {
        if (!currentLicense || !currentLicense.challenge) return;
        navigator.clipboard.writeText(currentLicense.challenge).then(() => {
            alert('✅ Código de equipo copiado: ' + currentLicense.challenge);
        });
    }

    function requestViaWhatsApp() {
        if (!currentLicense || !currentLicense.challenge) return;
        const text = `Hola, necesito activar mi sistema *INVENTARIO CDS*:\n\n🔐 *Código de Equipo:* \`${currentLicense.challenge}\`\n\nPor favor envíeme la clave de activación.`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    }

    async function activate() {
        const input = document.getElementById('licActivationInput');
        const key = input ? input.value.trim() : '';

        if (!key) {
            alert('Por favor ingrese la clave de activación.');
            return;
        }

        try {
            const res = await fetch('/api/licencia/activar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clave: key })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                alert(`🎉 ¡Activación Exitosa!\n${data.message}\nNueva fecha de vencimiento: ${data.newExpiration}`);
                input.value = '';
                await checkLicenseStatus(false);
                closeModal();
            } else {
                alert('❌ Error al activar: ' + (data.error || 'Clave inválida'));
            }
        } catch (e) {
            alert('❌ Error de conexión al procesar la activación: ' + e.message);
        }
    }

    // Inicialización automática
    window.addEventListener('DOMContentLoaded', () => {
        injectModal();
        checkLicenseStatus(true);
        // Comprobar cada 15 minutos en segundo plano
        setInterval(() => checkLicenseStatus(false), 15 * 60 * 1000);
    });

    // Exponer API global
    window.LicenseClient = {
        openModal,
        closeModal,
        checkStatus: checkLicenseStatus,
        copyChallenge,
        requestViaWhatsApp,
        activate
    };
})();
