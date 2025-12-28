export type TypedKeys<O, T> = {
    [K in keyof O]: O[K] extends T ? K : never;
}[keyof O];