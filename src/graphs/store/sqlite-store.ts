import { BaseStore } from "./base-store";
import { Database } from "better-sqlite3";

export class SQLiteStore extends BaseStore {

    constructor(private readonly db: Database, private readonly tableName: string = "runs") {
        super();
        this.db.prepare(`CREATE TABLE IF NOT EXISTS ${this.tableName} (run_id TEXT PRIMARY KEY, cursor TEXT, state TEXT)`).run();
    }

    async save(runId: string, cursor: string, state: object): Promise<void> {
        this.db.prepare(
            `INSERT INTO ${this.tableName} (run_id, cursor, state) VALUES (?, ?, ?)
             ON CONFLICT(run_id) DO UPDATE SET cursor = excluded.cursor, state = excluded.state`
        ).run(runId, cursor, JSON.stringify(state));
    }

    async exists(runId: string): Promise<boolean> {
        const result = this.db.prepare(`SELECT 1 FROM ${this.tableName} WHERE run_id = ?`).get(runId) as { run_id: string, cursor: string, state: string };
        return result !== undefined;
    }

    async load(runId: string): Promise<{ cursor: string, state: object }> {
        const result = this.db.prepare(`SELECT cursor, state FROM ${this.tableName} WHERE run_id = ?`).get(runId) as { run_id: string, cursor: string, state: string };
        if (!result) {
            throw new Error(`Run ${runId} not found`);
        }
        return { cursor: result.cursor, state: JSON.parse(result.state) };
    }

    async delete(runId: string): Promise<void> {
        this.db.prepare(`DELETE FROM ${this.tableName} WHERE run_id = ?`).run(runId);
    }

    async dispose(): Promise<void> {
        this.db.close();
    }
}