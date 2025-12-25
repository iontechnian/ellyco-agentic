import { ContextLayer } from "../graphs/runtime-context";

export interface NodeLike<I extends Record<string, unknown>, O extends Record<string, unknown> = Partial<I>> {
    run(state: I, context: ContextLayer): Promise<O>;
}
