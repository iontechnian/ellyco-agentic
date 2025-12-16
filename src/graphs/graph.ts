import { type NodeLike } from "../nodes/types";
import { type GraphResult } from "./types";
import { ContextLayer, RuntimeContext } from "./runtime-context";

export const START = "start";
export const END = "end";

export interface RunConfig {
    resumeFrom?: string;
}

export abstract class Graph<
    S extends object,
    NS extends object = S,
> implements NodeLike<S> {
    public readonly isGraph = true;

    protected nodes: Record<string, NodeLike<NS>> = {};
    protected edges: Record<string, string> = {};
    protected conditionalEdges: Record<string, string[]> = {};
    protected conditionalFuncs: Record<string, (state: NS, context: ContextLayer) => string> = {};

    protected abstract stateToNodeState(state: S, context: ContextLayer): NS;
    protected abstract nodeStateToState(nodeState: Partial<NS>, context: ContextLayer): S;

    protected transition(state: S, context: ContextLayer): void {
        const currentNode = context.currentNode!;
        if (currentNode in this.edges) {
            context.currentNode = this.edges[currentNode]!;
        } else if (currentNode in this.conditionalEdges) {
            const conditionalEdges = this.conditionalEdges[currentNode]!;
            const condition = this.conditionalFuncs[currentNode]!(
                this.stateToNodeState(state, context),
                context,
            );
            if (conditionalEdges.includes(condition)) {
                context.currentNode = condition;
            } else {
                throw new Error(
                    `No edge found for after node ${currentNode} with condition ${condition}`,
                );
            }
        } else {
            throw new Error(
                `No edge or conditional edge found for after node ${currentNode}`,
            );
        }
    }

    protected async step(state: S, context: ContextLayer): Promise<S> {
        const currentNode = context.currentNode!;
        const node = this.nodes[currentNode]!;
        if (node === undefined) {
            throw new Error(`Node ${currentNode} not found`);
        }
        const inputNodeState = this.stateToNodeState(state, context);
        const result = await node.run(
            { ...inputNodeState },
            context,
        );
        if (Object.keys(result).length === 0) {
            return state;
        }
        return {
            ...state,
            ...this.nodeStateToState(result, context),
        };
    }

    validate(): void {
        if (!(START in this.edges) && !(START in this.conditionalEdges)) {
            throw new Error(
                `No edge or conditional edge found for starting node ${START}`,
            );
        }
        let endIsSet = false;
        for (const to of Object.values(this.edges)) {
            if (to === END) {
                endIsSet = true;
            }
        }
        for (const to of Object.values(this.conditionalEdges).flat()) {
            if (to.includes(END)) {
                endIsSet = true;
            }
        }
        if (!endIsSet) {
            throw new Error(
                `No edge or conditional edge found for ending node ${END}`,
            );
        }
    }

    protected async runInternal(input: S, context: ContextLayer): Promise<Partial<S>> {
        let state = { ...input };
        let shouldContinue = true;
        while (shouldContinue) {
            const currentNode = context.currentNode!;
            // End is not a real node, it's just a way to stop the state machine.
            if (currentNode === END) {
                shouldContinue = false;
                break;
            }
            // Start is not a real node, it's just a way to start the state machine.
            if (currentNode === START) {
                this.transition(input, context);
                continue;
            }

            state = { ...state, ...(await this.step(state, context)) };

            if (context.runtime.interrupted) {
                shouldContinue = false;
                break;
            }

            this.transition(state, context);
        }

        return state;
    }

    async run(input: S, contextOrRuntime: ContextLayer | RuntimeContext): Promise<Partial<S>> {
        const context = contextOrRuntime.nextLayer();
        if (context.currentNode === undefined) {
            context.currentNode = START;
        }
        const result = await this.runInternal(input, context);
        context.done();
        return result;
    }

    async invoke(input: S, config?: RunConfig): Promise<GraphResult<S>> {
        const runtime = new RuntimeContext();
        if (config?.resumeFrom) {
            runtime.unwrapCursor(config.resumeFrom);
        }
        const result = await this.run(input, runtime);
        if (runtime.interrupted) {
            return {
                state: { ...input, ...result },
                exitReason: "interrupt",
                exitMessage: runtime.exitMessage,
                cursor: runtime.wrapCursor(),
            };
        }
        return {
            state: { ...input, ...result },
            exitReason: "end",
        };
    }
}
