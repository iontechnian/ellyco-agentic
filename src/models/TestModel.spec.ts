import { describe, expect, it } from "vitest";
import { TestModel, TestResponseConfig } from "./TestModel";
import { AgentMessage, ToolRequest, UserMessage } from "../messages";
import { ToolDefinition } from "../tools";
import * as z from "zod";

describe("TestModel", () => {
    it("handles a simple 'if user says this, respond with this' config", async () => {
        const model = new TestModel({});
        const userMessage = new UserMessage("Hi");
        const agentMessage = new AgentMessage("Hello, how are you?");
        model.addTestConfig(
            new TestResponseConfig().userSends([userMessage]).respondWith([agentMessage]),
        );
        const response = await model.invoke([userMessage]);
        expect(response.messages).toStrictEqual([agentMessage]);
    });

    it("handles tool calling given a certain input", async () => {
        const model = new TestModel({});
        const tool: ToolDefinition = {
            name: "get_weather",
            description: "Get the weather in a given city",
            schema: z.object({
                city: z.string().describe("The city to get the weather for"),
            }),
        };
        const userMessage = new UserMessage("What is the weather in Tokyo?");
        const toolRequest = new ToolRequest("1", "get_weather", {
            city: "Tokyo",
        });

        model.addTestConfig(
            new TestResponseConfig().includedTools([tool]).userSends([
                userMessage,
            ]).respondWith([toolRequest]),
        );
        model.withTools([tool]);
        const response = await model.invoke([userMessage]);
        expect(response.messages).toStrictEqual([toolRequest]);
    });

    it("handles input with interpolation", async () => {
        const model = new TestModel({});
        const userMessage = new UserMessage("What is the weather in {city}?");
        const expectedUserMessage = new UserMessage(
            "What is the weather in London?",
        );
        const expectedToolRequest = new ToolRequest("1", "get_weather", {
            city: "London",
        });
        model.addTestConfig(
            new TestResponseConfig().userSends([expectedUserMessage])
                .respondWith([expectedToolRequest]),
        );
        const response = await model.invoke([userMessage], { city: "London" });
        expect(response.messages).toStrictEqual([expectedToolRequest]);
    });
});
