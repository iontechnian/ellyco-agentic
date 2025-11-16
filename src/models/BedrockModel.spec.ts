import { beforeEach, describe, expect, it } from "vitest";
import { BedrockModel } from "./BedrockModel";
import * as dotenv from "dotenv";
import { SystemMessage, UserMessage } from "../messages";
import {
    InvokeResponseAgentMessage,
    InvokeResponseToolRequest,
    InvokeResponseType,
    ToolDefinition,
} from "./BaseModel";
import * as z from "zod";

dotenv.config({ path: ".env.test" });

const createModel = (modelId: string) =>
    new BedrockModel({
        modelId,
        maxTokens: 200,
        temperature: 0,
        aws: {
            region: "us-east-1",
            credentials: {
                accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY!,
                secretAccessKey: process.env.BEDROCK_AWS_SECRET_KEY!,
            },
        },
    });

describe("BedrockModel", () => {
    it.skip("should response with an AgentMessage", async () => {
        const model = createModel("amazon.nova-micro-v1:0");
        const userMessage = new UserMessage("Hello, how are you?");
        const response = await model.invoke([userMessage]);
        expect(response.messages.length).toBeGreaterThanOrEqual(1);
        expect(response.messages[0].type).toBe(
            InvokeResponseType.AGENT_MESSAGE,
        );
        console.log(
            (response.messages[0] as InvokeResponseAgentMessage).message
                .toString(),
        );
    });

    it.skip("should call a tool", async () => {
        const model = createModel("amazon.nova-micro-v1:0");
        const userMessage = new UserMessage("What is the weather in Tokyo?");
        const tool: ToolDefinition = {
            name: "get_weather",
            description: "Get the weather in a given city",
            schema: z.object({
                city: z.string().describe("The city to get the weather for"),
            }),
        };
        model.withTools([tool]);
        const response = await model.invoke([userMessage]);
        expect(response.messages.length).toBeGreaterThanOrEqual(1);

        const toolRequest = response.messages.find((message) =>
            message.type === InvokeResponseType.TOOL_REQUEST
        ) as InvokeResponseToolRequest;

        expect(toolRequest.request.toolName).toBe(tool.name);
        expect(toolRequest.request.input).toStrictEqual({ city: "Tokyo" });
        console.log(toolRequest);
    });

    it.skip("should respond with a structured output", async () => {
        const model = createModel("amazon.nova-micro-v1:0");
        const userMessage = new UserMessage("I want to visit Tokyo and Osaka");
        const response = await model.withStructuredOutput(
            z.object({
                cities: z.array(z.string()).describe(
                    "The cities mentioned in the user's message",
                ),
            }),
        ).invoke([userMessage]);

        // -- THIS IS IF YOU RUN INVOKE SEPARATELY FROM WITHSTRUCTUROUTPUT
        // expect(response.messages.length).toBeGreaterThanOrEqual(1);
        // expect(response.messages[0].type).toBe(
        //     InvokeResponseType.TOOL_REQUEST,
        // );
        // expect(
        //     (response.messages[0] as InvokeResponseToolRequest).request
        //         .toolName,
        // ).toBe("output");
        // expect(
        //     (response.messages[0] as InvokeResponseToolRequest).request.input,
        // ).toStrictEqual({ cities: ["Tokyo", "Osaka"] });

        // console.log(
        //     (response.messages[0] as InvokeResponseToolRequest).request.input
        //         .toString(),
        // );

        expect(response).toStrictEqual({ cities: ["Tokyo", "Osaka"] });
        console.log(response.toString());
    });
});
