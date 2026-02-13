import { AgentMessage, ModelMessages, SystemMessage, ToolRequest } from "../messages";
import { BaseModel, InvokeResponse, StructuredOutputWrapper } from "../models/BaseModel";
import { NodeLike } from "./types";
import { ContextLayer } from "../graphs/runtime-context";
import { TypedKeys } from "../types";
import { z } from "zod";
import { ToolDefinition } from "../tools";

/**
 * Type guard to check if a value is a function that returns messages.
 * 
 * @private
 * @param {any} value - Value to check
 * @returns {boolean} True if value is a messages-returning function
 */
function isMessagesConstructed<T extends Record<string, unknown>>(value: any): value is (state: T, context: ContextLayer) => ModelMessages[] {
    return typeof value === "function";
}

/**
 * Type guard to check if a value is a function that constructs output from the model response.
 * 
 * @private
 * @param {any} value - Value to check
 * @returns {boolean} True if value is an output-constructing function
 */
function isOutputConstructed<T extends Record<string, unknown>>(value: any): value is (response: InvokeResponse, state: T, context: ContextLayer) => Partial<T> {
    return typeof value === "function";
}

/**
 * Type guard to check if a value is a function that dynamically generates a system message.
 * 
 * @private
 * @param {any} value - Value to check
 * @returns {boolean} True if value is a system message function
 */
function isSystemMessageDynamic<T extends Record<string, unknown>>(value: any): value is (state: T, context: ContextLayer) => SystemMessage {
    return typeof value === "function";
}

/**
 * Type guard to check if a value is a function that dynamically generates tool definitions.
 * 
 * @private
 * @param {any} value - Value to check
 * @returns {boolean} True if value is a tools function
 */
function isToolsDynamic<T extends Record<string, unknown>>(value: any): value is (state: T, context: ContextLayer) => ToolDefinition[] {
    return typeof value === "function";
}

/**
 * Helper type to extract keys from an object that have ModelMessages[] values.
 * 
 * @private
 */
type InputMessagesKeys<T> = TypedKeys<T, ModelMessages[]>;

/**
 * Helper type to extract keys from an object that have (AgentMessage | ToolRequest)[] values.
 * 
 * @private
 */
type OutputMessagesKeys<T> = TypedKeys<T, (AgentMessage | ToolRequest)[]>;

/**
 * Configuration for selecting messages from state by key.
 * 
 * @interface MessageSelected
 * @template T - The state type
 */
interface MessageSelected<T> {
    /** Key in state containing the messages array */
    messages: InputMessagesKeys<T>;
}

/**
 * Configuration for constructing messages dynamically from state and context.
 * 
 * @interface MessageConstructed
 * @template T - The state type
 */
interface MessageConstructed<T> {
    /** Function that generates messages from current state and context */
    messages: (state: T, context: ContextLayer) => ModelMessages[];
}

/**
 * Union type for message configuration - either selected from state or constructed dynamically.
 * 
 * @typedef {MessageSelected<T> | MessageConstructed<T>} MessageConfig
 * @template T - The state type
 */
type MessageConfig<T> = MessageSelected<T> | MessageConstructed<T>;

/**
 * Configuration for selecting output location from state by key.
 * 
 * @interface OutputSelected
 * @template T - The state type
 * @template M - The model type (BaseModel or StructuredOutputWrapper)
 */
interface OutputSelected<T, M extends BaseModel | StructuredOutputWrapper<any>> {
    /** 
     * Key in state where output should be stored.
     * For StructuredOutputWrapper: any key in state.
     * For BaseModel: key that contains (AgentMessage | ToolRequest)[] array.
     */
    output: M extends StructuredOutputWrapper<any> ? keyof T : OutputMessagesKeys<T>;
}

/**
 * Configuration for constructing output dynamically from model response.
 * 
 * @interface OutputConstructed
 * @template T - The state type
 * @template M - The model type (BaseModel or StructuredOutputWrapper)
 */
interface OutputConstructed<T, M extends BaseModel | StructuredOutputWrapper<any>> {
    /** 
     * Function that transforms model response into partial state update.
     * For StructuredOutputWrapper: receives the structured output directly.
     * For BaseModel: receives InvokeResponse with messages array.
     */
    output: (response: M extends StructuredOutputWrapper<any> ? any : InvokeResponse, state: T, context: ContextLayer) => Partial<T>;
}

/**
 * Union type for output configuration - either selected key or constructed dynamically.
 * 
 * @typedef {OutputSelected<T, M> | OutputConstructed<T, M>} OutputConfig
 * @template T - The state type
 * @template M - The model type (BaseModel or StructuredOutputWrapper)
 */
type OutputConfig<T, M extends BaseModel | StructuredOutputWrapper<any>> = OutputSelected<T, M> | OutputConstructed<T, M>;

/**
 * Configuration for a static system message.
 * 
 * @interface SystemMessageStatic
 */
interface SystemMessageStatic {
    /** Static system message to use for all invocations */
    systemMessage: SystemMessage;
}

/**
 * Configuration for a dynamically generated system message.
 * 
 * @interface SystemMessageDynamic
 * @template T - The state type
 */
interface SystemMessageDynamic<T> {
    /** Function that generates system message from current state and context */
    systemMessage: (state: T, context: ContextLayer) => SystemMessage;
}

/**
 * Union type for system message configuration - either static or dynamic.
 * 
 * @typedef {SystemMessageStatic | SystemMessageDynamic<T>} SystemMessageConfig
 * @template T - The state type
 */
type SystemMessageConfig<T> = SystemMessageStatic | SystemMessageDynamic<T>;

/**
 * Configuration for static tool definitions.
 * 
 * @interface ToolsStatic
 */
interface ToolsStatic {
    /** Array of tool definitions to use for all invocations */
    tools: ToolDefinition[];
}

/**
 * Configuration for dynamically generated tool definitions.
 * 
 * @interface ToolsDynamic
 * @template T - The state type
 */
interface ToolsDynamic<T> {
    /** Function that generates tool definitions from current state and context */
    tools: (state: T, context: ContextLayer) => ToolDefinition[];
}

/**
 * Union type for tools configuration - either static or dynamic.
 * 
 * @typedef {ToolsStatic | ToolsDynamic<T>} ToolsConfig
 * @template T - The state type
 */
type ToolsConfig<T> = ToolsStatic | ToolsDynamic<T>;

/**
 * Configuration object for ModelNode.
 * 
 * @typedef {Object} ModelNodeConfig
 * @template T - The state type
 * @template M - The model type (BaseModel or StructuredOutputWrapper)
 * 
 * @property {MessageConfig<T>} messages - Configuration for message source (key or function)
 * @property {OutputConfig<T, M>} output - Configuration for output destination (key or function)
 * @property {SystemMessageConfig<T>} [systemMessage] - Optional system message (static or dynamic)
 * @property {ToolsConfig<T>} [tools] - Optional tool definitions (static or dynamic). Ignored when using StructuredOutputWrapper.
 * 
 * @example
 * ```typescript
 * // Static configuration
 * const config: ModelNodeConfig<MyState, BaseModel> = {
 *   messages: "conversationHistory",
 *   output: "modelResponse",
 *   systemMessage: new SystemMessage("You are helpful"),
 *   tools: [searchTool, calculatorTool]
 * };
 * 
 * // Dynamic configuration
 * const dynamicConfig: ModelNodeConfig<MyState, BaseModel> = {
 *   messages: (state, context) => state.messages.filter(m => m.role === "user"),
 *   output: (response, state, context) => ({
 *     modelResponse: response.messages,
 *     tokenUsage: response.usage
 *   }),
 *   systemMessage: (state, context) => new SystemMessage(`Context: ${state.context}`),
 *   tools: (state, context) => state.availableTools
 * };
 * ```
 */
export type ModelNodeConfig<T extends Record<string, unknown>, M extends BaseModel | StructuredOutputWrapper<any>> =
    OutputConfig<T, M>
    & MessageConfig<T>
    & Partial<
        SystemMessageConfig<T>
        & ToolsConfig<T>
    >;

/**
 * A node that invokes an AI model and stores the response in the state.
 * 
 * ModelNode provides flexible configuration for:
 * - Message sources: read from state or construct dynamically
 * - Output handling: store in state key or transform via function
 * - System messages: static or dynamic based on state/context
 * - Tool definitions: static or dynamic (ignored for StructuredOutputWrapper)
 * 
 * Supports both regular BaseModel instances (returns messages) and StructuredOutputWrapper
 * instances (returns structured data matching a Zod schema).
 * 
 * @class ModelNode
 * @template T - The state type
 * @template M - The model type (BaseModel or StructuredOutputWrapper), defaults to BaseModel
 * @implements {NodeLike<T>}
 * 
 * @example
 * ```typescript
 * // Basic usage with messages from state
 * const node = new ModelNode(model, {
 *   messages: "conversationMessages",
 *   output: "modelResponse"
 * });
 * 
 * // Dynamic message construction
 * const node = new ModelNode(model, {
 *   messages: (state, context) => [new UserMessage(state.input)],
 *   output: "modelResponse"
 * });
 * 
 * // With structured output
 * const structuredModel = model.withStructuredOutput(z.object({
 *   name: z.string(),
 *   age: z.number()
 * }));
 * const node = new ModelNode(structuredModel, {
 *   messages: "userInput",
 *   output: "extractedData"
 * });
 * 
 * // Dynamic output transformation
 * const node = new ModelNode(model, {
 *   messages: "messages",
 *   output: (response, state, context) => ({
 *     modelResponse: response.messages,
 *     tokenUsage: response.usage,
 *     timestamp: Date.now()
 *   })
 * });
 * ```
 */
export class ModelNode<T extends Record<string, unknown>, M extends BaseModel | StructuredOutputWrapper<any> = BaseModel> implements NodeLike<T> {
    /**
     * Creates a new model node.
     * 
     * @param {M} model - The model to invoke (BaseModel or StructuredOutputWrapper)
     * @param {ModelNodeConfig<T, M>} config - Configuration for messages, output, system message, and tools
     */
    constructor(
        private readonly model: M,
        private readonly config: ModelNodeConfig<T, M>,
    ) { }

    /**
     * Runs the model with configured messages and stores the response in state.
     * 
     * Execution flow:
     * 1. Resolves messages from config (state key or function)
     * 2. Applies system message if configured (static or dynamic)
     * 3. Applies tools if configured and model is not StructuredOutputWrapper (static or dynamic)
     * 4. Invokes the model with resolved messages
     * 5. Transforms response based on output config (state key or function)
     * 
     * For StructuredOutputWrapper: the response is the structured data directly.
     * For BaseModel: the response contains messages array and usage information.
     * 
     * @param {T} state - The current state
     * @param {ContextLayer} context - The execution context
     * @returns {Promise<Partial<T>>} Partial state update containing the model's response
     * @throws {Error} If messages key is specified but not found in state, or if the value is not an array
     */
    async run(state: T, context: ContextLayer): Promise<Partial<T>> {
        const { messages, output, systemMessage, tools } = this.config;

        let inMessages: ModelMessages[] = [];
        if (isMessagesConstructed(messages)) {
            inMessages = messages(state, context);
        } else {
            const stateMessages = state[messages as keyof T];
            if (!stateMessages || !Array.isArray(stateMessages)) {
                throw new Error(`No Messages array found for key ${messages as string}`);
            }
            inMessages = stateMessages as ModelMessages[];
        }

        if (systemMessage) {
            let inSystemMessage: SystemMessage;
            if (isSystemMessageDynamic(systemMessage)) {
                inSystemMessage = systemMessage(state, context);
            } else {
                inSystemMessage = systemMessage as SystemMessage;
            }
            this.model.withSystemMessage(inSystemMessage);
        }

        if (tools && !(this.model instanceof StructuredOutputWrapper)) {
            let inTools: ToolDefinition[];
            if (isToolsDynamic(tools)) {
                inTools = tools(state, context);
            } else {
                inTools = tools as ToolDefinition[];
            }
            this.model.withTools(inTools);
        }

        if (this.model instanceof StructuredOutputWrapper) {
            const structuredOutput = await this.model.invoke(inMessages);
            if (isOutputConstructed(output)) {
                return output(structuredOutput, state, context) as Partial<T>;
            } else {
                return { [output as keyof T]: structuredOutput } as Partial<T>;
            }
        }
        const response = await this.model.invoke(inMessages);
        if (isOutputConstructed(output)) {
            return output(response, state, context) as Partial<T>;
        } else {
            return { [output as keyof T]: response.messages } as Partial<T>;
        }
    }
}
