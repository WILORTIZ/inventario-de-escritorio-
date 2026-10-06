const crypto = require('crypto');

// Clave secreta maestra del desarrollador/administrador y salt del sistema
const MASTER_SECRET_KEY = process.env.MASTER_LICENSE_KEY || "9204Andres9204";
const APP_SECRET_SALT = "CDS_LICENSE_SALT_V1";
const TOLERANCE_MS = 60 * 1000; // 1 minuto de tolerancia para fluctuaciones de reloj

class LicenseManager {
    constructor() {
        this.db = null;
        this.cachedStatus = null;
    }

    setDb(dbInstance) {
        this.db = dbInstance;
    }

    // Helper para consultas Promise
    async dbRun(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    async dbGet(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // Generar código de desafío aleatorio de 6 dígitos
    generateChallengeCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Calcular firma criptográfica esperada HMAC-SHA256 (4 bytes = 8 caracteres hexadecimales)
    computeSignature(challenge, days) {
        const message = `LIC:${challenge}:${days}:${APP_SECRET_SALT}`;
        const hmac = crypto.createHmac('sha256', MASTER_SECRET_KEY);
        hmac.update(message);
        const fullHash = hmac.digest('hex').toUpperCase();
        return fullHash.substring(0, 8); // Primeros 4 bytes en hex
    }

    // Inicializar tabla de licencias en la base de datos SQLite
    async init() {
        if (!this.db) throw new Error("Base de datos no vinculada a LicenseManager");

        await this.dbRun(`
            CREATE TABLE IF NOT EXISTS sistema_licencia (
                id INTEGER PRIMARY KEY,
                challenge_code TEXT NOT NULL,
                status TEXT NOT NULL, -- 'ACTIVE', 'EXPIRED', 'CLOCK_TAMPERED', 'TRIAL'
                activated_at INTEGER,
                expires_at INTEGER NOT NULL,
                last_known_time INTEGER NOT NULL,
                license_key TEXT,
                authorized_days INTEGER DEFAULT 0,
                plan_name TEXT DEFAULT 'Licencia Estándar CDS'
            )
        `);

        // Comprobar si ya existe registro de licencia
        let row = await this.dbGet("SELECT * FROM sistema_licencia WHERE id = 1");
        const now = Date.now();

        if (!row) {
            // Primera instalación: Otorgar 7 días de período de prueba gratuito
            const initialChallenge = this.generateChallengeCode();
            const trialDays = 7;
            const expiresAt = now + (trialDays * 24 * 60 * 60 * 1000);

            await this.dbRun(`
                INSERT INTO sistema_licencia (id, challenge_code, status, activated_at, expires_at, last_known_time, authorized_days, plan_name)
                VALUES (1, ?, 'TRIAL', ?, ?, ?, ?, 'Período de Prueba (7 Días)')
            `, [initialChallenge, now, expiresAt, now, trialDays]);

            console.log(`[LICENCIA] Sistema inicializado con período de prueba (7 días). Desafío: ${initialChallenge}`);
        } else {
            // Verificación Anti-Atraso de Reloj (Clock Tampering Check)
            if (now < (row.last_known_time - TOLERANCE_MS)) {
                console.error(`[LICENCIA - ALERTA] Detección de manipulación de fecha del sistema. Reloj actual: ${new Date(now).toISOString()}, Última fecha registrada: ${new Date(row.last_known_time).toISOString()}`);
                await this.dbRun("UPDATE sistema_licencia SET status = 'CLOCK_TAMPERED' WHERE id = 1");
            } else {
                // Actualizar last_known_time de forma estrictamente creciente
                await this.dbRun("UPDATE sistema_licencia SET last_known_time = ? WHERE id = 1", [now]);
            }
        }
    }

    // Obtener estado actual de la licencia
    async getStatus() {
        const row = await this.dbGet("SELECT * FROM sistema_licencia WHERE id = 1");
        if (!row) {
            return {
                status: 'UNLICENSED',
                challenge: this.generateChallengeCode(),
                daysRemaining: 0,
                expiresAt: null,
                message: 'Sistema no licenciado'
            };
        }

        const now = Date.now();

        // Verificar manipulación de reloj
        if (now < (row.last_known_time - TOLERANCE_MS)) {
            return {
                status: 'CLOCK_TAMPERED',
                challenge: row.challenge_code,
                daysRemaining: 0,
                expiresAt: new Date(row.expires_at).toISOString(),
                lastKnownDate: new Date(row.last_known_time).toISOString(),
                planName: row.plan_name,
                message: 'Manipulación de fecha detectada. Por favor ajuste la hora y fecha correcta de su equipo.'
            };
        }

        // Actualizar último timestamp conocido
        await this.dbRun("UPDATE sistema_licencia SET last_known_time = ? WHERE id = 1", [now]);

        // Si el estado está explícitamente manipulado pero ya el reloj es superior a last_known_time
        let status = row.status;
        const diffMs = row.expires_at - now;
        const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

        if (status === 'CLOCK_TAMPERED' && now >= row.last_known_time) {
            status = daysRemaining > 0 ? (row.authorized_days === 7 ? 'TRIAL' : 'ACTIVE') : 'EXPIRED';
            await this.dbRun("UPDATE sistema_licencia SET status = ? WHERE id = 1", [status]);
        }

        if (daysRemaining <= 0 && status !== 'EXPIRED') {
            status = 'EXPIRED';
            await this.dbRun("UPDATE sistema_licencia SET status = 'EXPIRED' WHERE id = 1");
        }

        return {
            status: status,
            challenge: row.challenge_code,
            daysRemaining: daysRemaining,
            expiresAt: new Date(row.expires_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            expiresAtTimestamp: row.expires_at,
            authorizedDays: row.authorized_days,
            planName: row.plan_name,
            isTrial: status === 'TRIAL',
            isExpired: status === 'EXPIRED',
            isClockTampered: status === 'CLOCK_TAMPERED',
            isValid: (status === 'ACTIVE' || status === 'TRIAL') && daysRemaining > 0
        };
    }

    // Activar o renovar licencia mediante clave Challenge-Response
    async activateLicense(activationKey) {
        if (!activationKey || typeof activationKey !== 'string') {
            throw new Error("Clave de activación requerida");
        }

        const cleanKey = activationKey.trim().toUpperCase();
        const parts = cleanKey.split('-');
        if (parts.length !== 2) {
            throw new Error("Formato de clave inválido. Debe tener la estructura: [DÍAS]-[FIRMA] (Ej: 30-5A033FBF)");
        }

        const days = parseInt(parts[0], 10);
        const providedSignature = parts[1];

        if (isNaN(days) || days <= 0) {
            throw new Error("Número de días inválido en la clave");
        }

        const row = await this.dbGet("SELECT * FROM sistema_licencia WHERE id = 1");
        if (!row) throw new Error("Registro de licencia no encontrado");

        const expectedSignature = this.computeSignature(row.challenge_code, days);

        if (providedSignature !== expectedSignature) {
            throw new Error("Clave de activación no válida para este equipo o código de desafío.");
        }

        const now = Date.now();
        // Si la licencia actual todavía tiene días válidos, se acumulan los nuevos días
        const baseTime = (row.expires_at > now && row.status === 'ACTIVE') ? row.expires_at : now;
        const newExpiresAt = baseTime + (days * 24 * 60 * 60 * 1000);

        // Generar un nuevo código de desafío para la siguiente renovación futura
        const nextChallenge = this.generateChallengeCode();
        const planName = days >= 365 ? (days >= 9999 ? 'Licencia Vitalicia CDS' : 'Suscripción Anual CDS') : `Licencia ${days} Días CDS`;

        await this.dbRun(`
            UPDATE sistema_licencia 
            SET challenge_code = ?,
                status = 'ACTIVE',
                activated_at = ?,
                expires_at = ?,
                last_known_time = ?,
                license_key = ?,
                authorized_days = ?,
                plan_name = ?
            WHERE id = 1
        `, [nextChallenge, now, newExpiresAt, now, cleanKey, days, planName]);

        console.log(`[LICENCIA] Activación exitosa por ${days} días. Vence: ${new Date(newExpiresAt).toISOString()}. Próximo desafío: ${nextChallenge}`);

        return {
            success: true,
            message: `¡Sistema activado con éxito por ${days} días!`,
            daysAuthorized: days,
            newExpiration: new Date(newExpiresAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' }),
            nextChallenge: nextChallenge
        };
    }

    // Regenerar código de desafío a petición
    async rotateChallenge() {
        const newChallenge = this.generateChallengeCode();
        await this.dbRun("UPDATE sistema_licencia SET challenge_code = ? WHERE id = 1", [newChallenge]);
        return newChallenge;
    }
}

module.exports = new LicenseManager();
