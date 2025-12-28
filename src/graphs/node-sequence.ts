import { type NodeLike } from "../nodes";
import { END, Graph, START } from "./graph";
import { z } from "zod";

/**
 * A graph that executes a sequence of nodes linearly.
 * Nodes are executed one after another without branching.
 * Each call to next() adds a node to the sequence.
 * 
 * @class NodeSequence
 * @extends {Graph<T, S>}
 * @template T - The Zod schema for state
 * @template S - The inferred state type from T
 * 
 * @example
 * ```typescript
 * const schema = z.object({ count: z.number() });
 * const sequence = new NodeSequence(schema);
 * 
 * sequence
 *   .next(new FunctionNode((state) => ({ count: state.count + 1 })))
 *   .next(new FunctionNode((state) => ({ count: state.count * 2 })));
 * 
 * const result = await sequence.invoke({ count: 5 });
 * // State transitions: 5 -> 6 -> 12
 * ```
 */
export class NodeSequence<T extends z.ZodObject, S extends object = z.infer<T>> extends Graph<T, S> {

    /**
     * NodeSequence doesn't transform state, so node state is the same as graph state.
     * 
     * @protected
     * @param {S} state - The graph state
     * @returns {S} The same state (no transformation)
     */
    protected stateToNodeState(state: S): S {
        return state;
    }

    /**
     * NodeSequence doesn't transform state, so node state is the same as graph state.
     * 
     * @protected
     * @param {Partial<S>} nodeState - The partial node state
     * @returns {Partial<S>} The same partial state (no transformation)
     */
    protected nodeStateToState(nodeState: Partial<S>): Partial<S> {
        return nodeState;
    }

    /**
     * Adds the next node in the sequence.
     * Automatically wires up edges from START to the first node,
     * between sequential nodes, and from the last node to END.
     * 
     * @param {NodeLike<S> | Graph<T, S>} node - The node to add
     * @returns {this} The sequence instance for method chaining
     * 
     * @example
     * ```typescript
     * const sequence = new NodeSequence(schema);
     * sequence
     *   .next(node1)
     *   .next(node2)
     *   .next(node3);
     * ```
     */
    next(node: NodeLike<S> | Graph<T, S>): this {
        const nodeCount = Object.keys(this.nodes).length;
        const name = `node-${nodeCount}`;
        const isFirstNode = nodeCount === 0;
        this.nodes[name] = node;

        if (isFirstNode) {
            this.edges[START] = name;
            this.edges[name] = END;
        } else {
            const previousNodeName = `node-${nodeCount - 1}`;
            this.edges[previousNodeName] = name;
            this.edges[name] = END;
        }
        return this;
    }
}
