import { END, Graph, START } from "./graph";
import { type NodeLike } from "../nodes/types";
import { ContextLayer } from "./runtime-context";

export class StateMachine<T extends object> extends Graph<T> {
    addNode(name: string, node: NodeLike<T> | Graph<any, T>): this {
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
        func: (state: T) => K[number],
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

    protected stateToNodeState(state: T): T {
        return state;
    }

    protected nodeStateToState(nodeState: T): T {
        return nodeState;
    }
}
