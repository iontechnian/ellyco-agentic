import { z } from "zod";
import { NodeLike } from "./types";
import { ContextLayer } from "../graphs/runtime-context";
import { Graph } from "../graphs/graph";
import { cloneAware } from "../util";

/**
 * A node that transforms state between different schemas, allowing nested nodes/graphs
 * to operate on a different state structure than the parent graph.
 * 
 * StateTransformNode wraps a node or graph that expects a different state schema.
 * It handles:
 * - Input transformation: converts parent state to child state schema
 * - Schema validation: ensures transformed state matches the child schema
 * - Output transformation: converts child state back to parent state updates
 * - Interrupt handling: preserves wrapped state during interrupts for resumption
 * - State isolation: child state is stored separately during execution
 * 
 * This is useful when you need to:
 * - Reuse nodes/graphs with different state schemas
 * - Isolate state transformations within a workflow
 * - Compose graphs with incompatible state structures
 * 
 * @class StateTransformNode
 * @template PS - Parent state type (the graph's state schema)
 * @template N - Zod schema object for the child state
 * @template NS - Child state type (inferred from N)
 * @implements {NodeLike<PS>}
 * 
 * @example
 * ```typescript
 * // Parent schema
 * const parentSchema = z.object({
 *   userId: z.string(),
 *   userName: z.string(),
 *   count: z.number()
 * });
 * 
 * // Child schema
 * const childSchema = z.object({
 *   id: z.string(),
 *   name: z.string(),
 *   value: z.number()
 * });
 * 
 * // Transform parent -> child
 * const inputTransform = (state: ParentState): ChildState => ({
 *   id: state.userId,
 *   name: state.userName,
 *   value: state.count
 * });
 * 
 * // Transform child -> parent
 * const outputTransform = (state: ChildState): Partial<ParentState> => ({
 *   count: state.value
 * });
 * 
 * // Create transform node wrapping a child node
 * const childNode = makeNode<ChildState>((state) => ({
 *   value: state.value + 1
 * }));
 * 
 * const transformNode = new StateTransformNode(
 *   childSchema,
 *   inputTransform,
 *   childNode,
 *   outputTransform
 * );
 * ```
 */
export class StateTransformNode<
    PS extends Record<string, unknown>,
    N extends z.ZodObject,
    NS extends Record<string, unknown> = z.infer<N>,
> implements NodeLike<PS> {
    /**
     * Creates a new state transform node.
     * 
     * @param {N} schema - Zod schema object that validates the child state structure
     * @param {Function} input - Function that transforms parent state to child state
     * @param {NodeLike<NS> | Graph<N, NS>} node - The node or graph to wrap (operates on child state)
     * @param {Function} output - Function that transforms child state back to parent state updates
     */
    constructor(
        private readonly schema: N,
        private readonly input: (state: PS, context: ContextLayer) => NS,
        private readonly node: NodeLike<NS> | Graph<N, NS>,
        private readonly output: (state: NS, context: ContextLayer) => Partial<PS>,
    ) { }

    /**
     * Executes the wrapped node/graph with transformed state.
     * 
     * Execution flow:
     * 1. If resuming from interrupt: restores child state from parent state's wrapped key
     * 2. If not resuming: transforms parent state to child state using input function
     * 3. Validates transformed state against the child schema
     * 4. Attaches parent state reference to child state (as __parentState)
     * 5. Runs the wrapped node/graph with the child state
     * 6. Merges results back into child state
     * 7. If interrupted: stores child state in parent state under wrapped key and returns
     * 8. If completed: transforms child state back to parent state using output function
     * 9. Cleans up wrapped state key from parent state
     * 
     * The wrapped state is stored under a key like `__wrappedState_{contextId}.{nodeName}`
     * to allow resumption after interrupts. This key is automatically cleaned up on completion.
     * 
     * @param {PS} state - The parent state
     * @param {ContextLayer} context - The execution context
     * @returns {Promise<Partial<PS>>} Partial parent state update
     * @throws {Error} If input transformation doesn't match the child schema (wraps ZodError)
     * @throws {Error} If the wrapped node/graph throws an error (re-thrown)
     */
    async run(state: PS, context: ContextLayer): Promise<Partial<PS>> {
        const wrappedStateKey = `__wrappedState_${context.id}.${context.currentNode}`;
        try {
            let nodeState: NS;
            if (context.runtime.resuming) {
                nodeState = { ...state[wrappedStateKey] as NS, __parentState: state } as NS;
            } else {
                const inputTransformed = this.input(state, context);
                nodeState = { ...this.schema.parse(inputTransformed), __parentState: state } as NS;
            }
            const result = await this.node.run(cloneAware(nodeState), context);
            nodeState = { ...nodeState, ...result } as NS;
            if (context.runtime.interrupted) {
                const { __parentState, ...rest } = nodeState;
                return { [wrappedStateKey]: rest } as Partial<PS>;
            }
            const outState = this.output(nodeState, context);
            return { ...outState, [wrappedStateKey]: undefined } as Partial<PS>;
        } catch (error) {
            if (error instanceof z.ZodError) {
                throw new Error(`Transformed input does not match schema: ${error.message}`);
            }
            throw error;
        }
    }
}