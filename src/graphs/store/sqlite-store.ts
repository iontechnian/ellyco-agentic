import { BaseStore } from "./base-store";
import { Database } from "better-sqlite3";

/**
 * A store implementation using SQLite for persistent storage of graph run state.
 * Provides reliable checkpoint-based resumption across sessions.
 * 
 * @class SQLiteStore
 * @extends {BaseStore}
 * 
 * @example
 * ```typescript
 * import Database from "better-sqlite3";
 * 
 * // Create or open a database
 * const db = new Database("runs.db");
 * const store = new SQLiteStore(db, "graph_runs");
 * 
 * // Use with graph for persistent execution
 * const result = await graph.invoke(initialState, { store });
 * 
 * // Later, resume from checkpoint
 * if (result.exitReason === "interrupt") {
 *   const result2 = await graph.invoke(result.state, { store, resumeFrom: result.cursor });
 * }
 * 
 * // Clean up
 * await store.dispose();
 * ```
 */
export class SQLiteStore extends BaseStore {

    /**
     * Creates a new SQLite store.
     * Automatically creates the table if it doesn't exist.
     * 
     * @param {Database} db - The SQLite database connection
     * @param {string} [tableName="runs"] - Name of the table for storing runs
     */
    constructor(private readonly db: Database, private readonly tableName: string = "runs") {
        super();
        this.db.prepare(`CREATE TABLE IF NOT EXISTS ${this.tableName} (run_id TEXT PRIMARY KEY, cursor TEXT, state TEXT)`).run();
    }

    /**
     * Saves the state and cursor for a run.
     * Creates a new record or updates existing one.
     * 
     * @async
     * @param {string} runId - Unique run identifier
     * @param {string} cursor - Encoded graph position
     * @param {object} state - State to persist
     * @returns {Promise<void>}
     */
    async save(runId: string, cursor: string, state: object): Promise<void> {
        this.db.prepare(
            `INSERT INTO ${this.tableName} (run_id, cursor, state) VALUES (?, ?, ?)
             ON CONFLICT(run_id) DO UPDATE SET cursor = excluded.cursor, state = excluded.state`
        ).run(runId, cursor, JSON.stringify(state));
    }

    /**
     * Checks if a run exists in the store.
     * 
     * @async
     * @param {string} runId - Unique run identifier
     * @returns {Promise<boolean>} True if the run exists
     */
    async exists(runId: string): Promise<boolean> {
        const result = this.db.prepare(`SELECT 1 FROM ${this.tableName} WHERE run_id = ?`).get(runId) as { run_id: string, cursor: string, state: string };
        return result !== undefined;
    }

    /**
     * Loads the saved state and cursor for a run.
     * 
     * @async
     * @param {string} runId - Unique run identifier
     * @returns {Promise<{cursor: string, state: object}>} The saved checkpoint
     * @throws {Error} If the run is not found
     */
    async load(runId: string): Promise<{ cursor: string, state: object }> {
        const result = this.db.prepare(`SELECT cursor, state FROM ${this.tableName} WHERE run_id = ?`).get(runId) as { run_id: string, cursor: string, state: string };
        if (!result) {
            throw new Error(`Run ${runId} not found`);
        }
        return { cursor: result.cursor, state: JSON.parse(result.state) };
    }

    /**
     * Deletes a run from the store.
     * 
     * @async
     * @param {string} runId - Unique run identifier
     * @returns {Promise<void>}
     */
    async delete(runId: string): Promise<void> {
        this.db.prepare(`DELETE FROM ${this.tableName} WHERE run_id = ?`).run(runId);
    }

    /**
     * Closes the database connection and releases resources.
     * 
     * @async
     * @returns {Promise<void>}
     */
    async dispose(): Promise<void> {
        this.db.close();
    }
}