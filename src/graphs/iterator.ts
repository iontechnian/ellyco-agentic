import { FunctionNode, NestedGraph, NodeLike } from "../nodes";
import { END, Graph, START } from "./graph";

// Iterator node selectors
const ITERATOR_LOOP_NODE = "iterator-loop";
const INCREMENT_INDEX_NODE = "increment-index";

type IteratorState<T extends object, Prefix extends string> =
    & T
    & {
        [K in `${Prefix}Index`]: number;
    };

export type InteratorNodeState<
    T extends object,
    Prefix extends string,
    Item extends any = any,
> =
    & IteratorState<T, Prefix>
    & {
        [K in `${Prefix}Item`]: Item;
    };

const isGraph = (node: any): node is Graph<any> => {
    return "isGraph" in node && node.isGraph;
};

/**
 * Iterator can be given a node or a graph that it runs for each item in a specified array.
 * A prefix is specified for the index and item keys in this state. This is to avoid name conflicts if nested iterators are used.
 * The items get remapped into the specified array after each loop, so the Iterator can be used as a array mapper by modifying the item.
 */
export class Interator<
    T extends object,
    Prefix extends string,
    Item extends any = any,
> extends Graph<
    IteratorState<T, Prefix>,
    T,
    InteratorNodeState<T, Prefix, Item>
> {
    private index: number = 0;

    constructor(
        private readonly prefix: Prefix,
        private readonly iteratorSelector: (state: T) => Item[],
        private readonly loopedNode:
            | NodeLike<InteratorNodeState<T, Prefix, Item>>
            | Graph<any, InteratorNodeState<T, Prefix, Item>>,
    ) {
        super();
        if (isGraph(this.loopedNode)) {
            this.nodes[ITERATOR_LOOP_NODE] = new NestedGraph(this.loopedNode);
        } else {
            this.nodes[ITERATOR_LOOP_NODE] = this.loopedNode;
        }
        this.nodes[INCREMENT_INDEX_NODE] = new FunctionNode(() => {
            this.index++;
            return {};
        });

        this.conditionalEdges[START] = [ITERATOR_LOOP_NODE, END];
        this.conditionalFuncs[START] = (state) => {
            const iterator = this.iteratorSelector(state);
            return iterator.length > 0 ? ITERATOR_LOOP_NODE : END;
        };
        this.edges[ITERATOR_LOOP_NODE] = INCREMENT_INDEX_NODE;
        this.conditionalEdges[INCREMENT_INDEX_NODE] = [ITERATOR_LOOP_NODE, END];
        this.conditionalFuncs[INCREMENT_INDEX_NODE] = (state) => {
            const iterator = this.iteratorSelector(state);
            return this.index < iterator.length ? ITERATOR_LOOP_NODE : END;
        };
    }

    protected ioToState(io: T): IteratorState<T, Prefix> {
        return {
            ...io,
            [`${this.prefix}Index`]: 0,
        } as IteratorState<T, Prefix>;
    }

    protected stateToIo(state: T): Partial<T> {
        const { [`${this.prefix}Index`]: index, ...rest } = state as any;
        return rest as Partial<T>;
    }

    protected stateToNodeState(
        state: IteratorState<T, Prefix>,
    ): InteratorNodeState<T, Prefix, Item> {
        const iterator = this.iteratorSelector(state);
        if (iterator === undefined) {
            throw new Error(`Selected iterator is not found`);
        }
        if (!Array.isArray(iterator)) {
            throw new Error(`Seletected iterator is not an array`);
        }
        const item = iterator[this.index];
        if (item === undefined) {
            throw new Error(`Item ${this.index} not found`);
        }
        return {
            ...state,
            [`${this.prefix}Index`]: this.index,
            [`${this.prefix}Item`]: item,
        } as InteratorNodeState<T, Prefix, Item>;
    }

    protected nodeStateToState(
        nodeState: Partial<InteratorNodeState<T, Prefix, Item>>,
    ): IteratorState<T, Prefix> {
        if (`${this.prefix}Item` in nodeState) {
            const { [`${this.prefix}Item`]: item, ...rest } = nodeState as any;
            const arr = this.iteratorSelector(this.state);
            arr[this.index] = item;
            return rest;
        }
        return nodeState as IteratorState<T, Prefix>;
    }

    protected override recoverFromInterrupt(): {
        cursor: string;
        remainingResumeFrom: string[];
    } {
        const index = +this.config.resumeFrom![0]!;
        this.index = index;
        return {
            cursor: this.config.resumeFrom![1]!,
            remainingResumeFrom: this.config.resumeFrom!.slice(2),
        };
    }

    protected override setInterruptCursor(): string[] {
        const index = this.index;
        return [index.toString(), this.cursor];
    }
}
