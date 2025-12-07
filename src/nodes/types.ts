export interface RunConfig {
    resumeFrom?: string[];
    shouldInterrupt?: boolean;
}

export interface NodeLike<I extends object, O extends object = Partial<I>> {
    run(state: I, config: RunConfig): Promise<O>;
}
