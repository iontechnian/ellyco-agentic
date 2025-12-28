import {
    BaseModel,
    type BaseModelConfig,
    InvokeResponse,
    InvokeResponseStopReason,
    InvokeResponseUsage,
} from "./BaseModel";
import {
    BedrockRuntimeClient,
    BedrockRuntimeClientConfig,
    ContentBlock,
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
    ModelMessages,
    ToolError,
    ToolRequest,
    ToolResponse,
    ToolUse,
} from "../messages";
import * as z from "zod";
import { ToolDefinition } from "../tools";

/**
 * Configuration for BedrockModel combining BaseModel config with AWS-specific settings.
 * 
 * @interface BedrockModelConfig
 * @extends {BaseModelConfig}
 * @property {string} modelId - The ID of the Bedrock model (e.g., "anthropic.claude-3-sonnet-20240229-v1:0")
 * @property {BedrockRuntimeClientConfig} [aws] - Optional AWS SDK configuration
 */
export type BedrockModelConfig = BaseModelConfig & {
    modelId: string;
    aws?: BedrockRuntimeClientConfig;
};

/**
 * Model implementation using AWS Bedrock as the backend.
 * Handles communication with Bedrock API for inference, tools, and structured output.
 * 
 * @class BedrockModel
 * @extends {BaseModel}
 * 
 * @example
 * ```typescript
 * const model = new BedrockModel({
 *   modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
 *   temperature: 0.7,
 *   maxTokens: 2048
 * });
 * 
 * model.withSystemMessage("You are a helpful assistant")
 *   .withTools([searchTool]);
 * 
 * const response = await model.invoke([userMessage]);
 * ```
 */
export class BedrockModel extends BaseModel {
    private modelId: string;
    private client: BedrockRuntimeClient;

    /**
     * Creates a new Bedrock model instance.
     * 
     * @param {BedrockModelConfig} config - Configuration including model ID and AWS settings
     */
    constructor(config: BedrockModelConfig) {
        super(config);
        this.modelId = config.modelId;
        this.client = new BedrockRuntimeClient(config.aws ?? {});
    }

    /**
     * Converts internal message format to Bedrock API message format.
     * Handles BaseMessages (user, agent, system) and ToolUse messages (requests, responses, errors).
     * 
     * @private
     * @param {ModelMessages[]} messages - Messages to convert
     * @returns {Message[]} Messages in Bedrock format
     */
    private convertMessagesToBedrockMessages(
        messages: ModelMessages[],
    ): Message[] {
        const bedrockMessages: Message[] = [];
        for (const message of messages) {
            if (message instanceof BaseMessage) {
                const role = message.role;
                if (role === MessageRole.SYSTEM && !this.systemMessage) {
                    this.systemMessage = message;
                } else {
                    bedrockMessages.push({
                        role: role === MessageRole.USER
                            ? ConversationRole.USER
                            : ConversationRole.ASSISTANT,
                        content: [
                            {
                                ...(message.hasText()
                                    ? { text: message.text }
                                    : {}) as ContentBlock,
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

    /**
     * Converts a tool definition to Bedrock tool specification format.
     * 
     * @private
     * @param {ToolDefinition} tool - The tool definition to convert
     * @returns {Tool} Bedrock formatted tool specification
     */
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

    /**
     * Builds the tool configuration for Bedrock.
     * For structured output, creates a single "output" tool that captures the schema.
     * For regular tools, converts all tool definitions.
     * 
     * @private
     * @returns {ToolConfiguration} Tool configuration for Bedrock
     */
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

    /**
     * Maps Bedrock stop reason to internal stop reason enum.
     * 
     * @private
     * @param {ConverseCommandOutput} response - The Bedrock API response
     * @returns {InvokeResponseStopReason} Mapped stop reason
     */
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

    /**
     * Builds inference configuration chunk with temperature, topP, and maxTokens if set.
     * 
     * @private
     * @returns {{inferenceConfig?: InferenceConfiguration}} Configuration chunk or empty object
     */
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

    /**
     * Builds system message chunk.
     * For structured output, adds a directive to only call the output tool.
     * 
     * @private
     * @returns {{system?: SystemContentBlock[]}} System messages or empty object
     */
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

    /**
     * Builds tool configuration chunk.
     * 
     * @private
     * @returns {{toolConfig?: ToolConfiguration}} Tool configuration or empty object
     */
    private getToolConfigChunk(): { toolConfig?: ToolConfiguration } {
        const toolConfig = this.getBedrockToolConfig();
        if (toolConfig.tools && toolConfig.tools.length > 0) {
            return {
                toolConfig,
            };
        }
        return {};
    }

    /**
     * Executes the model inference with Bedrock API.
     * Sends messages to Bedrock, processes the response, and converts it to internal format.
     * 
     * @protected
     * @param {ModelMessages[]} inputMessages - Messages to send to the model
     * @returns {Promise<InvokeResponse>} The model's response with messages and usage stats
     */
    protected async runModel(
        inputMessages: ModelMessages[],
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
            (AgentMessage | ToolRequest)[] = [];
        for (const block of message.content) {
            if ("text" in block) {
                messages.push(
                    new AgentMessage(block.text!),
                );
            } else if ("toolUse" in block) {
                messages.push(
                    new ToolRequest(
                        block.toolUse!.toolUseId!,
                        block.toolUse!.name!,
                        block.toolUse!.input as any,
                    ),
                );
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
