import { type NodeLike } from "./types";
import { ContextLayer } from "../graphs";

export class FunctionNode<T extends object> implements NodeLike<T, Partial<T>> {
    constructor(
        private readonly func: (
            state: T,
            context: ContextLayer,
        ) => Partial<T> | Promise<Partial<T>>,
    ) {}

    async run(state: T, context: ContextLayer): Promise<Partial<T>> {
        const response = this.func(state, context);
        if (response instanceof Promise) {
            return await response;
        }

        return response;
    }
}

export function makeNode<T extends object>(
    func: (state: T, context: ContextLayer) => Partial<T> | Promise<Partial<T>>,
): NodeLike<T, Partial<T>> {
    return new FunctionNode(func);
}
