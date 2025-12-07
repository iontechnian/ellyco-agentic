import { NodeLike, RunConfig } from "./types";
import { Graph } from "../graphs/graph";

export class NestedGraph<T extends object> implements NodeLike<T> {
    constructor(private readonly graph: Graph<any, T>) {}

    async run(state: T, config: RunConfig): Promise<Partial<T>> {
        const subGraphResult = await this.graph.run(state, config);
        if (subGraphResult.exitReason === "interrupt") {
            config.shouldInterrupt = true;
            config.resumeFrom = [
                ...config.resumeFrom ?? [],
                ...subGraphResult.cursor!,
            ];
        }
        return subGraphResult.state;
    }
}
