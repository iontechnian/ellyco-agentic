import { beforeEach, describe, expect, it } from "vitest";
import { StateMachine } from "./state-machine";
import { END, START } from "./graph";
import { makeNode } from "../nodes/function-node";
import { InterruptNode } from "../nodes/interrupt-node";

type state = { count: number };

describe("StateMachine", () => {
    it("should run a simple state machine", async () => {
        const stateMachine = new StateMachine<state>();
        stateMachine
            .addNode(
                "test",
                makeNode<state>((state) => ({ count: state.count + 1 })),
            )
            .addEdge(START, "test")
            .addEdge("test", END);

        const result = await stateMachine.run({ count: 0 }, {});
        expect(result).toEqual({ state: { count: 1 }, exitReason: "end" });
    });

    it.each([["nodeA", 1], ["nodeB", 2]])(
        "should correctly handle conditional edges (transition to %s)",
        async (targetState, targetCount) => {
            const stateMachine = new StateMachine<state>();
            stateMachine
                .addNode(
                    "nodeA",
                    makeNode<state>((state) => ({ count: state.count + 1 })),
                )
                .addNode(
                    "nodeB",
                    makeNode<state>((state) => ({ count: state.count + 2 })),
                )
                .addConditionalEdge(
                    START,
                    ["nodeA", "nodeB"],
                    (state) => targetState,
                )
                .addEdge("nodeA", END)
                .addEdge("nodeB", END);

            const result = await stateMachine.run({ count: 0 }, {});
            expect(result).toEqual({
                state: { count: targetCount },
                exitReason: "end",
            });
        },
    );

    describe("interrupts", () => {
        let stateMachine: StateMachine<state>;

        beforeEach(() => {
            stateMachine = new StateMachine<state>();
            stateMachine
                .addNode(
                    "first",
                    makeNode<state>((state) => ({ count: state.count + 1 })),
                )
                .addNode(
                    "second",
                    makeNode<state>((state) => ({ count: state.count + 1 })),
                )
                .addNode("interrupt", new InterruptNode<state>())
                .addNode(
                    "third",
                    makeNode<state>((state) => ({ count: state.count + 1 })),
                )
                .addEdge(START, "first")
                .addEdge("first", "second")
                .addEdge("second", "interrupt")
                .addEdge("interrupt", "third")
                .addEdge("third", END);
        });

        it("should interrupt when the interrupt node is reached", async () => {
            const result = await stateMachine.run({ count: 0 }, {});
            expect(result).toEqual({
                state: { count: 2 },
                exitReason: "interrupt",
                cursor: ["interrupt"],
            });
        });

        it("should resume when the resumeFrom is provided", async () => {
            const result = await stateMachine.run({ count: 0 }, {
                resumeFrom: ["interrupt"],
            });
            expect(result).toEqual({ state: { count: 1 }, exitReason: "end" });
        });
    });

    describe("sub-graphs", () => {
        it("should run a sub-graph", async () => {
            const subGraph = new StateMachine<state>();
            subGraph
                .addNode(
                    "test",
                    makeNode<state>((state) => ({ count: state.count + 1 })),
                )
                .addEdge(START, "test")
                .addEdge("test", END);

            const stateMachine = new StateMachine<state>();
            stateMachine
                .addNode("subgraph", subGraph)
                .addEdge(START, "subgraph")
                .addEdge("subgraph", END);

            const result = await stateMachine.run({ count: 0 }, {});
            expect(result).toEqual({ state: { count: 1 }, exitReason: "end" });
        });

        describe("interrupts", () => {
            const addOne = makeNode<state>((state) => ({
                count: state.count + 1,
            }));
            const subGraph = new StateMachine<state>();
            subGraph
                .addNode("first", addOne)
                .addNode("interrupt", new InterruptNode<state>())
                .addNode("second", addOne)
                .addEdge(START, "first")
                .addEdge("first", "interrupt")
                .addEdge("interrupt", "second")
                .addEdge("second", END);

            const stateMachine = new StateMachine<state>();
            stateMachine
                .addNode("subgraph", subGraph)
                .addEdge(START, "subgraph")
                .addEdge("subgraph", END);

            it.only("should interrupt when the interrupt node is reached", async () => {
                const result = await stateMachine.run({ count: 0 }, {});
                expect(result).toEqual({
                    state: { count: 1 },
                    exitReason: "interrupt",
                    cursor: ["subgraph", "interrupt"],
                });
            });

            it("should resume when the resumeFrom is provided", async () => {
                const result = await stateMachine.run({ count: 0 }, {
                    resumeFrom: ["subgraph", "interrupt"],
                });
                expect(result).toEqual({
                    state: { count: 1 },
                    exitReason: "end",
                });
            });
        });
    });
});
