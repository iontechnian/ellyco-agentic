import { type NodeLike } from "./types";
import { ContextLayer } from "../graphs";

/**
 * A simple node that executes a function and returns partial state updates.
 * Useful for stateless transformations or computations within a graph.
 * 
 * @class FunctionNode
 * @template T - The state type
 * @implements {NodeLike<T, Partial<T>>}
 * 
 * @example
 * ```typescript
 * const doubleNode = new FunctionNode((state) => ({
 *   count: state.count * 2
 * }));
 * 
 * // Or using the helper function
 * const node = makeNode((state, context) => ({
 *   result: state.input + " processed"
 * }));
 * ```
 */
export class FunctionNode<T extends Record<string, unknown>> implements NodeLike<T, Partial<T>> {
    /**
     * Creates a new function node.
     * 
     * @param {(state: T, context: ContextLayer) => Partial<T> | Promise<Partial<T>>} func 
     *   The function to execute. Can return state changes synchronously or asynchronously.
     *   The function receives the current state and context layer.
     */
    constructor(
        private readonly func: (
            state: T,
            context: ContextLayer,
        ) => Partial<T> | Promise<Partial<T>>,
    ) { }

    /**
     * Executes the function and returns the state updates.
     * 
     * @param {T} state - The current state
     * @param {ContextLayer} context - The execution context
     * @returns {Promise<Partial<T>>} Partial state updates from the function
     */
    async run(state: T, context: ContextLayer): Promise<Partial<T>> {
        const response = this.func(state, context);
        if (response instanceof Promise) {
            return await response;
        }

        return response;
    }
}

/**
 * Helper function to create a FunctionNode with type inference.
 * 
 * @template T - The state type
 * @param {(state: T, context: ContextLayer) => Partial<T> | Promise<Partial<T>>} func 
 *   The function to execute
 * @returns {NodeLike<T, Partial<T>>} A node that can be used in a graph
 * 
 * @example
 * ```typescript
 * const node = makeNode((state, context) => {
 *   console.log("Executing node with state:", state);
 *   return { processed: true };
 * });
 * ```
 */
export function makeNode<T extends Record<string, unknown>>(
    func: (state: T, context: ContextLayer) => Partial<T> | Promise<Partial<T>>,
): NodeLike<T, Partial<T>> {
    return new FunctionNode(func);
}
