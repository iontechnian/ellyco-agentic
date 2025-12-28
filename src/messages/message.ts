/**
 * Object representation of message content with optional text field.
 * 
 * @property {string} [text] - The text content of the message
 */
export interface MessageContentObject {
    text?: string;
}

/**
 * Message content can be either a plain string or a structured content object.
 */
export type MessageContent = string | MessageContentObject;

/**
 * Enum representing the role of a message in the conversation.
 * 
 * @enum {string}
 * @property {string} SYSTEM - System message for setting context/behavior
 * @property {string} USER - User message requesting something
 * @property {string} AGENT - Agent/AI message responding or taking action
 */
export enum MessageRole {
    SYSTEM = "system",
    USER = "user",
    AGENT = "agent",
}

/**
 * Base class for all message types in a conversation.
 * Handles message content parsing, interpolation, and serialization.
 * 
 * @abstract
 * @property {MessageRole} role - The role of this message
 * @property {string | undefined} text - The text content of the message
 * 
 * @example
 * ```typescript
 * const message = new UserMessage("Hello, can you help me?");
 * const systemMsg = new SystemMessage("You are a helpful assistant.");
 * ```
 */
export abstract class BaseMessage {
    private _textContent?: string;

    /**
     * Gets the text content of the message.
     * 
     * @returns {string | undefined} The message text, or undefined if not set
     */
    public get text(): string | undefined {
        return this._textContent;
    }

    /**
     * Creates a new message instance.
     * 
     * @param {MessageRole} role - The role of this message
     * @param {MessageContent} content - The message content (string or object)
     */
    constructor(
        public readonly role: MessageRole,
        content: MessageContent,
    ) {
        if (typeof content === "string") {
            this._textContent = content;
        } else {
            this._textContent = content.text;
        }
    }

    /**
     * Interpolates template variables in the message text.
     * Replaces {variableName} patterns with values from the properties object.
     * 
     * @param {Record<string, any>} properties - Key-value pairs for template substitution
     * @returns {this} The same message instance for chaining
     * @throws {Error} If a referenced property is not found in the properties object
     * 
     * @example
     * ```typescript
     * const msg = new UserMessage("Hello {name}, your score is {score}");
     * msg.interpolate({ name: "Alice", score: 100 });
     * // Result: "Hello Alice, your score is 100"
     * ```
     */
    public interpolate(properties: Record<string, any>): this {
        if (this._textContent) {
            this._textContent = this._textContent.replace(
                /\{\s*(\w+)\s*\}/g,
                (match, p1) => {
                    const value = properties[p1];
                    if (value === undefined) {
                        throw new Error(`Property ${p1} is not defined`);
                    }
                    return value;
                },
            );
        }
        return this;
    }

    /**
     * Converts the message to JSON representation.
     * 
     * @returns {{role: MessageRole; content: MessageContentObject}} JSON representation of the message
     */
    public toJSON(): { role: MessageRole; content: MessageContentObject } {
        return {
            role: this.role,
            content: {
                text: this._textContent,
            },
        };
    }

    /**
     * Checks if the message contains text content.
     * 
     * @returns {boolean} True if the message has text content, false otherwise
     */
    public hasText(): boolean {
        return this._textContent !== undefined;
    }
}

/**
 * A system message used to set the behavior and context for the AI model.
 * System messages typically appear at the beginning of a conversation.
 * 
 * @extends {BaseMessage}
 * 
 * @example
 * ```typescript
 * const systemMsg = new SystemMessage("You are a helpful customer service assistant.");
 * ```
 */
export class SystemMessage extends BaseMessage {
    /**
     * Creates a new system message.
     * 
     * @param {MessageContent} content - The system message content
     */
    constructor(content: MessageContent) {
        super(MessageRole.SYSTEM, content);
    }
}

/**
 * A user message representing input or requests from the user.
 * 
 * @extends {BaseMessage}
 * 
 * @example
 * ```typescript
 * const userMsg = new UserMessage("What is the weather today?");
 * ```
 */
export class UserMessage extends BaseMessage {
    /**
     * Creates a new user message.
     * 
     * @param {MessageContent} content - The user message content
     */
    constructor(content: MessageContent) {
        super(MessageRole.USER, content);
    }
}

/**
 * An agent message representing responses or actions from the AI agent.
 * 
 * @extends {BaseMessage}
 * 
 * @example
 * ```typescript
 * const agentMsg = new AgentMessage("The weather is sunny with a high of 75°F.");
 * ```
 */
export class AgentMessage extends BaseMessage {
    /**
     * Creates a new agent message.
     * 
     * @param {MessageContent} content - The agent message content
     */
    constructor(content: MessageContent) {
        super(MessageRole.AGENT, content);
    }
}
