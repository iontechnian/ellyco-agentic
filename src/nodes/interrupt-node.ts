import { NodeLike, RunConfig } from "./types";

export class InterruptNode<T extends object> implements NodeLike<T> {
    async run(state: T, config: RunConfig): Promise<Partial<T>> {
        // InterruptNode assumes that if a resumeFrom is provided, it's because this node originally called it.
        // In that case, we don't need to interrupt the state machine at this spot again.
        if (config.resumeFrom) {
            delete config.resumeFrom;
        } else {
            config.shouldInterrupt = true;
        }
        return {};
    }
}
