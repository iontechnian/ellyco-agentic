import { describe, expect, it } from "vitest";
import { ModelNode } from "./model-node";
import { TestModel, TestResponseConfig } from "../models/TestModel";
import { ContextLayer, RuntimeContext } from "../graphs/runtime-context";
import {
    AgentMessage,
    UserMessage,
    ToolRequest,
    SystemMessage,
} from "../messages";
import { ToolDefinition } from "../tools";
import { z } from "zod";

const TestStateSchema = z.object({
    messages: z.array(z.any()),
    output: z.any(),
    structuredData: z.any().optional(),
});
type TestState = z.infer<typeof TestStateSchema>;

function createTestContext(): ContextLayer {
    const runtime = new RuntimeContext("test-run");
    return runtime.nextLayer();
}

describe("ModelNode", () => {
    it("should invoke a normal model and return messages through specified output key", async () => {
        const state: TestState = {
            messages: [new UserMessage("Hello")],
            output: null,
        };

        const model = new TestModel({});
        const agentResponse = new AgentMessage("Hi there!");

        model.addTestConfig(
            new TestResponseConfig()
                .userSends([new UserMessage("Hello")])
                .respondWith([
                    agentResponse,
                ])
        );

        const node = new ModelNode<TestState, typeof model>(model, {
            messages: "messages",
            output: "output",
        });

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.output).toBeDefined();
        expect(result.output).toEqual([
            agentResponse,
        ]);
    });

    it("should handle messages passed as a function in settings", async () => {
        const state: TestState = {
            messages: [new UserMessage("Hello")],
            output: null,
        };

        const model = new TestModel({});
        const agentResponse = new AgentMessage("Hi there!");

        model.addTestConfig(
            new TestResponseConfig()
                .userSends([new UserMessage("Hello")])
                .respondWith([agentResponse])
        );

        const node = new ModelNode<TestState>(
            model,
            {
                messages: (state) => state.messages,
                output: "output",
            }
        );

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.output).toBeDefined();
        expect(result.output).toEqual([agentResponse]);
    });

    it("should handle tool requests from the model", async () => {
        const tool: ToolDefinition = {
            name: "get_weather",
            description: "Get the weather",
            schema: z.object({
                city: z.string(),
            }),
        };

        const state: TestState = {
            messages: [new UserMessage("What's the weather in Tokyo?")],
            output: null,
        };

        const model = new TestModel({});
        const toolRequest = new ToolRequest("1", "get_weather", {
            city: "Tokyo",
        });

        model.addTestConfig(
            new TestResponseConfig()
                .includedTools([tool])
                .userSends([new UserMessage("What's the weather in Tokyo?")])
                .respondWith([
                    toolRequest,
                ])
        );
        model.withTools([tool]);

        const node = new ModelNode<TestState, typeof model>(model, {
            messages: "messages",
            output: "output",
        });

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.output).toBeDefined();
        expect(result.output).toEqual([toolRequest]);
    });

    it("should handle structured output invokes", async () => {
        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });

        const state: TestState = {
            messages: [new UserMessage("Extract user data: John, 30")],
            output: null,
        };

        const model = new TestModel({});
        const toolRequest = new ToolRequest("1", "extract_data", {
            name: "John",
            age: 30,
        });

        model.addTestConfig(
            new TestResponseConfig()
                .userSends([new UserMessage("Extract user data: John, 30")])
                .respondWith([
                    toolRequest,
                ])
        );

        const structuredModel = model.withStructuredOutput(schema);

        const node = new ModelNode<TestState, typeof structuredModel>(structuredModel, {
            messages: "messages",
            output: "structuredData",
        });

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.structuredData).toBeDefined();
        expect(result.structuredData).toEqual({
            name: "John",
            age: 30,
        });
    });

    it("should throw error when messages key does not exist in state", async () => {
        const state: TestState = {
            messages: [],
            output: null,
        };

        const model = new TestModel({});
        const agentResponse = new AgentMessage("Hi!");

        model.addTestConfig(
            new TestResponseConfig()
                .userSends([])
                .respondWith([
                    agentResponse,
                ])
        );

        const node = new ModelNode<TestState, typeof model>(model, {
            messages: "nonexistent" as keyof TestState,
            output: "output",
        });

        const context = createTestContext();

        await expect(node.run(state, context)).rejects.toThrow(
            "No Messages array found for key nonexistent"
        );
    });

    it("should handle multiple messages in the conversation", async () => {
        const state: TestState = {
            messages: [
                new UserMessage("Hello"),
                new AgentMessage("Hi there!"),
                new UserMessage("How are you?"),
            ],
            output: null,
        };

        const model = new TestModel({});
        const agentResponse = new AgentMessage("I'm doing well, thanks for asking!");

        model.addTestConfig(
            new TestResponseConfig()
                .userSends([
                    new UserMessage("Hello"),
                    new AgentMessage("Hi there!"),
                    new UserMessage("How are you?"),
                ])
                .respondWith([
                    agentResponse,
                ])
        );

        const node = new ModelNode<TestState, typeof model>(model, {
            messages: (state) => state.messages,
            output: "output",
        });

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.output).toBeDefined();
        expect(result.output[0]?.text).toBe(
            "I'm doing well, thanks for asking!"
        );
    });

    it("should handle static system message", async () => {
        const state: TestState = {
            messages: [new UserMessage("Hello")],
            output: null,
        };

        const model = new TestModel({});
        const agentResponse = new AgentMessage("Hi there!");
        const systemMsg = new SystemMessage("You are a helpful assistant.");

        model.addTestConfig(
            new TestResponseConfig()
                .userSends([new UserMessage("Hello")])
                .respondWith([agentResponse])
        );

        const node = new ModelNode<TestState, typeof model>(model, {
            messages: "messages",
            output: "output",
            systemMessage: systemMsg,
        });

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.output).toBeDefined();
        expect(result.output).toEqual([agentResponse]);
    });

    it("should handle dynamic system message", async () => {
        const state: TestState = {
            messages: [new UserMessage("Hello")],
            output: null,
        };

        const model = new TestModel({});
        const agentResponse = new AgentMessage("Hi there!");

        model.addTestConfig(
            new TestResponseConfig()
                .userSends([new UserMessage("Hello")])
                .respondWith([agentResponse])
        );

        const node = new ModelNode<TestState, typeof model>(model, {
            messages: "messages",
            output: "output",
            systemMessage: (state, context) => new SystemMessage("Dynamic system message"),
        });

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.output).toBeDefined();
        expect(result.output).toEqual([agentResponse]);
    });

    it("should handle static tools", async () => {
        const tool: ToolDefinition = {
            name: "get_weather",
            description: "Get the weather",
            schema: z.object({
                city: z.string(),
            }),
        };

        const state: TestState = {
            messages: [new UserMessage("What's the weather?")],
            output: null,
        };

        const model = new TestModel({});
        const toolRequest = new ToolRequest("1", "get_weather", {
            city: "Tokyo",
        });

        model.addTestConfig(
            new TestResponseConfig()
                .includedTools([tool])
                .userSends([new UserMessage("What's the weather?")])
                .respondWith([toolRequest])
        );

        const node = new ModelNode<TestState, typeof model>(model, {
            messages: "messages",
            output: "output",
            tools: [tool],
        });

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.output).toBeDefined();
        expect(result.output).toEqual([toolRequest]);
    });

    it("should handle dynamic tools", async () => {
        const tool: ToolDefinition = {
            name: "get_weather",
            description: "Get the weather",
            schema: z.object({
                city: z.string(),
            }),
        };

        const state: TestState = {
            messages: [new UserMessage("What's the weather?")],
            output: null,
        };

        const model = new TestModel({});
        const toolRequest = new ToolRequest("1", "get_weather", {
            city: "Tokyo",
        });

        model.addTestConfig(
            new TestResponseConfig()
                .includedTools([tool])
                .userSends([new UserMessage("What's the weather?")])
                .respondWith([toolRequest])
        );

        const node = new ModelNode<TestState, typeof model>(model, {
            messages: "messages",
            output: "output",
            tools: (state, context) => [tool],
        });

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.output).toBeDefined();
        expect(result.output).toEqual([toolRequest]);
    });

    it("should handle dynamic output construction", async () => {
        const state: TestState = {
            messages: [new UserMessage("Hello")],
            output: null,
        };

        const model = new TestModel({});
        const agentResponse = new AgentMessage("Hi there!");

        model.addTestConfig(
            new TestResponseConfig()
                .userSends([new UserMessage("Hello")])
                .respondWith([agentResponse])
        );

        const node = new ModelNode<TestState, typeof model>(model, {
            messages: "messages",
            output: (response, state, context) => {
                return {
                    output: response.messages,
                    customField: "processed",
                };
            },
        });

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.output).toBeDefined();
        expect(result.output).toEqual([agentResponse]);
        expect((result as any).customField).toBe("processed");
    });

    it("should handle dynamic output construction with structured output", async () => {
        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });

        const state: TestState = {
            messages: [new UserMessage("Extract user data: John, 30")],
            output: null,
            structuredData: null,
        };

        const model = new TestModel({});
        const toolRequest = new ToolRequest("1", "extract_data", {
            name: "John",
            age: 30,
        });

        model.addTestConfig(
            new TestResponseConfig()
                .userSends([new UserMessage("Extract user data: John, 30")])
                .respondWith([toolRequest])
        );

        const structuredModel = model.withStructuredOutput(schema);

        const node = new ModelNode<TestState, typeof structuredModel>(structuredModel, {
            messages: "messages",
            output: (structuredOutput, state, context) => {
                return {
                    structuredData: structuredOutput,
                    processed: true,
                };
            },
        });

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.structuredData).toBeDefined();
        expect(result.structuredData).toEqual({
            name: "John",
            age: 30,
        });
        expect((result as any).processed).toBe(true);
    });

    it("should not set tools when using StructuredOutputWrapper", async () => {
        const tool: ToolDefinition = {
            name: "get_weather",
            description: "Get the weather",
            schema: z.object({
                city: z.string(),
            }),
        };

        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });

        const state: TestState = {
            messages: [new UserMessage("Extract user data: John, 30")],
            output: null,
            structuredData: null,
        };

        const model = new TestModel({});
        const toolRequest = new ToolRequest("1", "extract_data", {
            name: "John",
            age: 30,
        });

        model.addTestConfig(
            new TestResponseConfig()
                .userSends([new UserMessage("Extract user data: John, 30")])
                .respondWith([toolRequest])
        );

        const structuredModel = model.withStructuredOutput(schema);

        // Even though tools are provided, they should be ignored for StructuredOutputWrapper
        const node = new ModelNode<TestState, typeof structuredModel>(structuredModel, {
            messages: "messages",
            output: "structuredData",
            tools: [tool],
        });

        const context = createTestContext();
        const result = await node.run(state, context);

        expect(result.structuredData).toBeDefined();
        expect(result.structuredData).toEqual({
            name: "John",
            age: 30,
        });
    });
});

