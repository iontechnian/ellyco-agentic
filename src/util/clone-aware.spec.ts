import { describe, expect, it } from "vitest";
import { cloneAware } from "./clone-aware";
import { SystemMessage } from "../messages";
import { ToolRequest } from "../messages";

describe("cloneAware", () => {
    describe("primitives", () => {
        it("should return the same value for strings", () => {
            const value = "hello world";
            const cloned = cloneAware(value);
            expect(cloned).toBe(value);
        });

        it("should return the same value for numbers", () => {
            const value = 42;
            const cloned = cloneAware(value);
            expect(cloned).toBe(value);
        });

        it("should return the same value for booleans", () => {
            const value = true;
            const cloned = cloneAware(value);
            expect(cloned).toBe(value);
        });

        it("should return the same value for null", () => {
            const value = null;
            const cloned = cloneAware(value);
            expect(cloned).toBe(value);
        });

        it("should return the same value for undefined", () => {
            const value = undefined;
            const cloned = cloneAware(value);
            expect(cloned).toBe(value);
        });
    });

    describe("objects", () => {
        it("should create a deep clone of a plain object", () => {
            const original = { a: 1, b: "test", c: true };
            const cloned = cloneAware(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned.a).toBe(original.a);
        });

        it("should create a deep clone of nested objects", () => {
            const original = {
                a: 1,
                nested: {
                    b: 2,
                    deep: {
                        c: 3,
                    },
                },
            };
            const cloned = cloneAware(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned.nested).not.toBe(original.nested);
            expect(cloned.nested.deep).not.toBe(original.nested.deep);
        });

        it("should handle objects with arrays", () => {
            const original = {
                items: [1, 2, 3],
                name: "test",
            };
            const cloned = cloneAware(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned.items).not.toBe(original.items);
        });
    });

    describe("arrays", () => {
        it("should create a deep clone of a simple array", () => {
            const original = [1, 2, 3, 4, 5];
            const cloned = cloneAware(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
        });

        it("should create a deep clone of an array with objects", () => {
            const original = [
                { a: 1 },
                { b: 2 },
                { c: 3 },
            ];
            const cloned = cloneAware(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned[0]).not.toBe(original[0]);
            expect(cloned[1]).not.toBe(original[1]);
            expect(cloned[2]).not.toBe(original[2]);
        });

        it("should create a deep clone of nested arrays", () => {
            const original = [
                [1, 2],
                [3, 4],
                [5, 6],
            ];
            const cloned = cloneAware(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned[0]).not.toBe(original[0]);
            expect(cloned[1]).not.toBe(original[1]);
            expect(cloned[2]).not.toBe(original[2]);
        });

        it("should handle arrays with mixed types", () => {
            const original = [
                1,
                "string",
                true,
                { key: "value" },
                [1, 2, 3],
            ];
            const cloned = cloneAware(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned[3]).not.toBe(original[3]);
            expect(cloned[4]).not.toBe(original[4]);
        });
    });

    describe("classes", () => {
        it("should clone SystemMessage using serializer", () => {
            const original = new SystemMessage("Hello, world!");
            const cloned = cloneAware(original);

            expect(cloned).toBeInstanceOf(SystemMessage);
            expect(cloned).not.toBe(original);
            expect(cloned.text).toBe(original.text);
            expect(cloned.role).toBe(original.role);
        });

        it("should clone ToolRequest using serializer", () => {
            const original = new ToolRequest("call_123", "search", { query: "test" });
            const cloned = cloneAware(original);

            expect(cloned).toBeInstanceOf(ToolRequest);
            expect(cloned).not.toBe(original);
            expect(cloned.toolUseId).toBe(original.toolUseId);
            expect(cloned.toolName).toBe(original.toolName);
            expect(cloned.input).toEqual(original.input);
        });

        it("should clone arrays containing class instances", () => {
            const original = [
                new SystemMessage("First message"),
                new SystemMessage("Second message"),
            ];
            const cloned = cloneAware(original);

            expect(cloned).toHaveLength(2);
            expect(cloned).not.toBe(original);
            expect(cloned[0]).toBeInstanceOf(SystemMessage);
            expect(cloned[0]).not.toBe(original[0]);
            expect(cloned[0].text).toBe(original[0].text);
            expect(cloned[1]).toBeInstanceOf(SystemMessage);
            expect(cloned[1]).not.toBe(original[1]);
            expect(cloned[1].text).toBe(original[1].text);
        });

        it("should clone objects containing class instances", () => {
            const original = {
                message: new SystemMessage("Test message"),
                request: new ToolRequest("call_456", "fetch", { url: "https://example.com" }),
            };
            const cloned = cloneAware(original);

            expect(cloned).not.toBe(original);
            expect(cloned.message).toBeInstanceOf(SystemMessage);
            expect(cloned.message).not.toBe(original.message);
            expect(cloned.message.text).toBe(original.message.text);
            expect(cloned.request).toBeInstanceOf(ToolRequest);
            expect(cloned.request).not.toBe(original.request);
            expect(cloned.request.toolUseId).toBe(original.request.toolUseId);
        });

        it("should clone nested structures with class instances", () => {
            const original = {
                messages: [
                    new SystemMessage("System"),
                    new ToolRequest("call_789", "process", { data: "test" }),
                ],
                metadata: {
                    count: 2,
                },
            };
            const cloned = cloneAware(original);

            expect(cloned).not.toBe(original);
            expect(cloned.messages).not.toBe(original.messages);
            expect(cloned.messages[0]).toBeInstanceOf(SystemMessage);
            expect(cloned.messages[0]).not.toBe(original.messages[0]);
            expect(cloned.messages[1]).toBeInstanceOf(ToolRequest);
            expect(cloned.messages[1]).not.toBe(original.messages[1]);
            expect(cloned.metadata).not.toBe(original.metadata);
        });
    });
});


