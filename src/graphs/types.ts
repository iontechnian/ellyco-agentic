interface EndResult<S> {
    runId: string;
    state: S;
    exitReason: "end";
}

interface InterruptResult<S> {
    runId: string;
    state: S;
    exitReason: "interrupt";
    exitMessage: string;
    cursor: string;
}

export type GraphResult<S> = EndResult<S> | InterruptResult<S>;
