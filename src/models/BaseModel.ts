import * as z from "zod";
import {
    AgentMessage,
    BaseMessage,
    MessageContent,
    ModelMessages,
    SystemMessage,
    ToolRequest,
} from "../messages";
import { ToolDefinition } from "../tools";

export interface BaseModelConfig {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
}

export interface InvokeResponseUsage {
    inputTokens: number;
    outputTokens: number;
}

export enum InvokeResponseStopReason {
    UNKNOWN = "unknown",
    STOP_SEQUENCE = "stop_sequence",
    MAX_TOKENS = "max_tokens",
    END_TURN = "end_turn",
    TOOL_USE = "tool_use",
}

export interface InvokeResponse {
    messages: (AgentMessage | ToolRequest)[];
    usage: InvokeResponseUsage;
    stopReason?: InvokeResponseStopReason;
}

export abstract class BaseModel {
    protected temperature?: number;
    protected topP?: number;
    protected maxTokens?: number;

    protected systemMessage?: SystemMessage;
    protected tools: ToolDefinition[] = [];
    protected structuredOutput?: z.ZodSchema<any>;

    constructor(config: BaseModelConfig) {
        if (config.temperature) {
            this.temperature = Math.max(0, Math.min(1, config.temperature));
        }
        if (config.topP) {
            this.topP = Math.max(0, Math.min(1, config.topP));
        }
        if (config.maxTokens) {
            this.maxTokens = Math.max(0, config.maxTokens);
        }
    }

    withSystemMessage(message: SystemMessage | MessageContent): this {
        if (message instanceof SystemMessage) {
            this.systemMessage = message;
        } else {
            this.systemMessage = new SystemMessage(message);
        }
        return this;
    }

    withTools(tools: ToolDefinition[]): this {
        if (this.structuredOutput) {
            throw new Error("Cannot set tools with structured output");
        }
        this.tools = tools;
        return this;
    }

    withStructuredOutput<T extends z.ZodObject>(
        schema: T,
    ): StructuredOutputWrapper<T> {
        this.tools = [];
        this.structuredOutput = schema;
        return new StructuredOutputWrapper<T>(this, schema);
    }

    protected abstract runModel(
        messages: ModelMessages[],
    ): Promise<InvokeResponse>;

    async invoke(
        messages: ModelMessages[],
        properties?: Record<string, any>,
    ): Promise<InvokeResponse> {
        if (!properties) {
            return this.runModel(messages);
        }
        return this.runModel(messages.map((message) => {
            if (message instanceof BaseMessage) {
                message.interpolate(properties);
            }
            return message;
        }));
    }
}

export class ResponseNotStructuredOutputError extends Error {
    constructor() {
        super("Response is not structured output");
        this.name = "ResponseNotStructuredOutputError";
    }
}

export class StructuredOutputWrapper<T extends z.ZodObject> {
    constructor(private readonly model: BaseModel, private readonly schema: T) { }

    withSystemMessage(message: SystemMessage | MessageContent): this {
        this.model.withSystemMessage(message);
        return this;
    }

    async invoke(
        messages: ModelMessages[],
        properties?: Record<string, any>,
    ): Promise<z.infer<T>> {
        const response = await this.model.invoke(messages, properties);
        if (!response.messages.length) {
            throw new ResponseNotStructuredOutputError();
        }
        if (!(response.messages[0] instanceof ToolRequest)) {
            throw new ResponseNotStructuredOutputError();
        }
        const toolRequest = response.messages[0] as ToolRequest;
        return this.schema.parse(toolRequest.input);
    }
}
