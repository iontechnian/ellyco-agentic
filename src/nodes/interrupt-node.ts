import { NodeLike } from "./types";
import { ContextLayer } from "../graphs";

export class InterruptNode<T extends object> implements NodeLike<T> {
    constructor(private readonly message?: string) {}

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
