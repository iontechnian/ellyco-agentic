interface EndResult<S> {
    state: S;
    exitReason: "end";
}

interface InterruptResult<S> {
    state: S;
    exitReason: "interrupt";
    exitMessage: string;
    cursor: string;
}

export type GraphResult<S> = EndResult<S> | InterruptResult<S>;
