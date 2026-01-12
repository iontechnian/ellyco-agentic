import { AgentMessage, SystemMessage, ToolError, ToolRequest, ToolResponse, UserMessage } from "../messages";

type SerializedObject = { __className: string, [key: string]: unknown };

export interface Serializer<T, S extends Record<string, unknown>> {
    serialize(value: T): S;
    deserialize(value: S): T;
}

type ClassConstructor<T> = new (...args: any[]) => T;

export const SERIALIZERS = new Map<string, Serializer<any, any>>();

export function registerSerializer<T, S extends Record<string, unknown>>(constructor: ClassConstructor<T>, serializer: Serializer<T, S>): void {
    SERIALIZERS.set(constructor.name, serializer);
}

export function serialize<T extends object>(value: T): SerializedObject {
    const className = value.constructor.name;
    const serializer = SERIALIZERS.get(className);
    if (!serializer) {
        throw new Error(`No serializer registered for ${className}`);
    }
    return {
        __className: className,
        ...serializer.serialize(value),
    };
}

export function deserialize<T extends object>(value: SerializedObject): T {
    const { __className, ...rest } = value;
    const serializer = SERIALIZERS.get(__className);
    if (!serializer) {
        throw new Error(`No serializer registered for ${__className}`);
    }
    return serializer.deserialize(rest);
}

registerSerializer(SystemMessage, {
    serialize: (value) => ({
        text: value.text!,
    }),
    deserialize: (value) => new SystemMessage(value.text),
});
registerSerializer(UserMessage, {
    serialize: (value) => ({
        text: value.text!,
    }),
    deserialize: (value) => new UserMessage(value.text),
});
registerSerializer(AgentMessage, {
    serialize: (value) => ({
        text: value.text!,
    }),
    deserialize: (value) => new AgentMessage(value.text),
});
registerSerializer(ToolRequest, {
    serialize: (value) => ({
        toolUseId: value.toolUseId,
        toolName: value.toolName,
        input: value.input,
    }),
    deserialize: (value) => new ToolRequest(value.toolUseId, value.toolName, value.input),
});
registerSerializer(ToolResponse, {
    serialize: (value) => ({
        toolUseId: value.toolUseId,
        toolName: value.toolName,
        output: value.output,
    }),
    deserialize: (value) => new ToolResponse(value.toolUseId, value.toolName, value.output),
});
registerSerializer(ToolError, {
    serialize: (value) => ({
        toolUseId: value.toolUseId,
        toolName: value.toolName,
        error: value.error,
    }),
    deserialize: (value) => new ToolError(value.toolUseId, value.toolName, value.error),
});