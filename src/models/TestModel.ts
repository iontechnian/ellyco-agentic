import { ToolDefinition } from "../tools";
import {
    BaseModel,
    BaseModelConfig,
    InvokeResponse,
    InvokeResponseStopReason,
} from "./BaseModel";
import * as z from "zod";
import { AgentMessage, ModelMessages, ToolRequest } from "../messages";

/**
 * Configuration for test model responses.
 * Allows specifying what the model should respond with for specific inputs.
 * 
 * @class TestResponseConfig
 * 
 * @example
 * ```typescript
 * const config = new TestResponseConfig()
 *   .userSends([userMessage])
 *   .respondWith([agentMessage]);
 * ```
 */
export class TestResponseConfig {
    /**
     * Tools that should be available when matching this config
     */
    toolsIncluded: ToolDefinition[] = [];

    /**
     * Messages the model should respond with
     */
    responseMessages:
        (AgentMessage | ToolRequest)[] = [];

    /**
     * Input messages that trigger this config
     */
    inputMessages: ModelMessages[] = [];

    /**
     * Structured output schema for this config (if using structured output)
     */
    structuredOutput?: z.ZodSchema<any>;

    /**
     * Specifies what messages the model should respond with.
     * 
     * @param {(AgentMessage | ToolRequest)[]} messages - Response messages
     * @returns {this} The config instance for method chaining
     */
    respondWith(
        messages: (AgentMessage | ToolRequest)[],
    ): this {
        this.responseMessages = messages;
        return this;
    }

    /**
     * Specifies which tools should be included when matching this config.
     * 
     * @param {ToolDefinition[]} tools - Tools to include
     * @returns {this} The config instance for method chaining
     */
    includedTools(tools: ToolDefinition[]): this {
        this.toolsIncluded = tools;
        return this;
    }

    /**
     * Specifies the structured output schema for this config.
     * 
     * @param {z.ZodSchema<any>} schema - The output schema
     * @returns {this} The config instance for method chaining
     */
    providedStructuredOutput(schema: z.ZodSchema<any>): this {
        this.structuredOutput = schema;
        return this;
    }

    /**
     * Specifies the input messages that should trigger this config.
     * 
     * @param {ModelMessages[]} messages - Input messages to match
     * @returns {this} The config instance for method chaining
     */
    userSends(messages: ModelMessages[]): this {
        this.inputMessages = messages;
        return this;
    }
}

/**
 * A mock model implementation for testing purposes.
 * Allows you to specify predefined responses for specific message inputs.
 * Useful for testing agent behavior without hitting real model APIs.
 * 
 * @class TestModel
 * @extends {BaseModel}
 * 
 * @example
 * ```typescript
 * const testModel = new TestModel({ temperature: 0.7 });
 * 
 * // Configure a response
 * const config = new TestResponseConfig()
 *   .userSends([new UserMessage("Hello")])
 *   .respondWith([new AgentMessage("Hi there!")]);
 * 
 * testModel.addTestConfig(config);
 * 
 * // When invoked with matching messages, returns the configured response
 * const response = await testModel.invoke([new UserMessage("Hello")]);
 * // response.messages[0].text === "Hi there!"
 * ```
 */
export class TestModel extends BaseModel {
    /**
     * Array of configured test responses
     */
    testConfigs: TestResponseConfig[] = [];

    /**
     * Creates a new test model instance.
     * 
     * @param {BaseModelConfig} config - Model configuration
     */
    constructor(config: BaseModelConfig) {
        super(config);
    }

    /**
     * Adds a test configuration for a specific input-output pair.
     * 
     * @param {TestResponseConfig} config - The test configuration
     * @returns {this} The model instance for method chaining
     * 
     * @example
     * ```typescript
     * model.addTestConfig(
     *   new TestResponseConfig()
     *     .userSends([userMsg])
     *     .respondWith([agentMsg])
     * );
     * ```
     */
    addTestConfig(config: TestResponseConfig): this {
        this.testConfigs.push(config);
        return this;
    }

    /**
     * Finds a matching test configuration for the given messages.
     * Matching is based on message content, tools, and structured output schema.
     * 
     * @param {ModelMessages[]} messages - Messages to match against
     * @returns {TestResponseConfig | undefined} The matching config, or undefined if no match
     * 
     * @private
     */
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

    /**
     * Executes the test model by finding and returning a matching configuration.
     * 
     * @protected
     * @param {ModelMessages[]} messages - Messages to respond to
     * @returns {Promise<InvokeResponse>} The configured response
     * @throws {Error} If no matching test configuration is found
     */
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
