import {
    BaseModel,
    type BaseModelConfig,
    InvokeResponse,
    InvokeResponseAgentMessage,
    InvokeResponseStopReason,
    InvokeResponseToolRequest,
    InvokeResponseType,
    InvokeResponseUsage,
    ToolDefinition,
} from "./BaseModel";
import {
    BedrockRuntimeClient,
    BedrockRuntimeClientConfig,
    ConversationRole,
    ConverseCommand,
    ConverseCommandOutput,
    InferenceConfiguration,
    Message,
    StopReason,
    SystemContentBlock,
    Tool,
    ToolConfiguration,
    ToolResultStatus,
} from "@aws-sdk/client-bedrock-runtime";
import {
    AgentMessage,
    BaseMessage,
    MessageRole,
    ToolError,
    ToolRequest,
    ToolResponse,
    ToolUse,
} from "../messages";
import * as z from "zod";

export type BedrockModelConfig = BaseModelConfig & {
    modelId: string;
    aws?: BedrockRuntimeClientConfig;
};

export class BedrockModel extends BaseModel {
    private modelId: string;
    private client: BedrockRuntimeClient;

    constructor(config: BedrockModelConfig) {
        super(config);
        this.modelId = config.modelId;
        this.client = new BedrockRuntimeClient(config.aws ?? {});
    }

    private convertMessagesToBedrockMessages(
        messages: (BaseMessage | ToolUse)[],
    ): Message[] {
        const bedrockMessages: Message[] = [];
        for (const message of messages) {
            if (message instanceof BaseMessage) {
                const role = message.role;
                if (role === MessageRole.SYSTEM && !this.systemMessage) {
                    this.systemMessage = message.content;
                } else {
                    bedrockMessages.push({
                        role: role === MessageRole.USER
                            ? ConversationRole.USER
                            : ConversationRole.ASSISTANT,
                        content: [
                            {
                                text: message.content.toString(),
                            },
                        ],
                    });
                }
            }
            if (message instanceof ToolUse) {
                if (message instanceof ToolRequest) {
                    bedrockMessages.push({
                        role: ConversationRole.ASSISTANT,
                        content: [
                            {
                                toolUse: {
                                    toolUseId: message.toolUseId,
                                    name: message.toolName,
                                    input: message.input,
                                },
                            },
                        ],
                    });
                }
                if (message instanceof ToolResponse) {
                    bedrockMessages.push({
                        role: ConversationRole.USER,
                        content: [
                            {
                                toolResult: {
                                    toolUseId: message.toolUseId,
                                    content: [
                                        {
                                            json: message.output,
                                        },
                                    ],
                                },
                            },
                        ],
                    });
                }
                if (message instanceof ToolError) {
                    bedrockMessages.push({
                        role: ConversationRole.USER,
                        content: [
                            {
                                toolResult: {
                                    toolUseId: message.toolUseId,
                                    content: [
                                        {
                                            text: message.error,
                                        },
                                    ],
                                    status: ToolResultStatus.ERROR,
                                },
                            },
                        ],
                    });
                }
            }
        }
        return bedrockMessages;
    }

    private convertToolDefinitionToBedrockTool(tool: ToolDefinition): Tool {
        return {
            toolSpec: {
                name: tool.name,
                description: tool.description,
                inputSchema: {
                    json: z.toJSONSchema(tool.schema) as any,
                },
            },
        };
    }

    private getBedrockToolConfig(): ToolConfiguration {
        if (this.structuredOutput) {
            return {
                tools: [
                    {
                        toolSpec: {
                            name: "output",
                            description: "Expected output from the model",
                            inputSchema: {
                                json: z.toJSONSchema(
                                    this.structuredOutput,
                                ) as any,
                            },
                        },
                    },
                ],
                toolChoice: {
                    tool: { name: "output" },
                },
            };
        }
        return {
            tools: this.tools.map((tool) =>
                this.convertToolDefinitionToBedrockTool(tool)
            ),
        };
    }

    private mapStopReason(
        response: ConverseCommandOutput,
    ): InvokeResponseStopReason {
        switch (response.stopReason) {
            case StopReason.STOP_SEQUENCE:
                return InvokeResponseStopReason.STOP_SEQUENCE;
            case StopReason.MAX_TOKENS:
                return InvokeResponseStopReason.MAX_TOKENS;
            case StopReason.END_TURN:
                return InvokeResponseStopReason.END_TURN;
            case StopReason.TOOL_USE:
                return InvokeResponseStopReason.TOOL_USE;
            default:
                return InvokeResponseStopReason.UNKNOWN;
        }
    }

    private getInferenceConfigChunk(): {
        inferenceConfig?: InferenceConfiguration;
    } {
        const inferenceConfig: InferenceConfiguration = {
            ...(this.temperature ? { temperature: this.temperature } : {}),
            ...(this.topP ? { topP: this.topP } : {}),
            ...(this.maxTokens ? { maxTokens: this.maxTokens } : {}),
        };
        if (Object.keys(inferenceConfig).length > 0) {
            return { inferenceConfig };
        }
        return {};
    }

    private getSystemMessageChunk(): { system?: SystemContentBlock[] } {
        if (this.systemMessage) {
            return {
                system: [
                    {
                        text: this.systemMessage.toString(),
                    },
                    ...(this.structuredOutput
                        ? [
                            {
                                text:
                                    "IMPORTANT: ONLY call the output tool. No other messages!",
                            },
                        ]
                        : []),
                ],
            };
        } else if (this.structuredOutput) {
            return {
                system: [
                    {
                        text:
                            "IMPORTANT: ONLY call the output tool. No other messages!",
                    },
                ],
            };
        }
        return {};
    }

    private getToolConfigChunk(): { toolConfig?: ToolConfiguration } {
        const toolConfig = this.getBedrockToolConfig();
        if (toolConfig.tools && toolConfig.tools.length > 0) {
            return {
                toolConfig,
            };
        }
        return {};
    }

    async invoke(
        inputMessages: (BaseMessage | ToolUse)[],
    ): Promise<InvokeResponse> {
        const bedrockMessages = this.convertMessagesToBedrockMessages(
            inputMessages,
        );

        const command = new ConverseCommand({
            modelId: this.modelId,
            ...this.getInferenceConfigChunk(),
            messages: bedrockMessages,
            ...this.getSystemMessageChunk(),
            ...this.getToolConfigChunk(),
        });

        const response = await this.client.send(command);

        const message = response.output?.message;
        const usage: InvokeResponseUsage = {
            inputTokens: response.usage?.inputTokens ?? 0,
            outputTokens: response.usage?.outputTokens ?? 0,
        };
        const stopReason = this.mapStopReason(response);
        if (!message || !message.content) {
            return {
                messages: [],
                usage,
                stopReason,
            };
        }

        const messages:
            (InvokeResponseAgentMessage | InvokeResponseToolRequest)[] = [];
        for (const block of message.content) {
            if ("text" in block) {
                messages.push({
                    type: InvokeResponseType.AGENT_MESSAGE,
                    message: new AgentMessage(block.text),
                });
            } else if ("toolUse" in block) {
                messages.push({
                    type: InvokeResponseType.TOOL_REQUEST,
                    request: new ToolRequest(
                        block.toolUse.toolUseId!,
                        block.toolUse.name!,
                        block.toolUse.input as object,
                    ),
                });
            } else {
                console.warn("Unknown block type", block);
            }
        }

        return {
            messages,
            usage,
            stopReason,
        };
    }
}
