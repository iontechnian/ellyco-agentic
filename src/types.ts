/**
 * Utility type that extracts keys from an object where the value matches a specific type.
 * 
 * @template O - The object type to extract keys from
 * @template T - The type to match against object values
 * @returns A union of keys from O where the value type extends T
 * 
 * @example
 * ```typescript
 * type Obj = { a: string; b: number; c: string };
 * type StringKeys = TypedKeys<Obj, string>; // 'a' | 'c'
 * ```
 */
export type TypedKeys<O, T> = {
    [K in keyof O]: O[K] extends T ? K : never;
}[keyof O];