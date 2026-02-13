import { z } from "zod";
import { STATE_MERGE } from "../graphs/registry";
import { cloneAware } from "./clone-aware";

/**
 * Merges partial state updates into a base state object.
 * 
 * Uses registered custom merge strategies for specific types when available.
 * Falls back to standard merge behavior based on value types:
 * - Undefined/null keys: Set the new value directly
 * - Custom merge functions: Use registered strategy (handles entire value including nested)
 * - Class instances: Replace directly (preserves object identity)
 * - Arrays: Replace entire array (no element-level merging)
 * - Plain objects: Recursively merge nested properties
 * - Primitives: Replace the value
 * 
 * The merge process uses `cloneAware()` to create a deep clone of the base state,
 * ensuring the original state is not mutated while preserving class instances.
 * 
 * @template T - The state object type
 * @param {T} base - The base state to merge into (will not be mutated)
 * @param {Partial<T>} changes - Partial state with updates to apply
 * @param {z.ZodObject} schema - Zod schema for the state type (used to look up custom merge strategies)
 * @returns {T} New merged state object (base is not mutated)
 * 
 * @example
 * ```typescript
 * // Basic merge
 * const base = { count: 5, items: [1, 2, 3], user: { name: "Alice" } };
 * const changes = { count: 10, user: { age: 30 } };
 * const merged = mergeState(base, changes, schema);
 * // Results in { count: 10, items: [1, 2, 3], user: { name: "Alice", age: 30 } }
 * 
 * // Array replacement (arrays are replaced, not merged)
 * const base2 = { items: [1, 2, 3] };
 * const changes2 = { items: [4, 5] };
 * const merged2 = mergeState(base2, changes2, schema);
 * // Results in { items: [4, 5] } (not [1, 2, 3, 4, 5])
 * 
 * // Custom merge strategy (if registered)
 * const schema = z.object({
 *   count: z.number().register(STATE_MERGE, {
 *     merge: (old, change) => old + change // Additive merge
 *   })
 * });
 * const base3 = { count: 5 };
 * const changes3 = { count: 3 };
 * const merged3 = mergeState(base3, changes3, schema);
 * // Results in { count: 8 } (5 + 3, not 3)
 * ```
 */
export function mergeState<T extends Record<string, any>>(base: T, changes: Partial<T>, schema: z.ZodObject): T {
    const acc = cloneAware(base);
    for (const [key, value] of Object.entries(changes)) {
        // If there's nothing already present for the key, then we just set the value
        if (acc[key] === undefined || acc[key] === null) {
            (acc as Record<string, any>)[key] = value;
            continue;
        }
        // If there's a registered merge function, then we assume the function handles 
        // the entirety of the value, including any nested values
        if (schema && STATE_MERGE.has(schema.shape[key])) {
            (acc as Record<string, any>)[key] = STATE_MERGE.get(schema.shape[key])!.merge(acc[key], value);
            continue;
        }
        if (typeof value === "object") {
            // The value is a class instance - replace directly to preserve object identity
            if ('constructor' in value && !["Object", "Array"].includes(value.constructor.name)) {
                (acc as Record<string, any>)[key] = value;
                continue;
            }
            // The value is an array - replace the entire array (no element-level merging)
            if (Array.isArray(acc[key])) {
                (acc as Record<string, any>)[key] = value;
                continue;
            }

            // The value is a plain object - recursively merge nested properties
            (acc as Record<string, any>)[key] = mergeState((acc as Record<string, any>)[key], value as Partial<T>, schema.shape[key] as z.ZodObject);
        } else {
            // The value is a primitive - replace directly
            (acc as Record<string, any>)[key] = value;
        }
    }
    return acc;
}