import { type NodeLike, type RunConfig } from "../nodes/types";

export interface GraphResult<S> {
    state: Partial<S>;
    exitReason: "interrupt" | "end";
    cursor?: string[];
}
