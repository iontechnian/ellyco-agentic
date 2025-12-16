import { FunctionNode, NodeLike } from "../nodes";
import { END, Graph, START } from "./graph";
import { ContextLayer, RuntimeContext } from "./runtime-context";

// Iterator node selectors
const ITERATOR_LOOP_NODE = "iterator-loop";
const INCREMENT_INDEX_NODE = "increment-index";

type IteratorState<T extends object, Prefix extends string> = T & {
    [K in `${Prefix}Index`]: number;
};

export type InteratorNodeState<
    T extends object,
    Prefix extends string,
    Item extends any = any
> = IteratorState<T, Prefix> & {
    [K in `${Prefix}Item`]: Item;
};

/**
 * Iterator can be given a node or a graph that it runs for each item in a specified array.
 * A prefix is specified for the index and item keys in this state. This is to avoid name conflicts if nested iterators are used.
 * The items get remapped into the specified array after each loop, so the Iterator can be used as a array mapper by modifying the item.
 */
export class Interator<
    T extends object,
    Prefix extends string,
    Item extends any = any
> extends Graph<T, InteratorNodeState<T, Prefix, Item>> {
    constructor(
        private readonly prefix: Prefix,
        private readonly iteratorSelector: (state: T) => Item[],
        private readonly loopedNode:
            | NodeLike<InteratorNodeState<T, Prefix, Item>>
            | Graph<any, InteratorNodeState<T, Prefix, Item>>
    ) {
        super();
        this.nodes[ITERATOR_LOOP_NODE] = this.loopedNode;
        this.nodes[INCREMENT_INDEX_NODE] = new FunctionNode((_, context) => {
            const indexContext = context.custom.indexCtx as ContextLayer;
            indexContext.currentNode = (Number(indexContext.currentNode!) + 1).toString();
            return {};
        });

        this.conditionalEdges[START] = [ITERATOR_LOOP_NODE, END];
        this.conditionalFuncs[START] = (state) => {
            const iterator = this.iteratorSelector(state);
            return iterator.length > 0 ? ITERATOR_LOOP_NODE : END;
        };
        this.edges[ITERATOR_LOOP_NODE] = INCREMENT_INDEX_NODE;
        this.conditionalEdges[INCREMENT_INDEX_NODE] = [ITERATOR_LOOP_NODE, END];
        this.conditionalFuncs[INCREMENT_INDEX_NODE] = (state, context) => {
            const indexContext = context.custom.indexCtx as ContextLayer;
            const index = Number(indexContext.currentNode!);
            const iterator = this.iteratorSelector(state);
            return index < iterator.length ? ITERATOR_LOOP_NODE : END;
        };
    }

    protected stateToNodeState(
        state: IteratorState<T, Prefix>,
        context: ContextLayer
    ): InteratorNodeState<T, Prefix, Item> {
        const indexContext = context.custom.indexCtx as ContextLayer;
        const index = Number(indexContext.currentNode!);
        const iterator = this.iteratorSelector(state);
        if (iterator === undefined) {
            throw new Error(`Selected iterator is not found`);
        }
        if (!Array.isArray(iterator)) {
            throw new Error(`Seletected iterator is not an array`);
        }
        const item = iterator[index];
        if (item === undefined) {
            throw new Error(`Item ${index} not found`);
        }
        return {
            ...state,
            [`${this.prefix}Index`]: index,
            [`${this.prefix}Item`]: item,
        } as InteratorNodeState<T, Prefix, Item>;
    }

    protected nodeStateToState(
        nodeState: Partial<InteratorNodeState<T, Prefix, Item>>,
        context: ContextLayer
    ): IteratorState<T, Prefix> {
        const arr = context.custom.arr as Item[];
        const indexContext = context.custom.indexCtx as ContextLayer;
        const index = Number(indexContext.currentNode!);
        if (`${this.prefix}Item` in nodeState) {
            const { [`${this.prefix}Item`]: item, ...rest } = nodeState as any;
            arr[index] = item;
            delete rest[`${this.prefix}Index`];
            return rest;
        }
        return nodeState as IteratorState<T, Prefix>;
    }

    override async run(
        input: T,
        contextOrRuntime: ContextLayer | RuntimeContext
    ): Promise<Partial<T>> {
        const indexContext = contextOrRuntime.nextLayer();
        if (indexContext.currentNode === undefined) {
            indexContext.currentNode = "0";
        }
        const context = indexContext.nextLayer();
        if (context.currentNode === undefined) {
            context.currentNode = START;
        }
        context.custom.indexCtx = indexContext;
        context.custom.arr = this.iteratorSelector(input);

        const result = await this.runInternal(input, context);
        context.done();
        indexContext.done();
        return result;
    }
}
