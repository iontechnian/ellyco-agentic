export interface MessageContentObject {
    text?: string;
}

export type MessageContent = string | MessageContentObject;

export enum MessageRole {
    SYSTEM = "system",
    USER = "user",
    AGENT = "agent",
}

export abstract class BaseMessage {
    private _textContent?: string;

    public get text(): string | undefined {
        return this._textContent;
    }

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

    public toJSON(): { role: MessageRole; content: MessageContentObject } {
        return {
            role: this.role,
            content: {
                text: this._textContent,
            },
        };
    }

    public hasText(): boolean {
        return this._textContent !== undefined;
    }
}

export class SystemMessage extends BaseMessage {
    constructor(content: MessageContent) {
        super(MessageRole.SYSTEM, content);
    }
}

export class UserMessage extends BaseMessage {
    constructor(content: MessageContent) {
        super(MessageRole.USER, content);
    }
}

export class AgentMessage extends BaseMessage {
    constructor(content: MessageContent) {
        super(MessageRole.AGENT, content);
    }
}
