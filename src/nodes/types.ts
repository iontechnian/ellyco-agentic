import { ContextLayer } from "../graphs/runtime-context";

export interface NodeLike<I extends object, O extends object = Partial<I>> {
    run(state: I, context: ContextLayer): Promise<O>;
}
