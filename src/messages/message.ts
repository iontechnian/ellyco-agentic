export interface MessageContentObject {
    content: string;
}

export type MessageContent = string | MessageContentObject;

export enum MessageRole {
    SYSTEM = "system",
    USER = "user",
    AGENT = "agent",
}

export abstract class BaseMessage {
    constructor(
        public readonly role: MessageRole,
        public readonly content: MessageContent,
    ) {}

    public toString(): string {
        return typeof this.content === "string"
            ? this.content
            : this.content.content;
    }

    public toJSON(): { role: MessageRole; content: MessageContent } {
        return {
            role: this.role,
            content: this.content,
        };
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
