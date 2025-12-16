import { describe, expect, it } from "vitest";
import { NodeSequence } from "./node-sequence";
import { makeNode } from "../nodes/function-node";
import { InterruptNode } from "../nodes/interrupt-node";
import { END, START } from "./graph";
import { StateMachine } from "./state-machine";

type state = { count: number };
const addOne = makeNode<state>((state) => ({ count: state.count + 1 }));

describe("NodeSequence", () => {
    it("should run a simple node sequence", async () => {
        const nodeSequence = new NodeSequence<state>();
        nodeSequence
            .next(addOne)
            .next(addOne)
            .next(addOne);

        const result = await nodeSequence.invoke({ count: 0 });
        expect(result).toEqual({ state: { count: 3 }, exitReason: "end" });
    });

    describe("interrupts", () => {
        const nodeSequence = new NodeSequence<state>();
        nodeSequence
            .next(addOne)
            .next(new InterruptNode<state>())
            .next(addOne);

        it("should interrupt when the interrupt node is reached", async () => {
            const result = await nodeSequence.invoke({ count: 0 });
            expect(result).toEqual({
                state: { count: 1 },
                exitReason: "interrupt",
                cursor: "node-1",
                exitMessage: "",
            });
        });

        it("should resume when the resumeFrom is provided", async () => {
            const result = await nodeSequence.invoke({ count: 0 }, {
                resumeFrom: "node-1",
            });
            expect(result).toEqual({ state: { count: 1 }, exitReason: "end" });
        });
    });

    describe("nested graphs", () => {
        it("should run a nested graph", async () => {
            const subGraph = new StateMachine<state>();
            subGraph
                .addNode("addOne", addOne)
                .addEdge(START, "addOne")
                .addEdge("addOne", END);
            const nodeSequence = new NodeSequence<state>();
            nodeSequence
                .next(addOne)
                .next(subGraph)
                .next(addOne);

            const result = await nodeSequence.invoke({ count: 0 });
            expect(result).toEqual({ state: { count: 3 }, exitReason: "end" });
        });

        describe("interrupts", () => {
            const subGraph = new StateMachine<state>();
            subGraph
                .addNode("addOne", addOne)
                .addNode("interrupt", new InterruptNode<state>())
                .addEdge(START, "addOne")
                .addEdge("addOne", "interrupt")
                .addEdge("interrupt", END);
            const nodeSequence = new NodeSequence<state>();
            nodeSequence
                .next(subGraph)
                .next(addOne);

            it("should interrupt when the nested graph is interrupted", async () => {
                const result = await nodeSequence.invoke({ count: 0 });
                expect(result).toEqual({
                    state: { count: 1 },
                    exitReason: "interrupt",
                    cursor: "node-0.interrupt",
                    exitMessage: "",
                });
            });

            it("should resume when the resumeFrom is provided", async () => {
                const result = await nodeSequence.invoke({ count: 0 }, {
                    resumeFrom: "node-0.interrupt",
                });
                expect(result).toEqual({
                    state: { count: 1 },
                    exitReason: "end",
                });
            });
        });
    });
});
