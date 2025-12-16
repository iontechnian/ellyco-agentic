import { type NodeLike } from "../nodes";
import { END, Graph, START } from "./graph";
import { ContextLayer } from "./runtime-context";

export class NodeSequence<T extends object> extends Graph<T> {
    protected stateToNodeState(state: T): T {
        return state;
    }

    protected nodeStateToState(nodeState: T): T {
        return nodeState;
    }

    next(node: NodeLike<T> | Graph<any, T>): this {
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
