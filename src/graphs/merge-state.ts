import { z } from "zod";
import { STATE_MERGE } from "./registry";

export function mergeState<T extends Record<string, any>>(base: T, changes: Partial<T>, schema: z.ZodObject): T {
    const acc = structuredClone(base);
    for (const [key, value] of Object.entries(changes)) {
        // if there's nothing already present for the key, then we just set the value
        if (acc[key] === undefined || acc[key] === null) {
            (acc as Record<string, any>)[key] = value;
            continue;
        }
        // if there's a registered merge function, then we assume the function handles the entirety of the value, including any nested values
        if (STATE_MERGE.has(schema.shape[key])) {
            (acc as Record<string, any>)[key] = STATE_MERGE.get(schema.shape[key])!.merge(acc[key], value);
            continue;
        }
        if (typeof value === "object") {
            if (Array.isArray(acc[key])) {
                (acc as Record<string, any>)[key] = value;
            } else {
                (acc as Record<string, any>)[key] = mergeState((acc as Record<string, any>)[key], value as Partial<T>, schema.shape[key] as z.ZodObject);
            }
        } else {
            if (STATE_MERGE.has(schema.shape[key]) && acc[key] !== undefined) {
                (acc as Record<string, any>)[key] = STATE_MERGE.get(schema.shape[key])!.merge(acc[key], value);
            } else {
                (acc as Record<string, any>)[key] = value;
            }
        }
    }
    return acc;
}