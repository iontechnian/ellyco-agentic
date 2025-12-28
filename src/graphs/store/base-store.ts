import { StoredRun } from "./stored-run";

/**
 * Abstract base class for storing and retrieving graph run state.
 * Implementations persist graph state between interruptions, enabling resumable workflows.
 * 
 * @abstract
 * 
 * @example
 * ```typescript
 * // Create a custom store implementation
 * class MyCustomStore extends BaseStore {
 *   async save(runId: string, cursor: string, state: object): Promise<void> {
 *     // Custom persistence logic
 *   }
 *   async load(runId: string): Promise<{ cursor: string, state: object }> {
 *     // Custom retrieval logic
 *   }
 *   // ... implement other methods
 * }
 * 
 * // Use with graph
 * const store = new MyCustomStore();
 * const result = await graph.invoke(state, { store });
 * ```
 */
export abstract class BaseStore {
    /**
     * Saves the state and cursor position of a run.
     * 
     * @abstract
     * @param {string} runId - Unique run identifier
     * @param {string} cursor - Position in the graph (encoded path through nodes)
     * @param {object} state - Complete state at this point
     * @returns {Promise<void>}
     */
    abstract save(runId: string, cursor: string, state: object): Promise<void>;

    /**
     * Checks if a run exists in the store.
     * 
     * @abstract
     * @param {string} runId - Unique run identifier
     * @returns {Promise<boolean>} True if the run exists
     */
    abstract exists(runId: string): Promise<boolean>;

    /**
     * Loads the saved state and cursor for a run.
     * 
     * @abstract
     * @param {string} runId - Unique run identifier
     * @returns {Promise<{cursor: string, state: object}>} The saved cursor and state
     * @throws {Error} If the run is not found
     */
    abstract load(runId: string): Promise<{ cursor: string, state: object }>;

    /**
     * Deletes a run from the store.
     * 
     * @abstract
     * @param {string} runId - Unique run identifier
     * @returns {Promise<void>}
     */
    abstract delete(runId: string): Promise<void>;

    /**
     * Closes the store and releases resources.
     * Called when the store is no longer needed.
     * 
     * @abstract
     * @returns {Promise<void>}
     */
    abstract dispose(): Promise<void>;

    /**
     * Gets a StoredRun wrapper for a specific run ID.
     * 
     * @param {string} runId - Unique run identifier
     * @returns {StoredRun} Wrapper for interacting with this specific run
     * 
     * @example
     * ```typescript
     * const storedRun = store.getStoredRun("run-123");
     * if (await storedRun.exists()) {
     *   const loaded = await storedRun.load();
     *   console.log(loaded.state);
     * }
     * ```
     */
    getStoredRun(runId: string): StoredRun {
        return new StoredRun(runId, this);
    }
}