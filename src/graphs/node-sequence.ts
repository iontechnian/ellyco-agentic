import { type NodeLike } from "../nodes";
import { END, Graph, START } from "./graph";
import { z } from "zod";

export class NodeSequence<T extends z.ZodObject, S extends object = z.infer<T>> extends Graph<T, S> {

    protected stateToNodeState(state: S): S {
        return state;
    }

    protected nodeStateToState(nodeState: Partial<S>): Partial<S> {
        return nodeState;
    }

    next(node: NodeLike<S> | Graph<T, S>): this {
        const nodeCount = Object.keys(this.nodes).length;
        const name = `node-${nodeCount}`;
        const isFirstNode = nodeCount === 0;
        this.nodes[name] = node;

        if (isFirstNode) {
            this.edges[START] = name;
            this.edges[name] = END;
        } else {
            const previousNodeName = `node-${nodeCount - 1}`;
            this.edges[previousNodeName] = name;
            this.edges[name] = END;
        }
        return this;
    }
}
