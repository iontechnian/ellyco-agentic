import { z } from "zod";
import { STATE_MERGE } from "./registry";

/**
 * Merges partial state updates into a base state object.
 * Uses registered custom merge strategies for specific types.
 * Falls back to standard object/array merge behavior.
 * 
 * @template T - The state object type
 * @param {T} base - The base state to merge into
 * @param {Partial<T>} changes - Partial state with updates
 * @param {z.ZodObject} schema - Zod schema for the state type
 * @returns {T} Merged state object
 * 
 * @example
 * ```typescript
 * const base = { count: 5, items: [1, 2, 3] };
 * const changes = { count: 10, items: [4] };
 * const merged = mergeState(base, changes, schema);
 * // Results in { count: 10, items: [4] }
 * ```
 */
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