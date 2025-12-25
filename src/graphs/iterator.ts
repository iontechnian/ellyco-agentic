import { ContextLayer, RuntimeContext } from ".";
import { FunctionNode, NodeLike } from "../nodes";
import { END, Graph, START } from "./graph";
import { z } from "zod";

type IndexState<Prefix extends string> = {
    [K in `${Prefix}Index`]: number;
}

type ItemState<Prefix extends string, Item extends any = any> = {
    [K in `${Prefix}Item`]: Item;
}

export type IteratorNodeState<T extends object, Prefix extends string, Item extends any = any> = IndexState<Prefix> & ItemState<Prefix, Item> & T;

type ZodIndexState<Prefix extends string> = z.ZodObject<{ [K in `${Prefix}Index`]: z.ZodNumber }>;
type ZodItemState<Prefix extends string, Item extends any = any> = z.ZodObject<{ [K in `${Prefix}Item`]: z.ZodType<Item> }>;
type ZodIteratorNodeState<T extends z.ZodObject, Prefix extends string, Item extends any = any> = ZodIndexState<Prefix> & ZodItemState<Prefix, Item> & T;

type ArrayKeys<T> = {
    [K in keyof T]: T[K] extends any[] ? K : never;
}[keyof T];


// Iterator node selectors
const ITERATOR_LOOP_NODE = "iterator-loop";
const INCREMENT_INDEX_NODE = "increment-index";

export class Iterator<
    Item extends any,
    T extends z.ZodObject,
    Prefix extends string,
    S extends Record<string, unknown> = z.infer<T>,
    NS extends Record<string, unknown> = IteratorNodeState<S, Prefix, Item>
> extends Graph<T, S, NS> {
    constructor(
        protected readonly schema: T,
        private readonly prefix: Prefix,
        // Disabled for now, until I can figure out a better approach for this
        // private readonly iteratorSelector: (state: S | NS) => Item[],
        private readonly iteratorKey: ArrayKeys<z.infer<T>>,
    ) {
        super(schema);
        this.nodes[INCREMENT_INDEX_NODE] = new FunctionNode((_, context) => {
            const indexContext = context.custom.indexCtx as ContextLayer;
            indexContext.currentNode = (Number(indexContext.currentNode!) + 1).toString();
            return {};
        });

        this.conditionalEdges[START] = [ITERATOR_LOOP_NODE, END];
        this.conditionalFuncs[START] = (state) => {
            const iterator = state[this.iteratorKey as keyof NS] as Item[];
            return iterator.length > 0 ? ITERATOR_LOOP_NODE : END;
        };
        this.conditionalEdges[ITERATOR_LOOP_NODE] = [INCREMENT_INDEX_NODE, END];
        this.conditionalFuncs[ITERATOR_LOOP_NODE] = (state, context) => {
            const indexContext = context.custom.indexCtx as ContextLayer;
            const index = Number(indexContext.currentNode!);
            const iterator = state[this.iteratorKey as keyof NS] as Item[];
            return index < iterator.length - 1 ? INCREMENT_INDEX_NODE : END;
        };
        this.edges[INCREMENT_INDEX_NODE] = ITERATOR_LOOP_NODE;
    }

    setLoopedNode(loopedNode: NodeLike<NS> | Graph<ZodIteratorNodeState<T, Prefix, Item>, NS>): this {
        this.nodes[ITERATOR_LOOP_NODE] = loopedNode;
        return this;
    }

    getNodeSchema(): ZodIteratorNodeState<T, Prefix, Item> {
        return z.object({
            [`${this.prefix}Index`]: z.number(),
            [`${this.prefix}Item`]: this.schema.shape[this.iteratorKey as keyof typeof this.schema.shape] as z.ZodType<Item>,
        }) as ZodIteratorNodeState<T, Prefix, Item>;
    }

    protected stateToNodeState(
        state: S,
        context: ContextLayer
    ): NS {
        const indexContext = context.custom.indexCtx as ContextLayer;
        const index = Number(indexContext.currentNode!);
        const iterator = state[this.iteratorKey as keyof S] as Item[];
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
        } as unknown as NS;
    }

    protected nodeStateToState(
        nodeState: Partial<NS>,
        context: ContextLayer
    ): S {
        const arr = context.custom.arr as Item[];
        const indexContext = context.custom.indexCtx as ContextLayer;
        const index = Number(indexContext.currentNode!);
        if (`${this.prefix}Item` in nodeState) {
            const { [`${this.prefix}Item`]: item, ...rest } = nodeState as any;
            arr[index] = item;
            delete rest[`${this.prefix}Index`];
            return rest;
        }
        return nodeState as S;
    }

    override async run(
        input: S,
        contextOrRuntime: ContextLayer | RuntimeContext
    ): Promise<Partial<S>> {
        let state = structuredClone(input);
        if (this.nodes[ITERATOR_LOOP_NODE] === undefined) {
            throw new Error(`Looped node is not set`);
        }
        const indexContext = contextOrRuntime.nextLayer();
        if (indexContext.currentNode === undefined) {
            indexContext.currentNode = "0";
        }
        const context = indexContext.nextLayer();
        if (context.currentNode === undefined) {
            context.currentNode = START;
        }
        context.custom.indexCtx = indexContext;
        context.custom.arr = state[this.iteratorKey as keyof S] as Item[];

        const result = await this.runInternal(state, context);

        context.done();
        indexContext.done();
        return { ...result, [this.iteratorKey]: structuredClone(context.custom.arr) };
    }
}