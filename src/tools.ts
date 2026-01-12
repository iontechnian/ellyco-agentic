import * as z from "zod";

/**
 * Defines the structure for a tool that can be used by AI models.
 * 
 * @template T - The input type for the tool, validated against the schema
 * @property {string} name - Unique identifier for the tool
 * @property {string} [description] - Human-readable description of what the tool does
 * @property {z.ZodSchema<T>} schema - Zod schema that validates the tool's input parameters
 */
export interface ToolDefinition<T = object> {
    name: string;
    description?: string;
    schema: z.ZodSchema<T>;
}

/**
 * Creates a tool definition with validation schema.
 * Used to declare what tools are available to AI models.
 * 
 * @template T - The input parameter type
 * @param {string} name - Unique identifier for the tool
 * @param {string} description - Description of the tool's purpose and behavior
 * @param {z.ZodSchema<T>} schema - Zod schema for validating input parameters
 * @returns {ToolDefinition<T>} A tool definition object
 * 
 * @example
 * ```typescript
 * const searchTool = defineTool(
 *   "search",
 *   "Search the web for information",
 *   z.object({ query: z.string() })
 * );
 * ```
 */
export function defineTool<T>(
    name: string,
    description: string,
    schema: z.ZodSchema<T>,
): ToolDefinition<T> {
    return {
        name,
        description,
        schema,
    };
}

/**
 * Internal interface extending ToolDefinition with the actual implementation function.
 * 
 * @template T - The input type for the tool
 * @template K - The output type returned by the tool function
 * @template A - The additional arguments type
 */
export interface ToolImplementation<T, K, A extends Record<string, any>> extends ToolDefinition<T> {
    func: (input: T, additionalArgs?: A) => K | Promise<K>;
}

/**
 * Creates a complete tool implementation by combining a tool definition with its function.
 * 
 * @template T - The input parameter type
 * @template K - The return type of the tool function
 * @template A - The additional arguments type
 * @param {ToolDefinition<T>} toolDefinition - The tool definition created with defineTool()
 * @param {(input: T, additionalArgs?: Record<string, any>) => K | Promise<K>} func - The function that implements the tool's behavior
 * @returns {ToolImplementation<T, K, A>} A complete tool with both definition and implementation
 * 
 * @example
 * ```typescript
 * const searchTool = tool(
 *   defineTool("search", "Search the web", z.object({ query: z.string() })),
 *   async (input) => {
 *     return await fetch(`https://api.search.com?q=${input.query}`);
 *   }
 * );
 * ```
 */
export function tool<T, K, A extends Record<string, any>>(
    toolDefinition: ToolDefinition<T>,
    func: (input: T, additionalArgs?: A) => K | Promise<K>,
): ToolImplementation<T, K, A> {
    return {
        ...toolDefinition,
        func,
    };
}
