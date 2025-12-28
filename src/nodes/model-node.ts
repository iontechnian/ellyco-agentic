import { ModelMessages } from "../messages";
import { BaseModel, StructuredOutputWrapper } from "../models/BaseModel";
import { NodeLike } from "./types";
import { ContextLayer } from "../graphs/runtime-context";
import { TypedKeys } from "../types";
import { z } from "zod";

/**
 * Type guard to check if a value is a function that returns messages.
 * 
 * @private
 * @param {any} value - Value to check
 * @returns {boolean} True if value is a messages-returning function
 */
function isMessagesFunction<T extends Record<string, unknown>>(value: any): value is (state: T, context: ContextLayer) => ModelMessages[] {
    return typeof value === "function";
}

/**
 * Helper type to extract keys from an object that have ModelMessages[] values.
 */
type MessagesKeys<T> = TypedKeys<T, ModelMessages[]>;

/**
 * Configuration for messages provided through a function.
 */
interface ConstructedMessages<T extends Record<string, unknown>> {
    messages: (state: T, context: ContextLayer) => ModelMessages[];
}

/**
 * Configuration for messages provided through a state path.
 */
interface MessagesPath<T> {
    messages: MessagesKeys<T>;
}

/**
 * Settings for a ModelNode specifying where to get messages and where to store output.
 */
type ModelNodeSettings<T extends Record<string, unknown>> =
    { output: keyof T }
    & (ConstructedMessages<T> | MessagesPath<T>);

/**
 * A node that invokes an AI model and stores the response in the state.
 * Can be configured to either construct messages dynamically or read from state.
 * 
 * @class ModelNode
 * @template T - The state type
 * @implements {NodeLike<T, Partial<T>>}
 * 
 * @example
 * ```typescript
 * // With messages from a function
 * const node = new ModelNode(model, {
 *   messages: (state, context) => [new UserMessage(state.input)],
 *   output: "modelResponse"
 * });
 * 
 * // With messages from state
 * const node = new ModelNode(model, {
 *   messages: "conversationMessages",
 *   output: "modelResponse"
 * });
 * ```
 */
export class ModelNode<T extends Record<string, unknown>> implements NodeLike<T> {
    /**
     * Creates a new model node.
     * 
     * @param {BaseModel | StructuredOutputWrapper<any>} model - The model to invoke
     * @param {ModelNodeSettings<T>} settings - Configuration for message source and output location
     */
    constructor(
        private readonly model: BaseModel | StructuredOutputWrapper<any>,
        private readonly settings: ModelNodeSettings<T>,
    ) { }

    /**
     * Runs the model with configured messages and stores the response in state.
     * 
     * @param {T} state - The current state
     * @param {ContextLayer} context - The execution context
     * @returns {Promise<Partial<T>>} Partial state containing the model's response
     * @throws {Error} If messages path is specified but not found in state
     */
    async run(state: T, context: ContextLayer): Promise<Partial<T>> {
        let messages: ModelMessages[] = [];
        if (isMessagesFunction(this.settings.messages)) {
            messages = this.settings.messages(state, context);
        } else {
            const stateMessages = state[this.settings.messages as keyof T];
            if (!stateMessages || !Array.isArray(stateMessages)) {
                throw new Error(`No Messages array found for key ${this.settings.messages as string}`);
            }
            messages = stateMessages as ModelMessages[];
        }
        if (this.model instanceof StructuredOutputWrapper) {
            const output = await this.model.invoke(messages);
            return { [this.settings.output]: output } as Partial<T>;
        }
        const response = await this.model.invoke(messages);
        return { [this.settings.output]: response.messages } as Partial<T>;
    }
}
