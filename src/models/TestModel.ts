import { ToolDefinition } from "../tools";
import {
    BaseModel,
    BaseModelConfig,
    InvokeResponse,
    InvokeResponseStopReason,
} from "./BaseModel";
import * as z from "zod";
import { AgentMessage, ModelMessages, ToolRequest } from "../messages";

export class TestResponseConfig {
    toolsIncluded: ToolDefinition[] = [];
    responseMessages:
        (AgentMessage | ToolRequest)[] = [];
    inputMessages: ModelMessages[] = [];
    structuredOutput?: z.ZodSchema<any>;

    respondWith(
        messages: (AgentMessage | ToolRequest)[],
    ): this {
        this.responseMessages = messages;
        return this;
    }

    includedTools(tools: ToolDefinition[]): this {
        this.toolsIncluded = tools;
        return this;
    }

    providedStructuredOutput(schema: z.ZodSchema<any>): this {
        this.structuredOutput = schema;
        return this;
    }

    userSends(messages: ModelMessages[]): this {
        this.inputMessages = messages;
        return this;
    }
}

/**
 * This model is used for tests. It allows specifying responses to messages based on how the model is configured and invoked.
 */
export class TestModel extends BaseModel {
    testConfigs: TestResponseConfig[] = [];

    constructor(config: BaseModelConfig) {
        super(config);
    }

    addTestConfig(config: TestResponseConfig): this {
        this.testConfigs.push(config);
        return this;
    }

    findMatchingConfig(
        messages: ModelMessages[],
    ): TestResponseConfig | undefined {
        const messagesSig = messages.map((message) => message.toJSON()).join(
            "\n",
        );
        for (const config of this.testConfigs) {
            const configMsgSig = config.inputMessages.map((message) =>
                message.toJSON()
            ).join("\n");
            if (messagesSig !== configMsgSig) continue;
            if (config.structuredOutput) {
                if (!this.structuredOutput) continue;
                if (
                    JSON.stringify(z.toJSONSchema(config.structuredOutput)) ===
                    JSON.stringify(z.toJSONSchema(this.structuredOutput))
                ) {
                    return config;
                }
            } else {
                const configToolNames = config.toolsIncluded.map((tool) =>
                    tool.name
                );
                const modelToolNames = this.tools.map((tool) => tool.name);
                if (
                    configToolNames.every((name) =>
                        modelToolNames.includes(name)
                    )
                ) {
                    return config;
                }
            }
        }
        return undefined;
    }

    protected runModel(
        messages: ModelMessages[],
    ): Promise<InvokeResponse> {
        const matchingConfig = this.findMatchingConfig(messages);
        if (!matchingConfig) {
            throw new Error("No matching test config found");
        }
        return Promise.resolve({
            messages: matchingConfig.responseMessages,
            usage: {
                inputTokens: 0,
                outputTokens: 0,
            },
            stopReason: InvokeResponseStopReason.UNKNOWN,
        });
    }
}
