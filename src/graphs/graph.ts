import { type NodeLike, RunConfig } from "../nodes/types";
import { type GraphResult } from "./types";

export const START = "start";
export const END = "end";

export abstract class Graph<
    S extends object,
    IO extends object = S,
    NS extends object = S,
> implements NodeLike<IO, GraphResult<IO>> {
    public readonly isGraph = true;

    protected nodes: Record<string, NodeLike<NS>> = {};
    protected edges: Record<string, string> = {};
    protected conditionalEdges: Record<string, string[]> = {};
    protected conditionalFuncs: Record<string, (state: S) => string> = {};
    protected state: S = {} as S;
    protected config: RunConfig = {};
    protected cursor: string = "";

    protected transition(): void {
        if (this.cursor in this.edges) {
            this.cursor = this.edges[this.cursor]!;
        } else if (this.cursor in this.conditionalEdges) {
            const conditionalEdges = this.conditionalEdges[this.cursor]!;
            const condition = this.conditionalFuncs[this.cursor]!(
                this.state,
            );
            if (conditionalEdges.includes(condition)) {
                this.cursor = condition;
            } else {
                throw new Error(
                    `No edge found for after node ${this.cursor} with condition ${condition}`,
                );
            }
        } else {
            throw new Error(
                `No edge or conditional edge found for after node ${this.cursor}`,
            );
        }
    }

    protected async step(): Promise<void> {
        const node = this.nodes[this.cursor]!;
        if (node === undefined) {
            throw new Error(`Node ${this.cursor} not found`);
        }
        const inputNodeState = this.stateToNodeState(this.state);
        const result = await node.run(
            { ...inputNodeState },
            this.config,
        );
        this.state = {
            ...this.state,
            ...this.nodeStateToState(result),
        };
    }

    /**
     * Can be overriden.
     * Runs when interrupting. The returned array is the cursor stack for this graph, which gets prepended to the resumeFrom.
     */
    protected setInterruptCursor(): string[] {
        return [this.cursor];
    }

    protected markInterrupt(): void {
        const interruptCursor = this.setInterruptCursor();
        this.config.resumeFrom = [
            ...interruptCursor,
            ...(this.config.resumeFrom ?? []),
        ];
    }

    /**
     * Can be overriden.
     * Runs when resuming from an interrupt. Is intended for setting up the graph before resuming from an interrupt.
     * The returned object is the cursor to resume from and the rest of the resumeFrom to propagate further in.
     */
    protected recoverFromInterrupt(): {
        cursor: string;
        remainingResumeFrom: string[];
    } {
        return {
            cursor: this.config.resumeFrom![0]!,
            remainingResumeFrom: this.config.resumeFrom!.slice(1),
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

    protected abstract ioToState(io: IO): S;
    protected abstract stateToIo(state: S): Partial<IO>;
    protected abstract stateToNodeState(state: S): NS;
    protected abstract nodeStateToState(nodeState: Partial<NS>): S;

    async run(input: IO, config: RunConfig = {}): Promise<GraphResult<IO>> {
        this.state = this.ioToState(input);
        this.config = config;
        if (this.config.resumeFrom) {
            const { cursor, remainingResumeFrom } = this.recoverFromInterrupt();
            this.cursor = cursor;
            this.config.resumeFrom = remainingResumeFrom;
        } else {
            this.cursor = START;
        }
        let shouldContinue = true;
        while (shouldContinue) {
            // End is not a real node, it's just a way to stop the state machine.
            if (this.cursor === END) {
                shouldContinue = false;
                break;
            }
            // Start is not a real node, it's just a way to start the state machine.
            if (this.cursor === START) {
                this.transition();
                continue;
            }

            await this.step();

            if (this.config.shouldInterrupt) {
                shouldContinue = false;
                this.markInterrupt();
                break;
            }

            this.transition();
        }

        return {
            state: this.stateToIo(this.state),
            exitReason: this.config.shouldInterrupt ? "interrupt" : "end",
            ...(this.config.shouldInterrupt
                ? { cursor: this.config.resumeFrom }
                : {}),
        };
    }
}
