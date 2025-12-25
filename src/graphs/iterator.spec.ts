import { describe, expect, it } from "vitest";
import { InterruptNode, makeNode } from "../nodes";
import { Iterator, IteratorNodeState } from "./iterator";
import { NodeSequence } from "./node-sequence";
import { z } from "zod";

const schema = z.object({
    inputs: z.array(z.number()),
});
type state = z.infer<typeof schema>;
type loopNodeState = IteratorNodeState<state, "loop", number>;

const runId = 'test-run-id';

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
        const iterator = new Iterator(
            schema,
            "loop",
            "inputs",
        );
        iterator.setLoopedNode(timesTwo);
        const result = await iterator.invoke(
            { inputs: [1, 2, 3] },
            { runId },
        );
        expect(result).toEqual({
            state: { inputs: [2, 4, 6] },
            exitReason: "end",
            runId,
        });
    });

    it("should run a simple iterator with a nested graph", async () => {
        const nodeSequence = new NodeSequence(schema);
        nodeSequence
            .next(timesTwo)
            .next(plusOne);
        const iterator = new Iterator(
            schema,
            "loop",
            "inputs",
        );
        iterator.setLoopedNode(nodeSequence);
        const result = await iterator.invoke(
            { inputs: [1, 2, 3] },
            { runId },
        );
        expect(result).toEqual({
            state: { inputs: [3, 5, 7] },
            exitReason: "end",
            runId,
        });
    });

    describe("interrupts", () => {
        const nodeSequence = new NodeSequence(schema);
        nodeSequence
            .next(timesTwo)
            .next(new InterruptNode<loopNodeState>())
            .next(plusOne);

        const iterator = new Iterator(
            schema,
            "loop",
            "inputs",
        );
        iterator.setLoopedNode(nodeSequence);
        it("should interrupt when the iterator is interrupted", async () => {
            const result = await iterator.invoke(
                { inputs: [1, 2] },
                { runId },
            );
            expect(result).toEqual({
                state: { inputs: [2, 2] },
                exitReason: "interrupt",
                exitMessage: "",
                cursor: "0.iterator-loop.node-1",
                runId,
            });
        });

        it("should resume when the resumeFrom is provided", async () => {
            const result = await iterator.invoke(
                { inputs: [1, 2] },
                {
                    resumeFrom: "0.iterator-loop.node-1",
                    runId,
                },
            );
            expect(result).toEqual({
                state: { inputs: [2, 4] },
                exitReason: "interrupt",
                exitMessage: "",
                cursor: "1.iterator-loop.node-1",
                runId,
            });
        });
    });
});
