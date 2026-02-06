import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface SessionRecord {
  id: string;
  started_at: string;
  agent_name: string | null;
  command: string | null;
}

export interface EventRecord {
  id: number;
  session_id: string;
  timestamp: string;
  tool_name: string;
  args_json: string | null;
  result_json: string | null;
  duration_ms: number | null;
  status: string;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    agent_name TEXT,
    command TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    timestamp TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    args_json TEXT,
    result_json TEXT,
    duration_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'pending'
  );
`;

export class EventStore {
  private db: DatabaseSync;

  constructor(dbPath = ".witness/events.db") {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(SCHEMA);
  }

  createSession(agentName: string, command: string): string {
    const id = randomUUID();
    const stmt = this.db.prepare(
      "INSERT INTO sessions (id, started_at, agent_name, command) VALUES (?, ?, ?, ?)"
    );
    stmt.run(id, new Date().toISOString(), agentName, command);
    return id;
  }

  logEvent(sessionId: string, toolName: string, args: unknown): string {
    const stmt = this.db.prepare(
      "INSERT INTO events (session_id, timestamp, tool_name, args_json, status) VALUES (?, ?, ?, ?, 'pending')"
    );
    const result = stmt.run(
      sessionId,
      new Date().toISOString(),
      toolName,
      JSON.stringify(args)
    );
    return String(result.lastInsertRowid);
  }

  completeEvent(eventId: string, result: unknown, durationMs: number): void {
    const stmt = this.db.prepare(
      "UPDATE events SET result_json = ?, duration_ms = ?, status = 'completed' WHERE id = ?"
    );
    stmt.run(JSON.stringify(result), durationMs, Number(eventId));
  }

  failEvent(eventId: string, error: string, durationMs: number): void {
    const stmt = this.db.prepare(
      "UPDATE events SET result_json = ?, duration_ms = ?, status = 'failed' WHERE id = ?"
    );
    stmt.run(JSON.stringify({ error }), durationMs, Number(eventId));
  }

  getSessionEvents(sessionId: string): EventRecord[] {
    const stmt = this.db.prepare(
      "SELECT * FROM events WHERE session_id = ? ORDER BY id ASC"
    );
    return stmt.all(sessionId) as unknown as EventRecord[];
  }

  getRecentSessions(limit = 20): SessionRecord[] {
    const stmt = this.db.prepare(
      "SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?"
    );
    return stmt.all(limit) as unknown as SessionRecord[];
  }

  close(): void {
    this.db.close();
  }
}
