const path = require('node:path');
const fs = require('node:fs');

let DatabaseSync: any;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  DatabaseSync = null;
}

interface QueueStageRecord {
  id: string;
  stage: string;
  log_path: string | null;
  updated_at: number;
}

interface AgentClaim {
  pid: number;
  label: string;
  agent: string;
  start: number;
  scopes: string[];
}

interface RegisterClaimParams {
  pid: number;
  label: string;
  agent: string;
  scopes: string[];
}

/**
 * Encapsulates transactional state and claim tracking via native node:sqlite (Node 24 LTS).
 */
class OathboundStore {
  db: any;
  private _stmtGetStage: any;
  private _stmtSetStage: any;
  private _stmtAllStages: any;
  private _stmtRegisterClaim: any;
  private _stmtReleaseClaim: any;
  private _stmtActiveClaims: any;

  /** @param {string} dbPath SQLite database file path or ':memory:' */
  constructor(dbPath: string) {
    if (!DatabaseSync) {
      throw Error('node:sqlite não está disponível nesta versão do Node.js (exige Node 24 LTS+)');
    }
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this._init();
  }

  private _init(): void {
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

  /**
   * Run operations inside a structured SQLite transaction.
   * Automatically executes BEGIN, commits on success, or rolls back if an error is thrown.
   */
  async transaction<T>(fn: (store: OathboundStore) => T | Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const res = await fn(this);
      this.db.exec('COMMIT');
      return res;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  getStage(id: string): string | null {
    const row = this._stmtGetStage.get(id);
    return row ? row.stage : null;
  }

  setStage(id: string, stage: string, logPath: string | null = null): void {
    this._stmtSetStage.run(id, stage, logPath, Date.now());
  }

  getAllStages(): QueueStageRecord[] {
    return this._stmtAllStages.all();
  }

  registerClaim({ pid, label, agent, scopes }: RegisterClaimParams): void {
    this._stmtRegisterClaim.run(pid, label, agent, Date.now(), JSON.stringify(scopes));
  }

  releaseClaim(pid: number): void {
    this._stmtReleaseClaim.run(pid);
  }

  getActiveClaims(): AgentClaim[] {
    const rows = this._stmtActiveClaims.all();
    return rows.map((r: any) => ({
      pid: r.pid,
      label: r.label,
      agent: r.agent,
      start: r.start,
      scopes: JSON.parse(r.scopes || '[]')
    }));
  }

  cleanStaleClaims(aliveCheck: (pid: number) => boolean): void {
    const claims = this.getActiveClaims();
    for (const c of claims) {
      if (!aliveCheck(c.pid)) {
        this.releaseClaim(c.pid);
      }
    }
  }

  close(): void {
    this.db.close();
  }
}

function openStore(dbPath: string): OathboundStore {
  return new OathboundStore(dbPath);
}

module.exports = {
  OathboundStore,
  openStore,
  isSqliteAvailable: () => !!DatabaseSync
};
