import * as z from "zod";

export interface ToolDefinition<T = object> {
    name: string;
    description?: string;
    schema: z.ZodSchema<T>;
}

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

interface ToolImplementation<T, K> extends ToolDefinition<T> {
    func: (input: T) => K | Promise<K>;
}

export function tool<T, K>(
    toolDefinition: ToolDefinition<T>,
    func: (input: T) => K | Promise<K>,
): ToolImplementation<T, K> {
    return {
        ...toolDefinition,
        func,
    };
}
