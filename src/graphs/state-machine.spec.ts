import { beforeAll, beforeEach, describe, expect, it, afterAll } from "vitest";
import { StateMachine } from "./state-machine";
import { END, START } from "./graph";
import { makeNode } from "../nodes/function-node";
import { InterruptNode } from "../nodes/interrupt-node";
import { z } from "zod";
import { SQLiteStore } from "./store/sqlite-store";
import Database from "better-sqlite3";

const schema = z.object({
    count: z.number(),
});
type state = z.infer<typeof schema>;

const runId = 'test-run-id';

describe("StateMachine", () => {
    it("should run a simple state machine", async () => {
        const stateMachine = new StateMachine(schema);
        stateMachine
            .addNode(
                "test",
                makeNode<state>((state) => ({ count: state.count + 1 })),
            )
            .addEdge(START, "test")
            .addEdge("test", END);

        const result = await stateMachine.invoke({ count: 0 }, { runId });
        expect(result).toEqual({ state: { count: 1 }, exitReason: "end", runId });
    });

    it.each([["nodeA", 1], ["nodeB", 2]])(
        "should correctly handle conditional edges (transition to %s)",
        async (targetState, targetCount) => {
            const stateMachine = new StateMachine(schema);
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

            const result = await stateMachine.invoke({ count: 0 }, { runId });
            expect(result).toEqual({
                state: { count: targetCount },
                exitReason: "end",
                runId,
            });
        },
    );

    describe("interrupts", () => {
        let stateMachine: StateMachine<typeof schema>;

        beforeEach(() => {
            stateMachine = new StateMachine(schema);
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
            const result = await stateMachine.invoke({ count: 0 }, { runId });
            expect(result).toEqual({
                state: { count: 2 },
                exitReason: "interrupt",
                cursor: "interrupt",
                exitMessage: "",
                runId,
            });
        });

        it("should resume when the resumeFrom is provided", async () => {
            const result = await stateMachine.invoke({ count: 0 }, {
                resumeFrom: "interrupt",
                runId,
            });
            expect(result).toEqual({ state: { count: 1 }, exitReason: "end", runId });
        });
    });

    describe("sub-graphs", () => {
        it("should run a sub-graph", async () => {
            const subGraph = new StateMachine(schema);
            subGraph
                .addNode(
                    "test",
                    makeNode<state>((state) => ({ count: state.count + 1 })),
                )
                .addEdge(START, "test")
                .addEdge("test", END);

            const stateMachine = new StateMachine(schema);
            stateMachine
                .addNode("subgraph", subGraph)
                .addEdge(START, "subgraph")
                .addEdge("subgraph", END);

            const result = await stateMachine.invoke({ count: 0 }, { runId });
            expect(result).toEqual({ state: { count: 1 }, exitReason: "end", runId });
        });

        describe("interrupts", () => {
            const addOne = makeNode<state>((state) => ({
                count: state.count + 1,
            }));
            const subGraph = new StateMachine(schema);
            subGraph
                .addNode("first", addOne)
                .addNode("interrupt", new InterruptNode<state>())
                .addNode("second", addOne)
                .addEdge(START, "first")
                .addEdge("first", "interrupt")
                .addEdge("interrupt", "second")
                .addEdge("second", END);

            const stateMachine = new StateMachine(schema);
            stateMachine
                .addNode("subgraph", subGraph)
                .addEdge(START, "subgraph")
                .addEdge("subgraph", END);

            it("should interrupt when the interrupt node is reached", async () => {
                const result = await stateMachine.invoke({ count: 0 }, { runId });
                expect(result).toEqual({
                    state: { count: 1 },
                    exitReason: "interrupt",
                    exitMessage: "",
                    cursor: "subgraph.interrupt",
                    runId,
                });
            });

            it("should resume when the resumeFrom is provided", async () => {
                const result = await stateMachine.invoke({ count: 0 }, {
                    resumeFrom: "subgraph.interrupt",
                    runId,
                });
                expect(result).toEqual({
                    state: { count: 1 },
                    exitReason: "end",
                    runId,
                });
            });
        });
    });

    describe("store", () => {
        let store: SQLiteStore;

        beforeAll(() => {
            store = new SQLiteStore(new Database(":memory:"));
        });

        afterAll(() => {
            store.dispose();
        });

        describe("run-1 (normal)", () => {
            const runId = "run-1";
            const stateMachine = new StateMachine(schema);
            stateMachine
                .addNode("first", makeNode<state>((state) => ({ count: state.count + 1 })))
                .addEdge(START, "first")
                .addEdge("first", END);

            it("should run and save state", async () => {
                const result = await stateMachine.invoke({ count: 0 }, { runId, store });
                expect(result).toEqual({
                    state: { count: 1 },
                    exitReason: "end",
                    runId,
                });
                expect(await store.getStoredRun(runId).load()).toEqual({
                    cursor: "end",
                    state: { count: 1 },
                });
            });

            it("should just return state if cursor was set to 'end'", async () => {
                const result = await stateMachine.invoke({}, { runId, store });
                expect(result).toEqual({
                    state: { count: 1 },
                    exitReason: "end",
                    runId,
                });
            });
        });

        describe("run-2 (normal with deleteAfterEnd)", () => {
            const runId = "run-2";
            const stateMachine = new StateMachine(schema);
            stateMachine
                .addNode("first", makeNode<state>((state) => ({ count: state.count + 1 })))
                .addEdge(START, "first")
                .addEdge("first", END);
            it("should run and not save state", async () => {
                const result = await stateMachine.invoke({ count: 0 }, { runId, store, deleteAfterEnd: true });
                expect(result).toEqual({
                    state: { count: 1 },
                    exitReason: "end",
                    runId,
                });
                expect(await store.getStoredRun(runId).exists()).toBe(false);
            });
        });

        describe("run-3 (interrupt)", () => {
            const runId = "run-3";
            const stateMachine = new StateMachine(schema);
            stateMachine
                .addNode("first", makeNode<state>((state) => ({ count: state.count + 1 })))
                .addNode("interrupt", new InterruptNode<state>())
                .addNode("second", makeNode<state>((state) => ({ count: state.count + 1 })))
                .addEdge(START, "first")
                .addEdge("first", "interrupt")
                .addEdge("interrupt", "second")
                .addEdge("second", END);

            it("should save state when interrupted", async () => {
                const result = await stateMachine.invoke({ count: 0 }, { runId, store });
                expect(result).toEqual({
                    state: { count: 1 },
                    exitReason: "interrupt",
                    cursor: "interrupt",
                    exitMessage: "",
                    runId,
                });
                expect(await store.getStoredRun(runId).load()).toEqual({
                    cursor: "interrupt",
                    state: { count: 1 },
                });
            });

            it("should resume from the stored state", async () => {
                const result = await stateMachine.invoke({}, { runId, store });
                expect(result).toEqual({
                    state: { count: 2 },
                    exitReason: "end",
                    runId,
                });
                expect(await store.getStoredRun(runId).load()).toEqual({
                    cursor: "end",
                    state: { count: 2 },
                });
            });
        });

        describe("run-4 (nested graph)", () => {
            const runId = "run-4";
            const subGraph = new StateMachine(schema);
            subGraph
                .addNode("second", makeNode<state>((state) => ({ count: state.count + 1 })))
                .addNode("interrupt", new InterruptNode<state>())
                .addNode("third", makeNode<state>((state) => ({ count: state.count + 1 })))
                .addEdge(START, "second")
                .addEdge("second", "interrupt")
                .addEdge("interrupt", "third")
                .addEdge("third", END);
            const stateMachine = new StateMachine(schema);
            stateMachine
                .addNode("first", makeNode<state>((state) => ({ count: state.count + 1 })))
                .addNode("subgraph", subGraph)
                .addEdge(START, "first")
                .addEdge("first", "subgraph")
                .addEdge("subgraph", END);

            it("should save when interrupted", async () => {
                const result = await stateMachine.invoke({ count: 0 }, { runId, store });
                expect(result).toEqual({
                    state: { count: 2 },
                    exitReason: "interrupt",
                    cursor: "subgraph.interrupt",
                    exitMessage: "",
                    runId,
                });
                expect(await store.getStoredRun(runId).load()).toEqual({
                    cursor: "subgraph.interrupt",
                    state: { count: 2 },
                });
            });

            it("should resume from the stored state", async () => {
                const result = await stateMachine.invoke({}, { runId, store });
                expect(result).toEqual({
                    state: { count: 3 },
                    exitReason: "end",
                    runId,
                });
                expect(await store.getStoredRun(runId).load()).toEqual({
                    cursor: "end",
                    state: { count: 3 },
                });
            });
        });
    });
});
