import { StoredRun } from "./store/stored-run";

/**
 * Represents a layer of execution context within a graph traversal.
 * Layers are stacked when graphs call other graphs (nested execution).
 * Each layer tracks which node is currently executing.
 * 
 * @class ContextLayer
 * 
 * @example
 * ```typescript
 * // Each nested graph creates a new context layer
 * const layer = runtime.nextLayer();
 * layer.currentNode = "myNode";
 * layer.custom.data = { ... };
 * ```
 */
export class ContextLayer {
    /**
     * The name of the current node being executed
     */
    public currentNode?: string;

    /**
     * Custom data storage for nodes and graphs to share information
     */
    public custom: Record<string, any> = {};

    /**
     * Gets a unique identifier for this layer based on its position in the stack.
     * Format: "ROOT" for the root layer, or "PARENT_ID.CURRENT_NODE" for nested layers.
     * 
     * @returns {string} Unique identifier for this context layer
     */
    get id(): string {
        if (this.index === 0) {
            return "ROOT";
        }
        const lastLayer = this.runtime.getLayer(this.index - 1);
        return `${lastLayer.id}.${lastLayer.currentNode}`;
    }

    /**
     * Creates a new context layer.
     * 
     * @param {number} index - The position of this layer in the context stack
     * @param {RuntimeContext} runtime - Reference to the parent runtime context
     */
    constructor(
        public readonly index: number,
        public readonly runtime: RuntimeContext,
    ) { }

    /**
     * Creates and returns the next layer for nested execution.
     * 
     * @returns {ContextLayer} A new child context layer
     */
    nextLayer(): ContextLayer {
        return this.runtime.nextLayer();
    }

    /**
     * Marks this layer as done executing.
     * Removes it from the stack unless the runtime is interrupted.
     */
    done(): void {
        if (!this.runtime.interrupted) {
            this.runtime.removeTopLayer();
        }
    }
}

/**
 * Manages runtime state across graph execution and nested subgraphs.
 * Maintains a stack of context layers for tracking nested execution.
 * Handles interruption, resumption, and cursor management for checkpointing.
 * 
 * @class RuntimeContext
 * 
 * @example
 * ```typescript
 * const runtime = new RuntimeContext("run-123");
 * 
 * // Track execution through nodes
 * const layer = runtime.nextLayer();
 * layer.currentNode = "node-1";
 * 
 * // Handle interruption
 * runtime.markInterrupted("Waiting for user input");
 * 
 * // Later, wrap cursor for storage
 * const cursor = runtime.wrapCursor(); // "node-1"
 * 
 * // Restore from checkpoint
 * const runtime2 = new RuntimeContext("run-123");
 * runtime2.unwrapCursor(cursor);
 * ```
 */
export class RuntimeContext {
    /**
     * Stack of context layers for nested graph execution
     */
    private readonly contextLayers: ContextLayer[] = [];

    /**
     * Current index in the context layer stack
     */
    private currentLayer: number = -1;

    /**
     * Whether execution has been interrupted
     */
    private _interrupted = false;

    /**
     * Message describing why execution was interrupted
     */
    private _exitMessage = "";

    /**
     * Whether currently resuming from an interruption
     */
    private _resuming = false;

    /**
     * Gets whether the runtime is currently interrupted.
     * 
     * @returns {boolean} True if interrupted, false otherwise
     */
    get interrupted(): boolean {
        return this._interrupted;
    }

    /**
     * Gets the message associated with an interruption.
     * 
     * @returns {string} The exit message (empty if not interrupted)
     */
    get exitMessage(): string {
        return this._exitMessage;
    }

    /**
     * Gets whether currently resuming from an interruption.
     * 
     * @returns {boolean} True if resuming, false otherwise
     */
    get resuming(): boolean {
        return this._resuming;
    }

    /**
     * Creates a new runtime context.
     * 
     * @param {string} runId - Unique identifier for this execution run
     * @param {StoredRun} [storedRun] - Optional stored run for persistence
     */
    constructor(public readonly runId: string, public readonly storedRun?: StoredRun) { }

    /**
     * Restores execution state from a cursor (checkpoint).
     * Sets up the context layer stack based on the cursor path.
     * Marks the runtime as resuming.
     * 
     * @param {string} cursor - Cursor string encoding the path through nested contexts
     *   Format: "node1.node2.node3" where each segment is a node name
     * 
     * @example
     * ```typescript
     * runtime.unwrapCursor("start.process.end");
     * // Sets up 3 context layers with currentNode set appropriately
     * ```
     */
    unwrapCursor(cursor: string): void {
        this._resuming = true;
        const layers = cursor.split(".");
        let idPrefix = "";
        for (const layer of layers) {
            const contextLayer = new ContextLayer(
                this.contextLayers.length,
                this,
            );
            contextLayer.currentNode = layer;
            this.contextLayers.push(contextLayer);
            idPrefix = idPrefix.length > 0 ? `${idPrefix}.${layer}` : layer;
        }
    }

    /**
     * Encodes the current execution path into a cursor for checkpointing.
     * The cursor can later be used with unwrapCursor() to resume execution.
     * 
     * @returns {string} Cursor encoding the current context path
     * 
     * @example
     * ```typescript
     * const cursor = runtime.wrapCursor(); // "start.process.end"
     * // Later restore with: runtime.unwrapCursor(cursor);
     * ```
     */
    wrapCursor(): string {
        const layerCursors: string[] = [];
        for (const layer of this.contextLayers) {
            layerCursors.push(layer.currentNode!);
        }
        return layerCursors.join(".");
    }

    /**
     * Retrieves a context layer by its index.
     * 
     * @param {number} index - The layer index to retrieve
     * @returns {ContextLayer} The context layer at the specified index
     */
    getLayer(index: number): ContextLayer {
        return this.contextLayers[index]!;
    }

    /**
     * Gets or creates the next context layer for nested execution.
     * If a layer already exists at the next depth, returns it.
     * Otherwise, creates a new layer.
     * 
     * @returns {ContextLayer} The next context layer
     */
    nextLayer(): ContextLayer {
        // already a contextLayer present at this depth
        if (this.currentLayer < this.contextLayers.length - 1) {
            const layer = this.contextLayers[this.currentLayer + 1]!;
            this.currentLayer++;
            return layer;
        }
        const contextLayer = new ContextLayer(
            this.contextLayers.length,
            this,
        );
        this.contextLayers.push(contextLayer);
        this.currentLayer++;
        return contextLayer;
    }

    /**
     * Removes the top (most recent) context layer from the stack.
     * Called when a nested graph or layer completes execution.
     */
    removeTopLayer(): void {
        this.contextLayers.pop();
        this.currentLayer--;
    }

    /**
     * Marks the runtime as interrupted with an optional reason message.
     * Used by nodes to signal that execution should pause.
     * 
     * @param {string} [reason] - Optional message explaining the interruption
     */
    markInterrupted(reason?: string): void {
        this._interrupted = true;
        this._exitMessage = reason ?? "";
    }

    /**
     * Clears the resuming flag after resumption is complete.
     * Called after resuming nodes acknowledge they've been resumed.
     */
    markResumed(): void {
        this._resuming = false;
    }
}
