import { describe, expect, it } from "vitest";
import { InterruptNode, makeNode } from "../nodes";
import { Interator, InteratorNodeState } from "./iterator";
import { NodeSequence } from "./node-sequence";

type state = { inputs: number[] };
type loopNodeState = InteratorNodeState<state, "loop", number>;

const timesTwo = makeNode<loopNodeState>((state) => {
    return {
        loopItem: state.loopItem * 2,
    };
});

const plusOne = makeNode<loopNodeState>((state) => {
    return {
        loopItem: state.loopItem + 1,
    };
});

describe("Iterator", () => {
    it("should run a simple iterator", async () => {
        const iterator = new Interator<state, "loop">(
            "loop",
            (state) => state.inputs,
            timesTwo,
        );
        const result = await iterator.run(
            { inputs: [1, 2, 3] },
            {},
        );
        expect(result).toEqual({
            state: { inputs: [2, 4, 6] },
            exitReason: "end",
        });
    });

    it("should run a simple iterator with a nested graph", async () => {
        const nodeSequence = new NodeSequence<loopNodeState>();
        nodeSequence
            .next(timesTwo)
            .next(plusOne);
        const iterator = new Interator<state, "loop">(
            "loop",
            (state) => state.inputs,
            nodeSequence,
        );
        const result = await iterator.run(
            { inputs: [1, 2, 3] },
            {},
        );
        expect(result).toEqual({
            state: { inputs: [3, 5, 7] },
            exitReason: "end",
        });
    });

    describe("interrupts", () => {
        const nodeSequence = new NodeSequence<loopNodeState>();
        nodeSequence
            .next(timesTwo)
            .next(new InterruptNode<loopNodeState>())
            .next(plusOne);

        const iterator = new Interator<state, "loop">(
            "loop",
            (state) => state.inputs,
            nodeSequence,
        );
        it("should interrupt when the iterator is interrupted", async () => {
            const result = await iterator.run(
                { inputs: [1, 2] },
                {},
            );
            expect(result).toEqual({
                state: { inputs: [2, 2] },
                exitReason: "interrupt",
                cursor: ["0", "iterator-loop", "node-1"],
            });
        });

        it.only("should resume when the resumeFrom is provided", async () => {
            const result = await iterator.run(
                { inputs: [1, 2] },
                {
                    resumeFrom: ["0", "iterator-loop", "node-1"],
                },
            );
            expect(result).toEqual({
                state: { inputs: [2, 4] },
                exitReason: "interrupt",
                cursor: ["1", "iterator-loop", "node-1"],
            });
        });
    });
});
