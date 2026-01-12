import { describe, expect, it } from "vitest";
import { ReActAgent } from "./react-agent";
import { TestModel, TestResponseConfig } from "./TestModel";
import { AgentMessage, ToolRequest, ToolResponse, UserMessage } from "../messages";
import { defineTool, tool } from "../tools";
import * as z from "zod";

describe("ReActAgent", () => {
    describe("model returns no tool requests", () => {
        it("should return immediately when model responds with AgentMessage", async () => {
            const model = new TestModel({});
            const userMessage = new UserMessage("Hello");
            const agentMessage = new AgentMessage("Hi there!");

            model.addTestConfig(
                new TestResponseConfig()
                    .userSends([userMessage])
                    .respondWith([agentMessage]),
            );

            const agent = new ReActAgent(model, []);
            const response = await agent.invoke([userMessage]);

            expect(response.messages).toHaveLength(1);
            expect(response.messages[0]).toBeInstanceOf(AgentMessage);
            expect((response.messages[0] as AgentMessage).text).toBe("Hi there!");
        });

        it("should return immediately when model responds with multiple AgentMessages", async () => {
            const model = new TestModel({});
            const userMessage = new UserMessage("Tell me a joke");
            const agentMessage1 = new AgentMessage("Why did the chicken cross the road?");
            const agentMessage2 = new AgentMessage("To get to the other side!");

            model.addTestConfig(
                new TestResponseConfig()
                    .userSends([userMessage])
                    .respondWith([agentMessage1, agentMessage2]),
            );

            const agent = new ReActAgent(model, []);
            const response = await agent.invoke([userMessage]);

            expect(response.messages).toHaveLength(2);
            expect(response.messages[0]).toBeInstanceOf(AgentMessage);
            expect(response.messages[1]).toBeInstanceOf(AgentMessage);
        });
    });

    describe("model returns one tool request", () => {
        it("should execute tool and return final response", async () => {
            const model = new TestModel({});
            const searchTool = tool(
                defineTool(
                    "search",
                    "Search for information",
                    z.object({ query: z.string() }),
                ),
                async (input) => {
                    return { results: [`Results for: ${input.query}`] };
                },
            );

            const userMessage = new UserMessage("Search for TypeScript");
            const toolRequest = new ToolRequest("call_1", "search", { query: "TypeScript" });
            const finalAgentMessage = new AgentMessage("Here are the search results.");

            // First invocation: model requests tool
            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools([searchTool])
                    .userSends([userMessage])
                    .respondWith([toolRequest]),
            );

            // Second invocation: model responds after tool execution
            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools([searchTool])
                    .userSends([
                        userMessage,
                        toolRequest,
                        new ToolResponse("call_1", "search", { results: ["Results for: TypeScript"] }),
                    ])
                    .respondWith([finalAgentMessage]),
            );

            const agent = new ReActAgent(model, [searchTool]);
            const response = await agent.invoke([userMessage]);

            expect(response.messages).toHaveLength(1);
            expect(response.messages[0]).toBeInstanceOf(AgentMessage);
            expect((response.messages[0] as AgentMessage).text).toBe("Here are the search results.");
        });

        it("should pass additionalArgs to tool function", async () => {
            const model = new TestModel({});
            let receivedAdditionalArgs: Record<string, any> | undefined;

            const calculatorTool = tool(
                defineTool(
                    "calculate",
                    "Perform calculations",
                    z.object({ expression: z.string() }),
                ),
                async (input, additionalArgs) => {
                    receivedAdditionalArgs = additionalArgs;
                    return { result: 42 };
                },
            );

            const userMessage = new UserMessage("Calculate 2+2");
            const toolRequest = new ToolRequest("call_1", "calculate", { expression: "2+2" });
            const finalAgentMessage = new AgentMessage("The result is 42.");

            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools([calculatorTool])
                    .userSends([userMessage])
                    .respondWith([toolRequest]),
            );

            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools([calculatorTool])
                    .userSends([
                        userMessage,
                        toolRequest,
                        new ToolResponse("call_1", "calculate", { result: 42 }),
                    ])
                    .respondWith([finalAgentMessage]),
            );

            const agent = new ReActAgent(model, [calculatorTool]);
            const additionalArgs = { userId: "123", sessionId: "abc" };
            await agent.invoke([userMessage], additionalArgs);

            expect(receivedAdditionalArgs).toEqual(additionalArgs);
        });
    });

    describe("model has back and forth with multiple tool requests", () => {
        it("should handle multiple sequential tool requests", async () => {
            const model = new TestModel({});

            const searchTool = tool(
                defineTool(
                    "search",
                    "Search for information",
                    z.object({ query: z.string() }),
                ),
                async (input) => {
                    return { results: [`Results for: ${input.query}`] };
                },
            );

            const getDetailsTool = tool(
                defineTool(
                    "get_details",
                    "Get detailed information",
                    z.object({ id: z.string() }),
                ),
                async (input) => {
                    return { details: `Details for ID: ${input.id}` };
                },
            );

            const userMessage = new UserMessage("Search and get details");
            const toolRequest1 = new ToolRequest("call_1", "search", { query: "test" });
            const toolRequest2 = new ToolRequest("call_2", "get_details", { id: "123" });
            const finalAgentMessage = new AgentMessage("Here's the complete information.");

            const tools = [searchTool, getDetailsTool];

            // First invocation: model requests first tool
            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools(tools)
                    .userSends([userMessage])
                    .respondWith([toolRequest1]),
            );

            // Second invocation: model requests second tool after first tool response
            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools(tools)
                    .userSends([
                        userMessage,
                        toolRequest1,
                        new ToolResponse("call_1", "search", { results: ["Results for: test"] }),
                    ])
                    .respondWith([toolRequest2]),
            );

            // Third invocation: model responds after second tool execution
            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools(tools)
                    .userSends([
                        userMessage,
                        toolRequest1,
                        new ToolResponse("call_1", "search", { results: ["Results for: test"] }),
                        toolRequest2,
                        new ToolResponse("call_2", "get_details", { details: "Details for ID: 123" }),
                    ])
                    .respondWith([finalAgentMessage]),
            );

            const agent = new ReActAgent(model, tools);
            const response = await agent.invoke([userMessage]);

            expect(response.messages).toHaveLength(1);
            expect(response.messages[0]).toBeInstanceOf(AgentMessage);
            expect((response.messages[0] as AgentMessage).text).toBe("Here's the complete information.");
        });

        it("should handle multiple parallel tool requests", async () => {
            const model = new TestModel({});

            const weatherTool = tool(
                defineTool(
                    "get_weather",
                    "Get weather information",
                    z.object({ city: z.string() }),
                ),
                async (input) => {
                    return { temperature: 72, condition: "Sunny" };
                },
            );

            const timeTool = tool(
                defineTool(
                    "get_time",
                    "Get current time",
                    z.object({ timezone: z.string() }),
                ),
                async (input) => {
                    return { time: "10:30 AM" };
                },
            );

            const userMessage = new UserMessage("What's the weather and time?");
            const toolRequest1 = new ToolRequest("call_1", "get_weather", { city: "New York" });
            const toolRequest2 = new ToolRequest("call_2", "get_time", { timezone: "America/New_York" });
            const finalAgentMessage = new AgentMessage("Weather: 72°F Sunny. Time: 10:30 AM.");

            const tools = [weatherTool, timeTool];

            // First invocation: model requests both tools in parallel
            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools(tools)
                    .userSends([userMessage])
                    .respondWith([toolRequest1, toolRequest2]),
            );

            // Second invocation: model responds after both tools execute
            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools(tools)
                    .userSends([
                        userMessage,
                        toolRequest1,
                        toolRequest2,
                        new ToolResponse("call_1", "get_weather", { temperature: 72, condition: "Sunny" }),
                        new ToolResponse("call_2", "get_time", { time: "10:30 AM" }),
                    ])
                    .respondWith([finalAgentMessage]),
            );

            const agent = new ReActAgent(model, tools);
            const response = await agent.invoke([userMessage]);

            expect(response.messages).toHaveLength(1);
            expect(response.messages[0]).toBeInstanceOf(AgentMessage);
            expect((response.messages[0] as AgentMessage).text).toBe("Weather: 72°F Sunny. Time: 10:30 AM.");
        });

        it("should handle complex multi-turn conversation with tools", async () => {
            const model = new TestModel({});

            const searchTool = tool(
                defineTool(
                    "search",
                    "Search for information",
                    z.object({ query: z.string() }),
                ),
                async (input) => {
                    return { results: [`Found: ${input.query}`] };
                },
            );

            const userMessage = new UserMessage("Find information about AI");
            const toolRequest1 = new ToolRequest("call_1", "search", { query: "AI" });
            const intermediateAgentMessage = new AgentMessage("I found some information. Let me search for more details.");
            const toolRequest2 = new ToolRequest("call_2", "search", { query: "AI details" });
            const finalAgentMessage = new AgentMessage("Here's comprehensive information about AI.");

            const tools = [searchTool];

            // Turn 1: Request first search
            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools(tools)
                    .userSends([userMessage])
                    .respondWith([toolRequest1]),
            );

            // Turn 2: Request second search after first completes
            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools(tools)
                    .userSends([
                        userMessage,
                        toolRequest1,
                        new ToolResponse("call_1", "search", { results: ["Found: AI"] }),
                    ])
                    .respondWith([intermediateAgentMessage, toolRequest2]),
            );

            // Turn 3: Final response after second search
            model.addTestConfig(
                new TestResponseConfig()
                    .includedTools(tools)
                    .userSends([
                        userMessage,
                        toolRequest1,
                        new ToolResponse("call_1", "search", { results: ["Found: AI"] }),
                        intermediateAgentMessage,
                        toolRequest2,
                        new ToolResponse("call_2", "search", { results: ["Found: AI details"] }),
                    ])
                    .respondWith([finalAgentMessage]),
            );

            const agent = new ReActAgent(model, tools);
            const response = await agent.invoke([userMessage]);

            expect(response.messages).toHaveLength(1);
            expect(response.messages[0]).toBeInstanceOf(AgentMessage);
            expect((response.messages[0] as AgentMessage).text).toBe("Here's comprehensive information about AI.");
        });
    });
});

