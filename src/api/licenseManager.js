const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Clave secreta maestra del desarrollador/administrador y salt del sistema
const MASTER_SECRET_KEY = process.env.MASTER_LICENSE_KEY || "9204Andres9204";
const APP_SECRET_SALT = "CDS_LICENSE_SALT_V1";
const TOLERANCE_MS = 60 * 1000; // 1 minuto de tolerancia para fluctuaciones de reloj
const INITIAL_GRANT_DAYS = 30;  // 30 días iniciales en la primera instalación por equipo

class LicenseManager {
    constructor() {
        this.db = null;
        this.cachedStatus = null;
        this.machineId = null;
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

    // Obtener huella única de hardware del equipo (Machine ID) para evitar clonar licencias entre PCs
    getMachineId() {
        if (this.machineId) return this.machineId;

        let winGuid = '';
        if (process.platform === 'win32') {
            try {
                const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'ignore'],
                    timeout: 2000
                });
                const match = out.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
                if (match && match[1]) winGuid = match[1].trim();
            } catch (_) {}
        }

        const cpus = os.cpus() || [];
        const cpuModel = cpus.length > 0 ? cpus[0].model : 'GENERIC_CPU';
        const rawFingerprint = [
            winGuid,
            os.hostname(),
            os.platform(),
            os.arch(),
            cpuModel,
            cpus.length,
            os.totalmem()
        ].join('|');

        this.machineId = crypto
            .createHmac('sha256', MASTER_SECRET_KEY)
            .update(`HW:${rawFingerprint}:${APP_SECRET_SALT}`)
            .digest('hex')
            .substring(0, 24)
            .toUpperCase();

        return this.machineId;
    }

    // Rutas persistentes ocultas en el sistema operativo que sobreviven a desinstalaciones y borrado de AppData\Roaming\inventario-cds
    getAnchorPaths() {
        const paths = [];
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';

        paths.push(path.join(localAppData, 'Microsoft', 'CLR_Cache_v4', '.cds_hw_lic.dat'));
        paths.push(path.join(programData, 'CDS_System_Core', '.cds_hw_lic.dat'));
        paths.push(path.join(os.homedir(), '.config', '.cds_hw_lic.dat'));
        return paths;
    }

    signAnchorPayload(payload) {
        const dataStr = `${payload.machine_id}|${payload.challenge_code}|${payload.status}|${payload.activated_at}|${payload.expires_at}|${payload.last_known_time}|${payload.authorized_days}`;
        return crypto.createHmac('sha256', MASTER_SECRET_KEY).update(dataStr).digest('hex').toUpperCase();
    }

    readPersistentAnchor() {
        const currentMachine = this.getMachineId();
        const anchorPaths = this.getAnchorPaths();
        let bestAnchor = null;

        for (const p of anchorPaths) {
            try {
                if (!fs.existsSync(p)) continue;
                const raw = fs.readFileSync(p, 'utf8');
                const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
                if (!parsed || parsed.machine_id !== currentMachine) continue;

                const expectedSig = this.signAnchorPayload(parsed);
                if (parsed.sig !== expectedSig) continue;

                // Elegir el registro más reciente si existen varios
                if (!bestAnchor || (parsed.last_known_time || 0) > (bestAnchor.last_known_time || 0)) {
                    bestAnchor = parsed;
                }
            } catch (_) {}
        }
        return bestAnchor;
    }

    writePersistentAnchor(record) {
        const payload = {
            machine_id: record.machine_id || this.getMachineId(),
            challenge_code: record.challenge_code,
            status: record.status,
            activated_at: record.activated_at,
            expires_at: record.expires_at,
            last_known_time: record.last_known_time,
            license_key: record.license_key || null,
            authorized_days: record.authorized_days || INITIAL_GRANT_DAYS,
            plan_name: record.plan_name || `Licencia Inicial (${INITIAL_GRANT_DAYS} Días)`
        };
        payload.sig = this.signAnchorPayload(payload);
        const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

        for (const p of this.getAnchorPaths()) {
            try {
                const dir = path.dirname(p);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(p, encoded, 'utf8');
            } catch (_) {}
        }
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

    // Inicializar tabla de licencias en la base de datos SQLite con protección Anti-Clonación de PC y Anti-Reinstalación
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
                plan_name TEXT DEFAULT 'Licencia Estándar CDS',
                machine_id TEXT
            )
        `);

        // Asegurar columna machine_id en bases de datos antiguas
        try {
            await this.dbRun(`ALTER TABLE sistema_licencia ADD COLUMN machine_id TEXT`);
        } catch (_) {}

        const currentMachine = this.getMachineId();
        const now = Date.now();
        let row = await this.dbGet("SELECT * FROM sistema_licencia WHERE id = 1");
        const anchor = this.readPersistentAnchor();

        // CASO 1: Ya existe huella persistente en este PC (protección contra desinstalar/reinstalar o borrar DB)
        if (anchor) {
            // Si la DB fue reemplazada, borrada, o viene de otro PC, prevalece el estado real del equipo (o el más restrictivo en tiempo)
            const dbBelongsToThisPc = row && row.machine_id === currentMachine;
            const effectiveLastTime = dbBelongsToThisPc
                ? Math.max(row.last_known_time || 0, anchor.last_known_time || 0)
                : (anchor.last_known_time || now);

            // Si en la DB de este mismo PC se activó una licencia más reciente que la del anchor, usarla; si se reinstaló para intentar reiniciar los 30 días, usar el anchor
            let effectiveRecord = anchor;
            if (dbBelongsToThisPc && row.license_key && row.activated_at > (anchor.activated_at || 0)) {
                effectiveRecord = row;
            }

            let newStatus = effectiveRecord.status;
            if (now < (effectiveLastTime - TOLERANCE_MS)) {
                newStatus = 'CLOCK_TAMPERED';
            } else if (now >= effectiveRecord.expires_at) {
                newStatus = 'EXPIRED';
            }

            const updatedTime = Math.max(now, effectiveLastTime);

            if (!row) {
                await this.dbRun(`
                    INSERT INTO sistema_licencia (id, challenge_code, status, activated_at, expires_at, last_known_time, license_key, authorized_days, plan_name, machine_id)
                    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    effectiveRecord.challenge_code,
                    newStatus,
                    effectiveRecord.activated_at,
                    effectiveRecord.expires_at,
                    updatedTime,
                    effectiveRecord.license_key,
                    effectiveRecord.authorized_days,
                    effectiveRecord.plan_name,
                    currentMachine
                ]);
            } else {
                await this.dbRun(`
                    UPDATE sistema_licencia
                    SET challenge_code = ?,
                        status = ?,
                        activated_at = ?,
                        expires_at = ?,
                        last_known_time = ?,
                        license_key = ?,
                        authorized_days = ?,
                        plan_name = ?,
                        machine_id = ?
                    WHERE id = 1
                `, [
                    effectiveRecord.challenge_code,
                    newStatus,
                    effectiveRecord.activated_at,
                    effectiveRecord.expires_at,
                    updatedTime,
                    effectiveRecord.license_key,
                    effectiveRecord.authorized_days,
                    effectiveRecord.plan_name,
                    currentMachine
                ]);
            }

            this.writePersistentAnchor({
                ...effectiveRecord,
                status: newStatus,
                last_known_time: updatedTime,
                machine_id: currentMachine
            });
            return;
        }

        // CASO 2: No existe anchor en este PC aún (Primera vez que se ejecuta en este equipo)
        // Si la DB no tiene fila, o la fila viene empaquetada de otro PC (row.machine_id !== currentMachine):
        // Otorgar los 30 días iniciales exclusivos para este PC y sellar el anchor permanente del equipo
        if (!row || (row.machine_id && row.machine_id !== currentMachine)) {
            const initialChallenge = this.generateChallengeCode();
            const expiresAt = now + (INITIAL_GRANT_DAYS * 24 * 60 * 60 * 1000);
            const planName = `Licencia Inicial (${INITIAL_GRANT_DAYS} Días)`;

            if (!row) {
                await this.dbRun(`
                    INSERT INTO sistema_licencia (id, challenge_code, status, activated_at, expires_at, last_known_time, license_key, authorized_days, plan_name, machine_id)
                    VALUES (1, ?, 'ACTIVE', ?, ?, ?, NULL, ?, ?, ?)
                `, [initialChallenge, now, expiresAt, now, INITIAL_GRANT_DAYS, planName, currentMachine]);
            } else {
                await this.dbRun(`
                    UPDATE sistema_licencia
                    SET challenge_code = ?,
                        status = 'ACTIVE',
                        activated_at = ?,
                        expires_at = ?,
                        last_known_time = ?,
                        license_key = NULL,
                        authorized_days = ?,
                        plan_name = ?,
                        machine_id = ?
                    WHERE id = 1
                `, [initialChallenge, now, expiresAt, now, INITIAL_GRANT_DAYS, planName, currentMachine]);
            }

            this.writePersistentAnchor({
                machine_id: currentMachine,
                challenge_code: initialChallenge,
                status: 'ACTIVE',
                activated_at: now,
                expires_at: expiresAt,
                last_known_time: now,
                license_key: null,
                authorized_days: INITIAL_GRANT_DAYS,
                plan_name: planName
            });

            console.log(`[LICENCIA] Primera instalación en equipo (${currentMachine}). Otorgados ${INITIAL_GRANT_DAYS} días iniciales. Desafío: ${initialChallenge}`);
            return;
        }

        // CASO 3: La DB ya tenía un registro sin machine_id en este equipo; vincularlo a este equipo y crear el anchor
        let status = row.status;
        if (now < (row.last_known_time - TOLERANCE_MS)) {
            status = 'CLOCK_TAMPERED';
        }
        const updatedTime = Math.max(now, row.last_known_time || now);

        await this.dbRun(`
            UPDATE sistema_licencia
            SET status = ?, last_known_time = ?, machine_id = ?
            WHERE id = 1
        `, [status, updatedTime, currentMachine]);

        this.writePersistentAnchor({
            ...row,
            status,
            last_known_time: updatedTime,
            machine_id: currentMachine
        });
    }

    // Obtener estado actual de la licencia
    async getStatus(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && this.cachedStatus && this.lastStatusCheck && (now - this.lastStatusCheck < 2500)) {
            return this.cachedStatus;
        }

        const currentMachine = this.getMachineId();
        let row = await this.dbGet("SELECT * FROM sistema_licencia WHERE id = 1");

        // Verificar contra el anchor persistente del equipo por si reemplazaron el archivo .db en caliente
        const anchor = this.readPersistentAnchor();
        if (anchor && (!row || row.machine_id !== currentMachine || (row.expires_at > anchor.expires_at && row.license_key !== anchor.license_key))) {
            await this.init();
            row = await this.dbGet("SELECT * FROM sistema_licencia WHERE id = 1");
        }

        if (!row) {
            const res = {
                status: 'UNLICENSED',
                challenge: this.generateChallengeCode(),
                daysRemaining: 0,
                expiresAt: null,
                message: 'Sistema no licenciado',
                isValid: false
            };
            this.cachedStatus = res;
            this.lastStatusCheck = now;
            return res;
        }

        // Verificar manipulación de reloj
        if (now < (row.last_known_time - TOLERANCE_MS)) {
            const res = {
                status: 'CLOCK_TAMPERED',
                challenge: row.challenge_code,
                daysRemaining: 0,
                expiresAt: new Date(row.expires_at).toISOString(),
                lastKnownDate: new Date(row.last_known_time).toISOString(),
                planName: row.plan_name,
                message: 'Manipulación de fecha detectada. Por favor ajuste la hora y fecha correcta de su equipo.',
                isValid: false
            };
            this.cachedStatus = res;
            this.lastStatusCheck = now;
            return res;
        }

        // Actualizar último timestamp conocido solo si pasaron al menos 15 segundos para no sobrecargar SQLite
        if (now - row.last_known_time > 15000) {
            await this.dbRun("UPDATE sistema_licencia SET last_known_time = ? WHERE id = 1", [now]);
            this.writePersistentAnchor({ ...row, last_known_time: now, machine_id: currentMachine });
        }

        let status = row.status;
        const diffMs = row.expires_at - now;
        const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

        if (status === 'CLOCK_TAMPERED' && now >= row.last_known_time) {
            status = daysRemaining > 0 ? 'ACTIVE' : 'EXPIRED';
            await this.dbRun("UPDATE sistema_licencia SET status = ? WHERE id = 1", [status]);
            this.writePersistentAnchor({ ...row, status, last_known_time: now, machine_id: currentMachine });
        }

        if (daysRemaining <= 0 && status !== 'EXPIRED') {
            status = 'EXPIRED';
            await this.dbRun("UPDATE sistema_licencia SET status = 'EXPIRED' WHERE id = 1");
            this.writePersistentAnchor({ ...row, status: 'EXPIRED', last_known_time: now, machine_id: currentMachine });
        }

        const result = {
            status: status,
            challenge: row.challenge_code,
            daysRemaining: daysRemaining,
            expiresAt: new Date(row.expires_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            expiresAtTimestamp: row.expires_at,
            authorizedDays: row.authorized_days,
            planName: row.plan_name,
            machineId: currentMachine,
            isTrial: status === 'TRIAL',
            isExpired: status === 'EXPIRED',
            isClockTampered: status === 'CLOCK_TAMPERED',
            isValid: (status === 'ACTIVE' || status === 'TRIAL') && daysRemaining > 0
        };

        this.cachedStatus = result;
        this.lastStatusCheck = now;
        return result;
    }

    // Activar o renovar licencia mediante clave Challenge-Response vinculada únicamente al código de desafío de este PC
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
        const currentMachine = this.getMachineId();
        // Si la licencia actual todavía tiene días válidos, se acumulan los nuevos días; si es activación exacta a 30 días solicitada o vencida, parte desde hoy
        const baseTime = (row.expires_at > now && row.status === 'ACTIVE') ? row.expires_at : now;
        const newExpiresAt = baseTime + (days * 24 * 60 * 60 * 1000);

        // Generar un nuevo código de desafío único para la siguiente renovación futura (inutiliza la clave usada inmediatamente)
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
                plan_name = ?,
                machine_id = ?
            WHERE id = 1
        `, [nextChallenge, now, newExpiresAt, now, cleanKey, days, planName, currentMachine]);

        this.writePersistentAnchor({
            machine_id: currentMachine,
            challenge_code: nextChallenge,
            status: 'ACTIVE',
            activated_at: now,
            expires_at: newExpiresAt,
            last_known_time: now,
            license_key: cleanKey,
            authorized_days: days,
            plan_name: planName
        });

        this.cachedStatus = null;
        console.log(`[LICENCIA] Activación exitosa en equipo ${currentMachine} por ${days} días. Vence: ${new Date(newExpiresAt).toISOString()}. Próximo desafío: ${nextChallenge}`);

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
        const row = await this.dbGet("SELECT * FROM sistema_licencia WHERE id = 1");
        if (row) {
            this.writePersistentAnchor({ ...row, challenge_code: newChallenge });
        }
        this.cachedStatus = null;
        return newChallenge;
    }
}

module.exports = new LicenseManager();
