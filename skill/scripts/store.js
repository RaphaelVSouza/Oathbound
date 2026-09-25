const path = require('node:path');
const fs = require('node:fs');

let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  DatabaseSync = null;
}

/**
 * Encapsulates transactional state and claim tracking via native node:sqlite (Node 22 LTS).
 */
class GovernanceStore {
  /** @param {string} dbPath SQLite database file path or ':memory:' */
  constructor(dbPath) {
    if (!DatabaseSync) {
      throw Error('node:sqlite não está disponível nesta versão do Node.js (exige Node 22 LTS+)');
    }
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this._init();
  }

  _init() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS queue_state (
        id TEXT PRIMARY KEY,
        stage TEXT NOT NULL,
        log_path TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_claims (
        pid INTEGER PRIMARY KEY,
        label TEXT NOT NULL,
        agent TEXT NOT NULL,
        start INTEGER NOT NULL,
        scopes TEXT NOT NULL
      );
    `);

    this._stmtGetStage = this.db.prepare('SELECT stage, log_path, updated_at FROM queue_state WHERE id = ?');
    this._stmtSetStage = this.db.prepare(`
      INSERT INTO queue_state (id, stage, log_path, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        stage = excluded.stage,
        log_path = excluded.log_path,
        updated_at = excluded.updated_at
    `);
    this._stmtAllStages = this.db.prepare('SELECT id, stage, log_path, updated_at FROM queue_state ORDER BY updated_at ASC');
    this._stmtRegisterClaim = this.db.prepare(`
      INSERT INTO agent_claims (pid, label, agent, start, scopes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(pid) DO UPDATE SET
        label = excluded.label,
        agent = excluded.agent,
        start = excluded.start,
        scopes = excluded.scopes
    `);
    this._stmtReleaseClaim = this.db.prepare('DELETE FROM agent_claims WHERE pid = ?');
    this._stmtActiveClaims = this.db.prepare('SELECT pid, label, agent, start, scopes FROM agent_claims ORDER BY start ASC');
  }

  /** @param {string} id @returns {string|null} */
  getStage(id) {
    const row = this._stmtGetStage.get(id);
    return row ? row.stage : null;
  }

  /**
   * @param {string} id
   * @param {string} stage
   * @param {string|null} [logPath]
   */
  setStage(id, stage, logPath = null) {
    this._stmtSetStage.run(id, stage, logPath, Date.now());
  }

  /** @returns {Array<{ id: string, stage: string, log_path: string|null, updated_at: number }>} */
  getAllStages() {
    return this._stmtAllStages.all();
  }

  /**
   * @param {{ pid: number, label: string, agent: string, scopes: string[] }} claim
   */
  registerClaim({ pid, label, agent, scopes }) {
    this._stmtRegisterClaim.run(pid, label, agent, Date.now(), JSON.stringify(scopes));
  }

  /** @param {number} pid */
  releaseClaim(pid) {
    this._stmtReleaseClaim.run(pid);
  }

  /** @returns {Array<{ pid: number, label: string, agent: string, start: number, scopes: string[] }>} */
  getActiveClaims() {
    const rows = this._stmtActiveClaims.all();
    return rows.map(r => ({
      pid: r.pid,
      label: r.label,
      agent: r.agent,
      start: r.start,
      scopes: JSON.parse(r.scopes || '[]')
    }));
  }

  /**
   * Remove claims of dead processes.
   * @param {(pid: number) => boolean} aliveCheck
   */
  cleanStaleClaims(aliveCheck) {
    const claims = this.getActiveClaims();
    for (const c of claims) {
      if (!aliveCheck(c.pid)) {
        this.releaseClaim(c.pid);
      }
    }
  }

  close() {
    this.db.close();
  }
}

/**
 * Open or create a GovernanceStore.
 * @param {string} dbPath
 * @returns {GovernanceStore}
 */
function openGovernanceStore(dbPath) {
  return new GovernanceStore(dbPath);
}

module.exports = {
  GovernanceStore,
  openGovernanceStore,
  isSqliteAvailable: () => !!DatabaseSync
};
