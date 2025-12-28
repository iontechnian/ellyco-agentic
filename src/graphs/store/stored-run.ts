import { BaseStore } from "./base-store";

/**
 * Wrapper for interacting with a specific run's stored state and cursor.
 * Provides a convenient interface for saving, loading, and managing individual runs.
 * 
 * @class StoredRun
 * 
 * @example
 * ```typescript
 * const storedRun = store.getStoredRun("run-123");
 * 
 * // Check if run exists
 * if (await storedRun.exists()) {
 *   const { cursor, state } = await storedRun.load();
 *   console.log("Previously interrupted at:", cursor);
 * }
 * 
 * // Save run state
 * await storedRun.save("node-5", { data: "updated" });
 * 
 * // Clean up when done
 * await storedRun.delete();
 * ```
 */
export class StoredRun {
    /**
     * Creates a wrapper for a specific run.
     * 
     * @param {string} runId - Unique identifier for this run
     * @param {BaseStore} store - The underlying store implementation
     */
    constructor(public readonly runId: string, private readonly store: BaseStore) {
    }

    /**
     * Saves the current state and cursor position of this run.
     * 
     * @param {string} cursor - Encoded position in the graph
     * @param {object} state - Complete state at this checkpoint
     * @returns {Promise<void>}
     * 
     * @example
     * ```typescript
     * await storedRun.save("node-process", { count: 42, data: [...] });
     * ```
     */
    async save(cursor: string, state: object): Promise<void> {
        await this.store.save(this.runId, cursor, state);
    }

    /**
     * Checks if this run has been saved to the store.
     * 
     * @returns {Promise<boolean>} True if the run exists
     */
    async exists(): Promise<boolean> {
        return await this.store.exists(this.runId);
    }

    /**
     * Loads the saved state and cursor for this run.
     * 
     * @returns {Promise<{cursor: string, state: object}>} The saved checkpoint
     * @throws {Error} If the run does not exist
     * 
     * @example
     * ```typescript
     * const { cursor, state } = await storedRun.load();
     * // Resume from cursor: await graph.invoke(state, { resumeFrom: cursor });
     * ```
     */
    async load(): Promise<{ cursor: string, state: object }> {
        return await this.store.load(this.runId);
    }

    /**
     * Deletes this run from the store.
     * 
     * @returns {Promise<void>}
     */
    async delete(): Promise<void> {
        await this.store.delete(this.runId);
    }
}