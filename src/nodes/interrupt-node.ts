import { NodeLike } from "./types";
import { ContextLayer } from "../graphs";

/**
 * A node that interrupts graph execution and returns control to the caller.
 * Useful for handling user input, human-in-the-loop workflows, or pausing execution.
 * 
 * When resumed, the graph will continue from after this node if the resumeFrom
 * cursor indicates this node was the interruption point.
 * 
 * @class InterruptNode
 * @template T - The state type
 * @implements {NodeLike<T, Partial<T>>}
 * 
 * @example
 * ```typescript
 * // Interrupt for user confirmation
 * const confirmNode = new InterruptNode("Please confirm the action");
 * 
 * // Graph execution
 * const result = await graph.invoke(state);
 * if (result.exitReason === "interrupt") {
 *   console.log("Paused:", result.exitMessage);
 *   // Get user input...
 *   // Resume with: await graph.invoke(result.state, { resumeFrom: result.cursor });
 * }
 * ```
 */
export class InterruptNode<T extends object> implements NodeLike<T> {
    /**
     * Creates an interrupt node.
     * 
     * @param {string} [message] - Optional message to send when interrupting
     */
    constructor(private readonly message?: string) {}

    /**
     * Executes the interrupt.
     * If resuming from a previous interrupt, marks the execution as resumed.
     * Otherwise, marks the runtime as interrupted with an optional message.
     * 
     * @param {T} state - The current state (unchanged by this node)
     * @param {ContextLayer} context - The execution context
     * @returns {Promise<Partial<T>>} Empty partial state (this node doesn't modify state)
     * 
     * @remarks
     * This node returns an empty object as it doesn't modify state.
     * The actual interruption is signaled through the RuntimeContext.
     */
    async run(state: T, context: ContextLayer): Promise<Partial<T>> {
        // InterruptNode assumes that if a resumeFrom is provided, it's because this node originally called it.
        // In that case, we don't need to interrupt the state machine at this spot again.
        if (context.runtime.resuming) {
            context.runtime.markResumed();
        } else {
            context.runtime.markInterrupted(this.message);
        }
        return {};
    }
}
