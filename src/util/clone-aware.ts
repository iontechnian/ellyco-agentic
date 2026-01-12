import { deserialize, serialize } from "./serializer";

// this creates a deep clone of something - an object, array, or primitive - while being aware of the classes that can be serialized/deserialized
export function cloneAware<T extends object | Array<unknown> | unknown>(value: T): T {
    if (typeof value === "object" && value !== null) {
        // The value is a class
        if ('constructor' in value && !["Object", "Array"].includes(value.constructor.name)) {
            return deserialize(serialize(value)) as T;
        }

        // The value is an array
        if (Array.isArray(value)) {
            const newArr = [];
            for (const item of value as Array<unknown>) {
                newArr.push(cloneAware(item));
            }
            return newArr as T;
        }

        // The value is a plain object
        const newObj = {} as Record<string, unknown>;
        for (const key in value as Record<string, unknown>) {
            newObj[key] = cloneAware((value as Record<string, unknown>)[key]);
        }
        return newObj as T;

    }
    return value;
}