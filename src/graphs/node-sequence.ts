import { NestedGraph, NodeLike } from "../nodes";
import { END, Graph, START } from "./graph";

export class NodeSequence<T extends object> extends Graph<T> {
    protected ioToState(io: T): T {
        return io;
    }

    protected stateToIo(state: T): Partial<T> {
        return state;
    }

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
        if ("isGraph" in node && node.isGraph) {
            this.nodes[name] = new NestedGraph(node);
        } else {
            this.nodes[name] = node;
        }

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
