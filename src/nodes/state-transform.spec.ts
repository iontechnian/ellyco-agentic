import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { StateTransformNode } from "./state-transform";
import { makeNode } from "./function-node";
import { InterruptNode } from "./interrupt-node";
import { StateMachine } from "../graphs/state-machine";
import { NodeSequence } from "../graphs/node-sequence";
import { SQLiteStore } from "../graphs/store/sqlite-store";
import { ContextLayer } from "../graphs/runtime-context";
import Database from "better-sqlite3";
import { z } from "zod";
import { END, InterruptResult, START } from "../graphs";

// Parent schema (the graph's state)
const parentSchema = z.object({
    userId: z.string(),
    userName: z.string(),
    count: z.number(),
});

type ParentState = z.infer<typeof parentSchema>;

// Child schema (the wrapped node's state)
const childSchema = z.object({
    id: z.string(),
    name: z.string(),
    value: z.number(),
});

type ChildState = z.infer<typeof childSchema>;

const runId = "test-run-id";

describe("StateTransformNode", () => {
    describe("with NodeLike", () => {
        it("should transform state from parent to child and back", async () => {
            const inputTransform = (state: ParentState): ChildState => ({
                id: state.userId,
                name: state.userName,
                value: state.count,
            });

            const outputTransform = (state: ChildState): Partial<ParentState> => ({
                userId: state.id,
                userName: state.name,
                count: state.value,
            });

            const childNode = makeNode<ChildState>((state) => ({
                value: state.value + 1,
            }));

            const transformNode = new StateTransformNode(
                childSchema,
                inputTransform,
                childNode,
                outputTransform,
            );

            const stateMachine = new StateMachine(parentSchema);
            stateMachine
                .addNode("transform", transformNode)
                .addEdge(START, "transform")
                .addEdge("transform", END);

            const result = await stateMachine.invoke(
                {
                    userId: "123",
                    userName: "Alice",
                    count: 5,
                },
                { runId },
            );

            expect(result).toEqual({
                state: {
                    userId: "123",
                    userName: "Alice",
                    count: 6,
                },
                exitReason: "end",
                runId,
            });
        });

        it("should handle partial state updates from child node", async () => {
            const inputTransform = (state: ParentState): ChildState => ({
                id: state.userId,
                name: state.userName,
                value: state.count,
            });

            const outputTransform = (state: ChildState): Partial<ParentState> => ({
                count: state.value,
            });

            const childNode = makeNode<ChildState>((state) => ({
                value: state.value * 2,
            }));

            const transformNode = new StateTransformNode(
                childSchema,
                inputTransform,
                childNode,
                outputTransform,
            );

            const stateMachine = new StateMachine(parentSchema);
            stateMachine
                .addNode("transform", transformNode)
                .addEdge(START, "transform")
                .addEdge("transform", END);

            const result = await stateMachine.invoke(
                {
                    userId: "123",
                    userName: "Alice",
                    count: 5,
                },
                { runId },
            );

            expect(result).toEqual({
                state: {
                    userId: "123",
                    userName: "Alice",
                    count: 10,
                },
                exitReason: "end",
                runId,
            });
        });
    });

    describe("with Graph", () => {
        it("should work with a nested NodeSequence", async () => {
            const inputTransform = (state: ParentState): ChildState => ({
                id: state.userId,
                name: state.userName,
                value: state.count,
            });

            const outputTransform = (state: ChildState): Partial<ParentState> => ({
                count: state.value,
            });

            const childSequence = new NodeSequence(childSchema);
            childSequence
                .next(makeNode<ChildState>((state) => ({ value: state.value + 1 })))
                .next(makeNode<ChildState>((state) => ({ value: state.value * 2 })));

            const transformNode = new StateTransformNode(
                childSchema,
                inputTransform,
                childSequence,
                outputTransform,
            );

            const stateMachine = new StateMachine(parentSchema);
            stateMachine
                .addNode("transform", transformNode)
                .addEdge(START, "transform")
                .addEdge("transform", END);

            const result = await stateMachine.invoke(
                {
                    userId: "123",
                    userName: "Alice",
                    count: 5,
                },
                { runId },
            );

            expect(result).toEqual({
                state: {
                    userId: "123",
                    userName: "Alice",
                    count: 12, // (5 + 1) * 2
                },
                exitReason: "end",
                runId,
            });
        });

        it("should work with a nested StateMachine", async () => {
            const inputTransform = (state: ParentState): ChildState => ({
                id: state.userId,
                name: state.userName,
                value: state.count,
            });

            const outputTransform = (state: ChildState): Partial<ParentState> => ({
                count: state.value,
            });

            const childMachine = new StateMachine(childSchema);
            childMachine
                .addNode("add", makeNode<ChildState>((state) => ({ value: state.value + 10 })))
                .addNode("multiply", makeNode<ChildState>((state) => ({ value: state.value * 3 })))
                .addEdge(START, "add")
                .addEdge("add", "multiply")
                .addEdge("multiply", END);

            const transformNode = new StateTransformNode(
                childSchema,
                inputTransform,
                childMachine,
                outputTransform,
            );

            const stateMachine = new StateMachine(parentSchema);
            stateMachine
                .addNode("transform", transformNode)
                .addEdge(START, "transform")
                .addEdge("transform", END);

            const result = await stateMachine.invoke(
                {
                    userId: "123",
                    userName: "Alice",
                    count: 5,
                },
                { runId },
            );

            expect(result).toEqual({
                state: {
                    userId: "123",
                    userName: "Alice",
                    count: 45, // (5 + 10) * 3
                },
                exitReason: "end",
                runId,
            });
        });
    });

    describe("interrupts", () => {
        it("should handle interrupts within the wrapped node", async () => {
            const inputTransform = (state: ParentState): ChildState => ({
                id: state.userId,
                name: state.userName,
                value: state.count,
            });

            const outputTransform = (state: ChildState): Partial<ParentState> => ({
                count: state.value,
            });

            const childSequence = new NodeSequence(childSchema);
            childSequence
                .next(makeNode<ChildState>((state) => ({ value: state.value + 1 })))
                .next(new InterruptNode<ChildState>())
                .next(makeNode<ChildState>((state) => ({ value: state.value * 2 })));

            const transformNode = new StateTransformNode(
                childSchema,
                inputTransform,
                childSequence,
                outputTransform,
            );

            const stateMachine = new StateMachine(parentSchema);
            stateMachine
                .addNode("transform", transformNode)
                .addEdge(START, "transform")
                .addEdge("transform", END);

            const result = await stateMachine.invoke(
                {
                    userId: "123",
                    userName: "Alice",
                    count: 5,
                },
                { runId },
            );

            expect(result).toEqual({
                state: {
                    userId: "123",
                    userName: "Alice",
                    count: 5, // doesn't update state, because the wrapper hasn't finished
                    "__wrappedState_ROOT.transform": {
                        id: "123",
                        name: "Alice",
                        value: 6,
                    },
                },
                exitReason: "interrupt",
                cursor: "transform.node-1",
                exitMessage: "",
                runId,
            });
        });

        it("should resume from interrupt correctly", async () => {
            const inputTransform = (state: ParentState): ChildState => ({
                id: state.userId,
                name: state.userName,
                value: state.count,
            });

            const outputTransform = (state: ChildState): Partial<ParentState> => ({
                count: state.value,
            });

            const childSequence = new NodeSequence(childSchema);
            childSequence
                .next(makeNode<ChildState>((state) => ({ value: state.value + 1 })))
                .next(new InterruptNode<ChildState>())
                .next(makeNode<ChildState>((state) => ({ value: state.value * 2 })));

            const transformNode = new StateTransformNode(
                childSchema,
                inputTransform,
                childSequence,
                outputTransform,
            );

            const stateMachine = new StateMachine(parentSchema);
            stateMachine
                .addNode("transform", transformNode)
                .addEdge(START, "transform")
                .addEdge("transform", END);

            // First invocation - should interrupt
            const firstResult = await stateMachine.invoke(
                {
                    userId: "123",
                    userName: "Alice",
                    count: 5,
                } as any,
                { runId },
            );

            expect(firstResult.exitReason).toBe("interrupt");
            expect(firstResult.state.count).toBe(5);
            expect(firstResult.state["__wrappedState_ROOT.transform"]).toEqual({
                id: "123",
                name: "Alice",
                value: 6,
            });

            // Resume from interrupt
            const secondResult = await stateMachine.invoke(
                firstResult.state,
                {
                    runId,
                    resumeFrom: (firstResult as InterruptResult<ParentState>).cursor!,
                },
            );

            expect(secondResult).toEqual({
                state: {
                    userId: "123",
                    userName: "Alice",
                    count: 12, // 6 * 2 (after resume)
                },
                exitReason: "end",
                runId,
            });
        });
    });

    describe("stored runs with interrupts", () => {
        let store: SQLiteStore;
        let db: Database.Database;

        beforeAll(() => {
            db = new Database(":memory:");
            store = new SQLiteStore(db, "test_runs");
        });

        afterAll(async () => {
            await store.dispose();
        });

        beforeEach(async () => {
            // Clean up any existing runs
            try {
                await store.delete("stored-run-test");
            } catch {
                // Ignore if doesn't exist
            }
            try {
                await store.delete("multi-interrupt-test");
            } catch {
                // Ignore if doesn't exist
            }
        });

        it("should save and restore state when interrupted with stored runs", async () => {
            const inputTransform = (state: ParentState): ChildState => ({
                id: state.userId,
                name: state.userName,
                value: state.count,
            });

            const outputTransform = (state: ChildState): Partial<ParentState> => ({
                count: state.value,
            });

            const childSequence = new NodeSequence(childSchema);
            childSequence
                .next(makeNode<ChildState>((state) => ({ value: state.value + 1 })))
                .next(new InterruptNode<ChildState>())
                .next(makeNode<ChildState>((state) => ({ value: state.value * 2 })));

            const transformNode = new StateTransformNode(
                childSchema,
                inputTransform,
                childSequence,
                outputTransform,
            );

            const stateMachine = new StateMachine(parentSchema);
            stateMachine
                .addNode("transform", transformNode)
                .addEdge(START, "transform")
                .addEdge("transform", END);

            const runId = "stored-run-test";

            // First invocation - should interrupt and save to store
            const firstResult = await stateMachine.invoke(
                {
                    userId: "123",
                    userName: "Alice",
                    count: 5,
                },
                { runId, store },
            );

            expect(firstResult.exitReason).toBe("interrupt");
            expect(firstResult.state.count).toBe(5);
            expect(firstResult.state["__wrappedState_ROOT.transform"]).toEqual({
                id: "123",
                name: "Alice",
                value: 6,
            });

            // Verify state was saved
            const storedRun = store.getStoredRun(runId);
            expect(await storedRun.exists()).toBe(true);
            const { cursor, state: storedState } = await storedRun.load();
            expect(cursor).toBe("transform.node-1");
            expect(storedState).toHaveProperty("userId", "123");
            expect(storedState).toHaveProperty("userName", "Alice");
            expect(storedState).toHaveProperty("count", 5);
            // Should have wrapped state key (dynamic key based on context)
            const wrappedStateKeys = Object.keys(storedState).filter((key) =>
                key.startsWith("__wrappedState_") && key.endsWith(".transform"),
            );
            expect(wrappedStateKeys.length).toBeGreaterThan(0);


            // Resume from stored state
            const secondResult = await stateMachine.invoke(
                {},
                {
                    runId,
                    store,
                },
            );

            expect(secondResult).toEqual({
                state: {
                    userId: "123",
                    userName: "Alice",
                    count: 12, // 6 * 2 (after resume)
                },
                exitReason: "end",
                runId,
            });
        });

        it("should handle multiple interrupts and resumes with stored runs", async () => {
            const inputTransform = (state: ParentState): ChildState => ({
                id: state.userId,
                name: state.userName,
                value: state.count,
            });

            const outputTransform = (state: ChildState): Partial<ParentState> => ({
                count: state.value,
            });

            const childSequence = new NodeSequence(childSchema);
            childSequence
                .next(makeNode<ChildState>((state) => ({ value: state.value + 1 })))
                .next(new InterruptNode<ChildState>())
                .next(makeNode<ChildState>((state) => ({ value: state.value + 5 })))
                .next(new InterruptNode<ChildState>())
                .next(makeNode<ChildState>((state) => ({ value: state.value * 2 })));

            const transformNode = new StateTransformNode(
                childSchema,
                inputTransform,
                childSequence,
                outputTransform,
            );

            const stateMachine = new StateMachine(parentSchema);
            stateMachine
                .addNode("transform", transformNode)
                .addEdge(START, "transform")
                .addEdge("transform", END);

            const runId = "multi-interrupt-test";

            // First interrupt
            const firstResult = await stateMachine.invoke(
                {
                    userId: "123",
                    userName: "Alice",
                    count: 5,
                },
                { runId, store },
            );

            expect(firstResult.exitReason).toBe("interrupt");
            expect(firstResult.state.count).toBe(5);
            expect(firstResult.state["__wrappedState_ROOT.transform"]).toEqual({
                id: "123",
                name: "Alice",
                value: 6,
            });

            // Resume to second interrupt
            const secondResult = await stateMachine.invoke(
                {},
                { runId, store },
            );

            expect(secondResult.exitReason).toBe("interrupt");
            expect(secondResult.state.count).toBe(5);
            expect(secondResult.state["__wrappedState_ROOT.transform"]).toEqual({
                id: "123",
                name: "Alice",
                value: 11,
            });

            // Final resume
            const thirdResult = await stateMachine.invoke(
                {},
                { runId, store },
            );

            expect(thirdResult).toEqual({
                state: {
                    userId: "123",
                    userName: "Alice",
                    count: 22, // 11 * 2
                },
                exitReason: "end",
                runId,
            });
        });
    });

    describe("error handling", () => {
        it("should throw error when input transformation doesn't match schema", async () => {
            const inputTransform = (state: ParentState): ChildState => ({
                id: state.userId,
                name: state.userName,
                value: `${state.count}`, // incorrect type
            } as any);

            const outputTransform = (state: ChildState): Partial<ParentState> => ({
                count: state.value,
            });

            const childNode = makeNode<ChildState>((state) => ({
                value: state.value + 1,
            }));

            const transformNode = new StateTransformNode(
                childSchema,
                inputTransform,
                childNode,
                outputTransform,
            );

            const stateMachine = new StateMachine(parentSchema);
            stateMachine
                .addNode("transform", transformNode)
                .addEdge(START, "transform")
                .addEdge("transform", END);

            await expect(
                stateMachine.invoke(
                    {
                        userId: "123",
                        userName: "Alice",
                        count: 5,
                    },
                    { runId },
                ),
            ).rejects.toThrow(/Transformed input does not match schema/);
        });
    });

    describe("context usage", () => {
        it("should pass context to input and output transformations", async () => {
            let inputContextReceived: ContextLayer | undefined;
            let outputContextReceived: ContextLayer | undefined;

            const inputTransform = (state: ParentState, context: ContextLayer): ChildState => {
                inputContextReceived = context;
                return {
                    id: state.userId,
                    name: state.userName,
                    value: state.count,
                };
            };

            const outputTransform = (state: ChildState, context: ContextLayer): Partial<ParentState> => {
                outputContextReceived = context;
                return {
                    count: state.value,
                };
            };

            const childNode = makeNode<ChildState>((state) => ({
                value: state.value + 1,
            }));

            const transformNode = new StateTransformNode(
                childSchema,
                inputTransform,
                childNode,
                outputTransform,
            );

            const stateMachine = new StateMachine(parentSchema);
            stateMachine
                .addNode("transform", transformNode)
                .addEdge(START, "transform")
                .addEdge("transform", END);

            await stateMachine.invoke(
                {
                    userId: "123",
                    userName: "Alice",
                    count: 5,
                },
                { runId },
            );

            expect(inputContextReceived).toBeDefined();
            expect(outputContextReceived).toBeDefined();
            expect(inputContextReceived?.currentNode).toBe("end");
            expect(outputContextReceived?.currentNode).toBe("end");
        });
    });
});

