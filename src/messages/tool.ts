/**
 * Internal interface for serializing tool-related messages to JSON.
 * 
 * @interface ToolUseJSON
 * @property {string} type - The type of tool message: "tool_request", "tool_response", or "tool_error"
 * @property {string} toolUseId - Unique identifier linking request to response/error
 * @property {string} toolName - Name of the tool being used
 * @property {string} [input] - JSON-stringified input parameters for the tool
 * @property {string} [output] - JSON-stringified output/result from the tool
 * @property {string} [error] - Error message if the tool execution failed
 */
interface ToolUseJSON {
    type: "tool_request" | "tool_response" | "tool_error";
    toolUseId: string;
    toolName: string;
    input?: string;
    output?: string;
    error?: string;
}

/**
 * Base class for tool-related messages representing tool usage in agent-model interactions.
 * Covers tool requests, responses, and errors.
 * 
 * @abstract
 * @property {string} toolUseId - Unique identifier for this tool usage instance
 * @property {string} toolName - Name of the tool
 * 
 * @example
 * ```typescript
 * // ToolRequest: Agent requests to use a tool
 * const request = new ToolRequest("call_123", "search", { query: "weather" });
 * 
 * // ToolResponse: Tool returns a result
 * const response = new ToolResponse("call_123", "search", { result: "Sunny" });
 * 
 * // ToolError: Tool execution failed
 * const error = new ToolError("call_123", "search", "API connection failed");
 * ```
 */
export abstract class ToolUse {
    /**
     * Creates a new tool usage instance.
     * 
     * @param {string} toolUseId - Unique identifier for this tool usage
     * @param {string} toolName - Name of the tool being used
     */
    constructor(
        public readonly toolUseId: string,
        public readonly toolName: string,
    ) { }

    /**
     * Converts the tool usage to JSON representation.
     * 
     * @abstract
     * @returns {ToolUseJSON} JSON representation of the tool usage
     */
    abstract toJSON(): ToolUseJSON;
}

/**
 * Represents a request from the agent to execute a tool.
 * Contains the tool name and input parameters for execution.
 * 
 * @extends {ToolUse}
 * @template T - The type of the input parameters object
 * @property {T} input - The input parameters for the tool
 * 
 * @example
 * ```typescript
 * const request = new ToolRequest(
 *   "call_123",
 *   "search",
 *   { query: "Paris weather" }
 * );
 * ```
 */
export class ToolRequest<T = object> extends ToolUse {
    /**
     * Creates a new tool request.
     * 
     * @param {string} toolUseId - Unique identifier for this request
     * @param {string} toolName - Name of the tool to invoke
     * @param {T} input - Parameters to pass to the tool
     */
    constructor(
        toolUseId: string,
        toolName: string,
        public readonly input: T,
    ) {
        super(toolUseId, toolName);
    }

    /**
     * Converts the tool request to JSON representation.
     * 
     * @returns {ToolUseJSON} JSON representation with type "tool_request"
     */
    toJSON(): ToolUseJSON {
        return {
            type: "tool_request",
            toolUseId: this.toolUseId,
            toolName: this.toolName,
            input: JSON.stringify(this.input),
        };
    }
}

/**
 * Represents the successful result of a tool execution.
 * Contains the output/result returned by the tool.
 * 
 * @extends {ToolUse}
 * @template T - The type of the output/result object
 * @property {T} output - The result returned by the tool
 * 
 * @example
 * ```typescript
 * const response = new ToolResponse(
 *   "call_123",
 *   "search",
 *   { results: ["result1", "result2"], totalCount: 2 }
 * );
 * ```
 */
export class ToolResponse<T = object> extends ToolUse {
    /**
     * Creates a new tool response.
     * 
     * @param {string} toolUseId - Unique identifier matching the original request
     * @param {string} toolName - Name of the tool that was executed
     * @param {T} output - The result returned by the tool
     */
    constructor(
        toolUseId: string,
        toolName: string,
        public readonly output: T,
    ) {
        super(toolUseId, toolName);
    }

    /**
     * Converts the tool response to JSON representation.
     * 
     * @returns {ToolUseJSON} JSON representation with type "tool_response"
     */
    toJSON(): ToolUseJSON {
        return {
            type: "tool_response",
            toolUseId: this.toolUseId,
            toolName: this.toolName,
            output: JSON.stringify(this.output),
        };
    }
}

/**
 * Represents an error that occurred during tool execution.
 * Contains the error message describing what went wrong.
 * 
 * @extends {ToolUse}
 * @property {string} error - The error message
 * 
 * @example
 * ```typescript
 * const error = new ToolError(
 *   "call_123",
 *   "search",
 *   "Network timeout: Request took longer than 30 seconds"
 * );
 * ```
 */
export class ToolError extends ToolUse {
    /**
     * Creates a new tool error.
     * 
     * @param {string} toolUseId - Unique identifier matching the original request
     * @param {string} toolName - Name of the tool that failed
     * @param {string} error - Description of the error that occurred
     */
    constructor(
        toolUseId: string,
        toolName: string,
        public readonly error: string,
    ) {
        super(toolUseId, toolName);
    }

    /**
     * Converts the tool error to JSON representation.
     * 
     * @returns {ToolUseJSON} JSON representation with type "tool_error"
     */
    toJSON(): ToolUseJSON {
        return {
            type: "tool_error",
            toolUseId: this.toolUseId,
            toolName: this.toolName,
            error: this.error,
        };
    }
}
