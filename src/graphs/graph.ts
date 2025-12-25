import { type NodeLike } from "../nodes/types";
import { type GraphResult } from "./types";
import { ContextLayer, RuntimeContext } from "./runtime-context";
import { BaseStore } from "./store/base-store";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { mergeState } from "./merge-state";

export type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : [];

export const START = "start";
export const END = "end";

export interface RunConfig {
    resumeFrom?: string;
    runId?: string;
}

export interface StoredRunConfig {
    store: BaseStore;
    runId?: string;
    /** If true, the stored run will be deleted after the graph has ended. */
    deleteAfterEnd?: boolean;
}

function isStoredRunConfig(config: RunConfig | StoredRunConfig): config is StoredRunConfig {
    return "store" in config;
}

export type DerivedSchemaConstructorType<T> = ((schema: z.ZodObject) => T) & { derives: true };
export const DerivedSchemaConstructor = <T>(constructor: (schema: z.ZodObject) => T): DerivedSchemaConstructorType<T> => {
    Object.defineProperty(constructor, "derives", { value: true });
    return constructor as DerivedSchemaConstructorType<T>;
}

export abstract class Graph<
    Z extends z.ZodObject,
    S extends Record<string, unknown> = z.infer<Z>,
    NS extends Record<string, unknown> = S,
> implements NodeLike<S> {
    public readonly isGraph = true;

    protected nodes: Record<string, NodeLike<NS>> = {};
    protected edges: Record<string, string> = {};
    protected conditionalEdges: Record<string, string[]> = {};
    protected conditionalFuncs: Record<string, (state: NS, context: ContextLayer) => string> = {};

    protected abstract stateToNodeState(state: S, context: ContextLayer): NS;
    protected abstract nodeStateToState(nodeState: Partial<NS>, context: ContextLayer): Partial<S>;

    constructor(protected readonly schema: Z) { }


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
        const inputNodeState = this.stateToNodeState(structuredClone(state), context);
        const result = await node.run(
            structuredClone(inputNodeState),
            context,
        );
        if (Object.keys(result).length === 0) {
            return state;
        }
        return this.mergeState(state, this.nodeStateToState(result, context));
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
        let state = structuredClone(input);
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

            state = { ...state, ...(await this.step(structuredClone(state), context)) };

            if (context.runtime.interrupted) {
                shouldContinue = false;
                break;
            }

            this.transition(state, context);
        }
        return state;
    }

    protected mergeState(state: S, partial: Partial<S>): S {
        return mergeState(state, partial, this.schema);
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

    async invoke(input: S, config?: RunConfig): Promise<GraphResult<S>>;
    async invoke(input: Partial<S>, config?: StoredRunConfig): Promise<GraphResult<S>>;
    async invoke(input: S | Partial<S>, config?: RunConfig | StoredRunConfig): Promise<GraphResult<S>> {
        const runId = (config && "runId" in config ? config.runId : createId())!;

        if (config && isStoredRunConfig(config)) {
            const partialInput = input as Partial<S>;
            const storedRun = config.store.getStoredRun(runId);
            const runtime = new RuntimeContext(runId, storedRun);

            let mergedState: S = partialInput as S;
            const stateExists = await storedRun.exists();
            if (stateExists) {
                const load = await storedRun.load();
                mergedState = this.mergeState(mergedState, load.state);
                runtime.unwrapCursor(load.cursor);
            }
            const state = this.schema.parse(mergedState) as S;

            const result = await this.run(state, runtime);

            const finalState = { ...state, ...result }
            if (runtime.interrupted) {
                await storedRun.save(runtime.wrapCursor(), finalState);
                return {
                    runId,
                    state: finalState,
                    exitReason: "interrupt",
                    exitMessage: runtime.exitMessage,
                    cursor: runtime.wrapCursor(),
                };
            }
            if (config?.deleteAfterEnd) {
                await storedRun.delete();
            } else {
                await storedRun.save(END, finalState);
            }
            return {
                runId,
                state: finalState,
                exitReason: "end",
            };
        } else {
            const fullInput = input as S;
            const runtime = new RuntimeContext(runId);
            if (config?.resumeFrom) {
                runtime.unwrapCursor(config.resumeFrom);
            }
            const state = this.schema.parse(fullInput) as S;

            const result = await this.run(state, runtime);

            const finalState = { ...state, ...result }
            if (runtime.interrupted) {
                return {
                    runId,
                    state: finalState,
                    exitReason: "interrupt",
                    exitMessage: runtime.exitMessage,
                    cursor: runtime.wrapCursor(),
                };
            }
            return {
                runId,
                state: finalState,
                exitReason: "end",
            };
        }

    }
}
