import { type NodeLike } from "../nodes/types";
import { type GraphResult } from "./types";
import { ContextLayer, RuntimeContext } from "./runtime-context";
import { BaseStore } from "./store/base-store";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { mergeState } from "../util/merge-state";
import { Exception, trace } from "@opentelemetry/api";
import { cloneAware } from "../util";

const tracer = trace.getTracer("@ellyco/agentic", "0.2.0");

/**
 * Utility type to get all but the first element of a tuple.
 */
export type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : [];

/**
 * Special node name indicating the start of graph execution
 */
export const START = "start";

/**
 * Special node name indicating the end of graph execution
 */
export const END = "end";

/**
 * Configuration for invoking a graph without persistence.
 * 
 * @interface RunConfig
 * @property {string} [resumeFrom] - Cursor to resume from a previous interruption
 * @property {string} [runId] - Custom run ID (generated if not provided)
 */
export interface RunConfig {
    resumeFrom?: string;
    runId?: string;
}

/**
 * Configuration for invoking a graph with persistence to a store.
 * 
 * @interface StoredRunConfig
 * @property {BaseStore} store - Store to persist run state to
 * @property {string} [runId] - Custom run ID (generated if not provided)
 * @property {boolean} [deleteAfterEnd] - If true, delete the run from store when graph completes
 */
export interface StoredRunConfig {
    store: BaseStore;
    runId?: string;
    deleteAfterEnd?: boolean;
}

/**
 * Type guard to check if config is StoredRunConfig
 * 
 * @private
 */
function isStoredRunConfig(config: RunConfig | StoredRunConfig): config is StoredRunConfig {
    return "store" in config;
}

/**
 * Type for a constructor that derives schema from a base schema.
 * Used to mark constructors that can generate derived schemas for specific purposes.
 */
export type DerivedSchemaConstructorType<T> = ((schema: z.ZodObject) => T) & { derives: true };

/**
 * Marks a constructor function as deriving a schema from a base schema.
 * 
 * @template T - The type returned by the constructor
 * @param {(schema: z.ZodObject) => T} constructor - The constructor function
 * @returns {DerivedSchemaConstructorType<T>} The marked constructor
 * 
 * @example
 * ```typescript
 * const myConstructor = DerivedSchemaConstructor((schema) => {
 *   return new MyClass(schema);
 * });
 * ```
 */
export const DerivedSchemaConstructor = <T>(constructor: (schema: z.ZodObject) => T): DerivedSchemaConstructorType<T> => {
    Object.defineProperty(constructor, "derives", { value: true });
    return constructor as DerivedSchemaConstructorType<T>;
}

/**
 * Abstract base class for stateful graphs consisting of nodes and edges.
 * Graphs orchestrate execution flow through nodes, managing state transformations.
 * Supports conditional edges, nesting of graphs, and checkpointing via interrupts.
 * 
 * @abstract
 * @template Z - The Zod schema for graph state
 * @template S - The inferred state type from Z (defaults to z.infer<Z>)
 * @template NS - The node-state type for internal node operations (defaults to S)
 * 
 * @property {boolean} isGraph - Always true, used to identify graph instances
 * 
 * @example
 * ```typescript
 * const schema = z.object({
 *   input: z.string(),
 *   output: z.string().optional()
 * });
 * 
 * class MyGraph extends Graph<typeof schema> {
 *   protected stateToNodeState(state) { return state; }
 *   protected nodeStateToState(nodeState) { return nodeState; }
 *   
 *   constructor() {
 *     super(schema);
 *     this.addNode("process", new FunctionNode(...));
 *     this.addEdge("start", "process");
 *     this.addEdge("process", "end");
 *   }
 * }
 * ```
 */
export abstract class Graph<
    Z extends z.ZodObject,
    S extends Record<string, unknown> = z.infer<Z>,
    NS extends Record<string, unknown> = S,
> implements NodeLike<S> {
    /**
     * Marker property to identify Graph instances
     */
    public readonly isGraph = true;

    /**
     * Mapping of node names to node implementations
     */
    protected nodes: Record<string, NodeLike<NS>> = {};

    /**
     * Mapping of source nodes to destination nodes for simple edges
     */
    protected edges: Record<string, string> = {};

    /**
     * Mapping of source nodes to possible destination nodes for conditional edges
     */
    protected conditionalEdges: Record<string, string[]> = {};

    /**
     * Mapping of source nodes to functions that determine the destination for conditional edges
     */
    protected conditionalFuncs: Record<string, (state: NS, context: ContextLayer) => string> = {};

    /**
     * Converts graph state to node state before passing to nodes.
     * Useful for normalizing state across graph boundaries.
     * 
     * @protected
     * @abstract
     * @param {S} state - The graph state
     * @param {ContextLayer} context - The execution context
     * @returns {NS} The node state
     */
    protected abstract stateToNodeState(state: S, context: ContextLayer): NS;

    /**
     * Converts node state back to graph state after node execution.
     * 
     * @protected
     * @abstract
     * @param {Partial<NS>} nodeState - The partial node state from a node
     * @param {ContextLayer} context - The execution context
     * @returns {Partial<S>} The partial graph state
     */
    protected abstract nodeStateToState(nodeState: Partial<NS>, context: ContextLayer): Partial<S>;

    /**
     * Creates a new graph instance.
     * 
     * @param {Z} schema - Zod schema for validating and typing the graph state
     */
    constructor(protected readonly schema: Z) { }

    /**
     * Determines the next node based on current node and state.
     * Handles both simple edges and conditional edges.
     * 
     * @protected
     * @param {S} state - Current state
     * @param {ContextLayer} context - Execution context
     * @throws {Error} If no edge is found from current node
     */
    protected transition(state: S, context: ContextLayer): void {
        const currentNode = context.currentNode!;
        if (currentNode in this.edges) {
            context.currentNode = this.edges[currentNode]!;
        } else if (currentNode in this.conditionalEdges) {
            const conditionalEdges = this.conditionalEdges[currentNode]!;
            const condition = this.conditionalFuncs[currentNode]!(
                this.stateToNodeState(state, context),
                context,
            );
            if (conditionalEdges.includes(condition)) {
                context.currentNode = condition;
            } else {
                throw new Error(
                    `No edge found for after node ${currentNode} with condition ${condition}`,
                );
            }
        } else {
            throw new Error(
                `No edge or conditional edge found for after node ${currentNode}`,
            );
        }
    }

    /**
     * Executes a single node and merges its output into the state.
     * 
     * @protected
     * @param {S} state - Current state
     * @param {ContextLayer} context - Execution context
     * @returns {Promise<S>} Updated state
     * @throws {Error} If node is not found
     */
    protected async step(state: S, context: ContextLayer): Promise<S> {
        const currentNode = context.currentNode!;
        const node = this.nodes[currentNode]!;
        if (node === undefined) {
            throw new Error(`Node ${currentNode} not found`);
        }
        return await tracer.startActiveSpan(currentNode, {
            attributes: {
                runId: context.runtime.runId,
                nodeName: currentNode,
                layerId: context.id,
            }
        }, async (span) => {
            try {
                const inputNodeState = this.stateToNodeState(state, context);
                const result = await node.run(
                    cloneAware(inputNodeState),
                    context,
                );
                if (Object.keys(result).length === 0) {
                    span.setAttributes({
                        changes: JSON.stringify({}),
                        newState: JSON.stringify(state),
                    });
                    return state;
                }
                const changes = this.nodeStateToState(result, context);
                const mergedState = this.mergeState(state, changes);
                span.setAttributes({
                    changes: JSON.stringify(changes),
                    newState: JSON.stringify(mergedState),
                });
                return mergedState;
            } catch (error) {
                console.error(`Exception encountered at node ${context.id}.${currentNode}`);
                span.recordException(error as unknown as Exception);
                throw error;
            }
        });
    }

    /**
     * Validates the graph structure.
     * Ensures START and END nodes have proper connections.
     * 
     * @throws {Error} If graph structure is invalid
     */
    validate(): void {
        if (!(START in this.edges) && !(START in this.conditionalEdges)) {
            throw new Error(
                `No edge or conditional edge found for starting node ${START}`,
            );
        }
        let endIsSet = false;
        for (const to of Object.values(this.edges)) {
            if (to === END) {
                endIsSet = true;
            }
        }
        for (const to of Object.values(this.conditionalEdges).flat()) {
            if (to.includes(END)) {
                endIsSet = true;
            }
        }
        if (!endIsSet) {
            throw new Error(
                `No edge or conditional edge found for ending node ${END}`,
            );
        }
    }

    /**
     * Internal execution loop for the graph.
     * Runs nodes in sequence following edges until END is reached or interrupted.
     * 
     * @protected
     * @param {S} input - Initial state
     * @param {ContextLayer} context - Execution context
     * @returns {Promise<Partial<S>>} Final state changes
     */
    protected async runInternal(input: S, context: ContextLayer): Promise<Partial<S>> {
        let state = cloneAware(input);
        let shouldContinue = true;
        while (shouldContinue) {
            const currentNode = context.currentNode!;
            // End is not a real node, it's just a way to stop the state machine.
            if (currentNode === END) {
                shouldContinue = false;
                break;
            }
            // Start is not a real node, it's just a way to start the state machine.
            if (currentNode === START) {
                this.transition(input, context);
                continue;
            }

            state = { ...state, ...(await this.step(state, context)) };

            if (context.runtime.interrupted) {
                shouldContinue = false;
                break;
            }

            this.transition(state, context);
        }
        return state;
    }

    /**
     * Merges partial state into the base state using the schema.
     * 
     * @protected
     * @param {S} state - Base state
     * @param {Partial<S>} partial - Partial updates
     * @returns {S} Merged state
     */
    protected mergeState(state: S, partial: Partial<S>): S {
        return mergeState(state, partial, this.schema);
    }

    /**
     * Runs the graph with the provided context.
     * Sets up initial node if not already set, runs internal loop, and cleans up.
     * 
     * @param {S} input - Initial state
     * @param {ContextLayer | RuntimeContext} contextOrRuntime - Execution context or runtime
     * @returns {Promise<Partial<S>>} Final state changes
     */
    async run(input: S, contextOrRuntime: ContextLayer | RuntimeContext): Promise<Partial<S>> {
        const context = contextOrRuntime.nextLayer();
        if (context.currentNode === undefined) {
            context.currentNode = START;
        }
        const result = await this.runInternal(input, context);
        context.done();
        return result;
    }

    /**
     * Invokes the graph and returns the final result.
     * Supports both in-memory and stored (persistent) execution.
     * 
     * @overload
     * @param {S} input - Initial state
     * @param {RunConfig} [config] - Run configuration
     * @returns {Promise<GraphResult<S>>} Result with final state and exit reason
     */
    async invoke(input: S, config?: RunConfig): Promise<GraphResult<S>>;

    /**
     * @overload
     * @param {Partial<S>} input - Partial initial state (for stored runs)
     * @param {StoredRunConfig} config - Configuration with store for persistence
     * @returns {Promise<GraphResult<S>>} Result with final state and exit reason
     */
    async invoke(input: Partial<S>, config?: StoredRunConfig): Promise<GraphResult<S>>;

    /**
     * Invokes the graph with the given input and optional configuration.
     * Handles both in-memory and stored (persistent) execution modes.
     * 
     * For in-memory mode (RunConfig): State is not persisted between invocations.
     * Can be resumed using a cursor from a previous interruption.
     * 
     * For stored mode (StoredRunConfig): State is persisted to the provided store.
     * Allows resuming execution from checkpoints across different invocations.
     * 
     * @param {S | Partial<S>} input - Initial or partial state
     * @param {RunConfig | StoredRunConfig} [config] - Configuration
     * @returns {Promise<GraphResult<S>>} Result object containing final state and exit reason
     * @throws {Error} If graph structure validation fails
     * 
     * @example
     * ```typescript
     * // In-memory execution
     * const result = await graph.invoke(initialState);
     * 
     * // With resumption
     * if (result.exitReason === "interrupt") {
     *   const result2 = await graph.invoke(result.state, { resumeFrom: result.cursor });
     * }
     * 
     * // With persistence
     * const result = await graph.invoke(state, { store: myStore });
     * ```
     */
    async invoke(input: S | Partial<S>, config?: RunConfig | StoredRunConfig): Promise<GraphResult<S>> {
        const runId = (config && "runId" in config ? config.runId : createId())!;

        if (config && isStoredRunConfig(config)) {
            const partialInput = input as Partial<S>;
            const storedRun = config.store.getStoredRun(runId);
            const runtime = new RuntimeContext(runId, storedRun);

            let mergedState: S = partialInput as S;
            const stateExists = await storedRun.exists();
            if (stateExists) {
                const load = await storedRun.load();
                mergedState = this.mergeState(mergedState, load.state);
                runtime.unwrapCursor(load.cursor);
            }
            try {
                const state = this.schema.parse(mergedState) as S;

                const result = await this.run(state, runtime);

                const finalState = { ...state, ...result }
                if (runtime.interrupted) {
                    await storedRun.save(runtime.wrapCursor(), finalState);
                    return {
                        runId,
                        state: finalState,
                        exitReason: "interrupt",
                        exitMessage: runtime.exitMessage,
                        cursor: runtime.wrapCursor(),
                    };
                }
                if (config?.deleteAfterEnd) {
                    await storedRun.delete();
                } else {
                    await storedRun.save(END, finalState);
                }
                return {
                    runId,
                    state: finalState,
                    exitReason: "end",
                };
            } catch (error) {
                if (error instanceof z.ZodError) {
                    throw new Error(`Input does not match schema: ${error.message}`);
                }
                throw error;
            }
        } else {
            const fullInput = input as S;
            const runtime = new RuntimeContext(runId);
            if (config?.resumeFrom) {
                runtime.unwrapCursor(config.resumeFrom);
            }
            try {
                const state = this.schema.parse(fullInput) as S;

                const result = await this.run(state, runtime);

                const finalState = { ...state, ...result }
                if (runtime.interrupted) {
                    return {
                        runId,
                        state: finalState,
                        exitReason: "interrupt",
                        exitMessage: runtime.exitMessage,
                        cursor: runtime.wrapCursor(),
                    };
                }
                return {
                    runId,
                    state: finalState,
                    exitReason: "end",
                };
            } catch (error) {
                if (error instanceof z.ZodError) {
                    throw new Error(`Input does not match schema: ${error.message}`);
                }
                throw error;
            }
        }
    }
}
