interface ToolUseJSON {
    type: "tool_request" | "tool_response" | "tool_error";
    toolUseId: string;
    toolName: string;
    input?: string;
    output?: string;
    error?: string;
}

export abstract class ToolUse {
    constructor(
        public readonly toolUseId: string,
        public readonly toolName: string,
    ) {}

    abstract toJSON(): ToolUseJSON;
}

export class ToolRequest<T = object> extends ToolUse {
    constructor(
        toolUseId: string,
        toolName: string,
        public readonly input: T,
    ) {
        super(toolUseId, toolName);
    }

    toJSON(): ToolUseJSON {
        return {
            type: "tool_request",
            toolUseId: this.toolUseId,
            toolName: this.toolName,
            input: JSON.stringify(this.input),
        };
    }
}

export class ToolResponse<T = object> extends ToolUse {
    constructor(
        toolUseId: string,
        toolName: string,
        public readonly output: T,
    ) {
        super(toolUseId, toolName);
    }

    toJSON(): ToolUseJSON {
        return {
            type: "tool_response",
            toolUseId: this.toolUseId,
            toolName: this.toolName,
            output: JSON.stringify(this.output),
        };
    }
}

export class ToolError extends ToolUse {
    constructor(
        toolUseId: string,
        toolName: string,
        public readonly error: string,
    ) {
        super(toolUseId, toolName);
    }

    toJSON(): ToolUseJSON {
        return {
            type: "tool_error",
            toolUseId: this.toolUseId,
            toolName: this.toolName,
            error: this.error,
        };
    }
}
