import { ContextLayer, RuntimeContext } from ".";
import { FunctionNode, NodeLike } from "../nodes";
import { TypedKeys } from "../types";
import { END, Graph, START } from "./graph";
import { z } from "zod";

/**
 * Type representing state with an index for tracking iteration position.
 * 
 * @template Prefix - The prefix for the index key (e.g., "item" -> "itemIndex")
 */
type IndexState<Prefix extends string> = {
    [K in `${Prefix}Index`]: number;
}

/**
 * Type representing state with the current item being iterated over.
 * 
 * @template Prefix - The prefix for the item key (e.g., "item" -> "itemItem")
 * @template Item - The type of items in the array
 */
type ItemState<Prefix extends string, Item extends any = any> = {
    [K in `${Prefix}Item`]: Item;
}

/**
 * Type representing the complete state for iterator nodes.
 * Combines the base state with index and item tracking.
 * 
 * @template T - The base state object type
 * @template Prefix - Prefix for index/item keys
 * @template Item - Type of items being iterated
 */
export type IteratorNodeState<T extends object, Prefix extends string, Item extends any = any> = IndexState<Prefix> & ItemState<Prefix, Item> & T;

/**
 * Zod schema for index state
 */
type ZodIndexState<Prefix extends string> = z.ZodObject<{ [K in `${Prefix}Index`]: z.ZodNumber }>;

/**
 * Zod schema for item state
 */
type ZodItemState<Prefix extends string, Item extends any = any> = z.ZodObject<{ [K in `${Prefix}Item`]: z.ZodType<Item> }>;

/**
 * Zod schema for complete iterator node state
 */
type ZodIteratorNodeState<T extends z.ZodObject, Prefix extends string, Item extends any = any> = ZodIndexState<Prefix> & ZodItemState<Prefix, Item> & T;

/**
 * Helper type to extract keys that have array values from state
 */
type ArrayKeys<T> = TypedKeys<T, any[]>;

/**
 * Node name for the loop body
 */
const ITERATOR_LOOP_NODE = "iterator-loop";

/**
 * Node name for incrementing the index
 */
const INCREMENT_INDEX_NODE = "increment-index";

/**
 * A graph that iterates over an array in state, running a looped node for each item.
 * Manages index tracking and item extraction automatically.
 * 
 * @class Iterator
 * @extends {Graph<T, S, NS>}
 * @template Item - The type of items in the array
 * @template T - The Zod schema for base state
 * @template Prefix - Prefix for index/item state keys
 * @template S - The inferred state type from T
 * @template NS - The node state type including index and item
 * 
 * @example
 * ```typescript
 * const schema = z.object({
 *   items: z.array(z.object({ name: z.string(), value: z.number() }))
 * });
 * 
 * const iterator = new Iterator(schema, "item", "items");
 * const looped = new NodeSequence(iterator.getNodeSchema());
 * looped.next(new FunctionNode((state) => ({
 *   itemValue: state.itemItem.value * 2
 * })));
 * 
 * iterator.setLoopedNode(looped);
 * 
 * const result = await iterator.invoke({ 
 *   items: [{ name: "a", value: 1 }, { name: "b", value: 2 }]
 * });
 * ```
 */
export class Iterator<
    Item extends any,
    T extends z.ZodObject,
    Prefix extends string,
    S extends Record<string, unknown> = z.infer<T>,
    NS extends Record<string, unknown> = IteratorNodeState<S, Prefix, Item>
> extends Graph<T, S, NS> {
    /**
     * Creates an iterator graph.
     * 
     * @param {T} schema - The base state schema
     * @param {Prefix} prefix - Prefix for index and item keys
     * @param {ArrayKeys<z.infer<T>>} iteratorKey - The state key containing the array to iterate
     */
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

    /**
     * Sets the node to be executed for each item in the array.
     * 
     * @param {NodeLike<NS> | Graph<ZodIteratorNodeState<T, Prefix, Item>, NS>} loopedNode - The node to loop
     * @returns {this} The iterator instance for method chaining
     */
    setLoopedNode(loopedNode: NodeLike<NS> | Graph<ZodIteratorNodeState<T, Prefix, Item>, NS>): this {
        this.nodes[ITERATOR_LOOP_NODE] = loopedNode;
        return this;
    }

    /**
     * Gets the schema for nodes being looped over.
     * Extends the base schema with index and item tracking.
     * 
     * @returns {ZodIteratorNodeState<T, Prefix, Item>} Schema for looped nodes
     */
    getNodeSchema(): ZodIteratorNodeState<T, Prefix, Item> {
        return z.object({
            [`${this.prefix}Index`]: z.number(),
            [`${this.prefix}Item`]: this.schema.shape[this.iteratorKey as keyof typeof this.schema.shape] as z.ZodType<Item>,
        }) as ZodIteratorNodeState<T, Prefix, Item>;
    }

    /**
     * Converts the graph state to node state by extracting the current item.
     * 
     * @protected
     * @param {S} state - The graph state
     * @param {ContextLayer} context - The execution context
     * @returns {NS} The node state with current index and item
     */
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

    /**
     * Converts node state back to graph state, updating the array with modified item.
     * 
     * @protected
     * @param {Partial<NS>} nodeState - The partial node state
     * @param {ContextLayer} context - The execution context
     * @returns {S} The partial graph state
     */
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

    /**
     * Runs the iterator over all items in the array.
     * Manages index tracking and item extraction for looped node execution.
     * 
     * @param {S} input - Initial state
     * @param {ContextLayer | RuntimeContext} contextOrRuntime - Execution context
     * @returns {Promise<Partial<S>>} Final state with updated array
     */
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