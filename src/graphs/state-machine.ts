import { END, Graph, START } from "./graph";
import { type NodeLike } from "../nodes/types";
import { z } from "zod";

/**
 * A general-purpose graph with arbitrary node and edge definitions.
 * Supports both simple edges and conditional edges for complex workflows.
 * Nodes can be added manually and edges can be configured dynamically.
 * 
 * @class StateMachine
 * @extends {Graph<T, S>}
 * @template T - The Zod schema for state
 * @template S - The inferred state type from T
 * 
 * @example
 * ```typescript
 * const schema = z.object({ 
 *   status: z.enum(["pending", "processing", "done"]),
 *   data: z.string()
 * });
 * 
 * const sm = new StateMachine(schema);
 * sm.addNode("process", new FunctionNode(...));
 * sm.addNode("validate", new FunctionNode(...));
 * 
 * sm.addEdge(START, "process");
 * sm.addConditionalEdge("process", ["validate", END], (state) => {
 *   return state.data ? "validate" : END;
 * });
 * sm.addEdge("validate", END);
 * ```
 */
export class StateMachine<T extends z.ZodObject, S extends Record<string, unknown> = z.infer<T>> extends Graph<T, S> {
    /**
     * Adds a node to the state machine.
     * 
     * @param {string} name - Unique name for the node (cannot be "start" or "end")
     * @param {NodeLike<S> | Graph<any, S>} node - The node implementation
     * @returns {this} The state machine instance for method chaining
     * @throws {Error} If name is reserved or node already exists
     * 
     * @example
     * ```typescript
     * sm.addNode("myNode", new FunctionNode((state) => ({ ...state })));
     * ```
     */
    addNode(name: string, node: NodeLike<S> | Graph<any, S>): this {
        if (name === START || name === END) {
            throw new Error(`Node ${name} is reserved`);
        }
        if (name in this.nodes) {
            throw new Error(`Node ${name} already exists`);
        }
        this.nodes[name] = node;
        return this;
    }

    /**
     * Adds a simple edge from one node to another.
     * The graph will always transition from 'from' to 'to'.
     * 
     * @param {string} from - Source node name
     * @param {string} to - Destination node name
     * @returns {this} The state machine instance for method chaining
     * 
     * @example
     * ```typescript
     * sm.addEdge("start", "nodeA");
     * sm.addEdge("nodeA", "nodeB");
     * sm.addEdge("nodeB", "end");
     * ```
     */
    addEdge(from: string, to: string): this {
        this.edges[from] = to;
        return this;
    }

    /**
     * Adds a conditional edge from one node to multiple possible destinations.
     * A function determines which destination to transition to based on state.
     * 
     * @template K - Tuple of possible destination names
     * @param {string} from - Source node name
     * @param {K} to - Tuple of possible destination node names
     * @param {(state: S) => K[number]} func - Function that returns the destination
     * @returns {this} The state machine instance for method chaining
     * @throws {Error} If no destinations are provided
     * 
     * @example
     * ```typescript
     * sm.addConditionalEdge(
     *   "decision",
     *   ["path1", "path2", "end"],
     *   (state) => {
     *     if (state.priority > 5) return "path1";
     *     if (state.priority > 2) return "path2";
     *     return "end";
     *   }
     * );
     * ```
     */
    addConditionalEdge<K extends string[]>(
        from: string,
        to: K,
        func: (state: S) => K[number],
    ): this {
        if (to.length === 0) {
            throw new Error(
                `No edges defined for conditional edge from ${from}`,
            );
        }
        this.conditionalEdges[from] = to;
        this.conditionalFuncs[from] = func;
        return this;
    }

    /**
     * StateMachine doesn't transform state, so node state is the same as graph state.
     * 
     * @protected
     * @param {S} state - The graph state
     * @returns {S} The same state
     */
    protected stateToNodeState(state: S): S {
        return state;
    }

    /**
     * StateMachine doesn't transform state, so node state is the same as graph state.
     * 
     * @protected
     * @param {Partial<S>} nodeState - The partial node state
     * @returns {Partial<S>} The same partial state
     */
    protected nodeStateToState(nodeState: Partial<S>): Partial<S> {
        return nodeState;
    }
}
