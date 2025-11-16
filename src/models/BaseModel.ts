import * as z from "zod";
import {
    AgentMessage,
    BaseMessage,
    MessageContent,
    SystemMessage,
    ToolRequest,
    ToolUse,
} from "../messages";

export interface ToolDefinition {
    name: string;
    description?: string;
    schema: z.ZodObject<any>;
}

export interface BaseModelConfig {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
}

export enum InvokeResponseType {
    AGENT_MESSAGE = "agent_message",
    TOOL_REQUEST = "tool_request",
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

export interface InvokeResponseAgentMessage {
    type: InvokeResponseType.AGENT_MESSAGE;
    message: AgentMessage;
}

export interface InvokeResponseToolRequest {
    type: InvokeResponseType.TOOL_REQUEST;
    request: ToolRequest;
}

export interface InvokeResponse {
    messages: (InvokeResponseAgentMessage | InvokeResponseToolRequest)[];
    usage: InvokeResponseUsage;
    stopReason?: InvokeResponseStopReason;
}

export abstract class BaseModel {
    protected temperature?: number;
    protected topP?: number;
    protected maxTokens?: number;

    protected systemMessage?: MessageContent;
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
        this.systemMessage = message instanceof SystemMessage
            ? message.content
            : message;
        return this;
    }

    withTools(tools: ToolDefinition[]): this {
        if (this.structuredOutput) {
            throw new Error("Cannot set tools with structured output");
        }
        this.tools = tools;
        return this;
    }

    withStructuredOutput<T>(
        schema: z.ZodSchema<T>,
    ): StructuredOutputWrapper<T> {
        this.tools = [];
        this.structuredOutput = schema;
        return new StructuredOutputWrapper<T>(this);
    }

    abstract invoke(
        messages: (BaseMessage | ToolUse)[],
    ): Promise<InvokeResponse>;
}

export class ResponseNotStructuredOutputError extends Error {
    constructor() {
        super("Response is not structured output");
        this.name = "ResponseNotStructuredOutputError";
    }
}

export class StructuredOutputWrapper<T> {
    constructor(private readonly model: BaseModel) {}

    withSystemMessage(message: SystemMessage | MessageContent): this {
        this.model.withSystemMessage(message);
        return this;
    }

    withTools(tools: ToolDefinition[]): this {
        this.model.withTools(tools);
        return this;
    }

    async invoke(messages: (BaseMessage | ToolUse)[]): Promise<T> {
        const response = await this.model.invoke(messages);
        if (!response.messages.length) {
            throw new ResponseNotStructuredOutputError();
        }
        if (response.messages[0]?.type !== InvokeResponseType.TOOL_REQUEST) {
            throw new ResponseNotStructuredOutputError();
        }
        const toolRequest = response.messages[0] as InvokeResponseToolRequest;
        return toolRequest.request.input as T;
    }
}
