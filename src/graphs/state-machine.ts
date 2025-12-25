import { END, Graph, START } from "./graph";
import { type NodeLike } from "../nodes/types";
import { z } from "zod";

export class StateMachine<T extends z.ZodObject, S extends Record<string, unknown> = z.infer<T>> extends Graph<T, S> {
    addNode(name: string, node: NodeLike<S> | Graph<any, S>): this {
        if (name === START || name === END) {
            throw new Error(`Node ${name} is reserved`);
        }
        if (name in this.nodes) {
            throw new Error(`Node ${name} already exists`);
        }
        this.nodes[name] = node;
        return this;
    }

    addEdge(from: string, to: string): this {
        this.edges[from] = to;
        return this;
    }

    addConditionalEdge<K extends string[]>(
        from: string,
        to: K,
        func: (state: S) => K[number],
    ): this {
        if (to.length === 0) {
            throw new Error(
                `No edges defined for conditional edge from ${from}`,
            );
        }
        this.conditionalEdges[from] = to;
        this.conditionalFuncs[from] = func;
        return this;
    }

    protected stateToNodeState(state: S): S {
        return state;
    }

    protected nodeStateToState(nodeState: Partial<S>): Partial<S> {
        return nodeState;
    }
}
