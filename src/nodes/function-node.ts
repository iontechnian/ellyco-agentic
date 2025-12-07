import { type NodeLike, type RunConfig } from "./types";

export class FunctionNode<T extends object> implements NodeLike<T, Partial<T>> {
    constructor(
        private readonly func: (
            state: T,
            config: RunConfig,
        ) => Partial<T> | Promise<Partial<T>>,
    ) {}

    async run(state: T, config: RunConfig): Promise<Partial<T>> {
        const response = this.func(state, config);
        if (response instanceof Promise) {
            return await response;
        }

        return response;
    }
}

export function makeNode<T extends object>(
    func: (state: T, config: RunConfig) => Partial<T> | Promise<Partial<T>>,
): NodeLike<T, Partial<T>> {
    return new FunctionNode(func);
}
