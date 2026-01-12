import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mergeState } from "./merge-state";
import { STATE_MERGE } from "../graphs/registry";
import { ModelMessages } from "../messages";
import { UserMessage } from "../messages";

describe("mergeState", () => {
    // without a merge function, the changes replace the existing state
    it("should merge changes without any registered merge functions", () => {
        const schema = z.object({
            count: z.number(),
        });
        type schemaType = z.infer<typeof schema>;
        const state: schemaType = { count: 1 };
        const changes: Partial<schemaType> = { count: 2 };
        const result = mergeState(state, changes, schema);
        expect(result).toEqual({ count: 2 });
    });

    it("should recursively merge changes without any registered merge functions", () => {
        const schema = z.object({
            count: z.number(),
            nested: z.object({
                count: z.number(),
            }),
        });
        type schemaType = z.infer<typeof schema>;
        const state: schemaType = { count: 1, nested: { count: 2 } };
        const changes: Partial<schemaType> = { count: 3, nested: { count: 4 } };
        const result = mergeState(state, changes, schema);
        expect(result).toEqual({ count: 3, nested: { count: 4 } });
    });

    it("should merge changes with registered merge functions", () => {
        const schema = z.object({
            count: z.number().register(STATE_MERGE, { merge: (old: number, change: number) => old + change }),
        });
        type schemaType = z.infer<typeof schema>;
        const state: schemaType = { count: 1 };
        const changes: Partial<schemaType> = { count: 2 };
        const result = mergeState(state, changes, schema);
        expect(result).toEqual({ count: 3 });
    });

    it("should merge changes with registered merge functions recursively", () => {
        const schema = z.object({
            count: z.number().register(STATE_MERGE, { merge: (old: number, change: number) => old + change }),
            nested: z.object({
                count: z.number().register(STATE_MERGE, { merge: (old: number, change: number) => old + change }),
            }),
        });
        type schemaType = z.infer<typeof schema>;
        const state: schemaType = { count: 1, nested: { count: 2 } };
        const changes: Partial<schemaType> = { count: 3, nested: { count: 4 } };
        const result = mergeState(state, changes, schema);
        expect(result).toEqual({ count: 4, nested: { count: 6 } });
    });

    it("should handle merges of complex types", () => {
        const schema = z.object({
            messages: z.array(z.object({
                id: z.string(),
                content: z.string(),
            })).register(STATE_MERGE, { merge: (old: { id: string, content: string }[], change: { id: string, content: string }[]) => old.concat(change) }),
        });
        type schemaType = z.infer<typeof schema>;
        const state: schemaType = { messages: [{ id: "1", content: "Hello" }] };
        const changes: Partial<schemaType> = { messages: [{ id: "2", content: "World" }] };
        const result = mergeState(state, changes, schema);
        expect(result).toEqual({ messages: [{ id: "1", content: "Hello" }, { id: "2", content: "World" }] });
    });

    it("should handle merging Message arrays", () => {
        const schema = z.object({
            messages: z.array(z.custom<ModelMessages>()).register(STATE_MERGE, { merge: (old: ModelMessages[], change: ModelMessages[]) => old.concat(change) }),
        });
        type schemaType = z.infer<typeof schema>;
        const state: schemaType = { messages: [new UserMessage("Hello")] };
        const changes: Partial<schemaType> = { messages: [new UserMessage("World")] };
        const result = mergeState(state, changes, schema);
        expect(result).toStrictEqual({ messages: [new UserMessage("Hello"), new UserMessage("World")] });
    });
});