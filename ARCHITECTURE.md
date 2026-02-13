# Architecture

This document describes the internal architecture and implementation details of
the ellyco-agentic library. For usage instructions, see [README.md](README.md).

## Execution Flow

Graph execution follows a structured flow:

```
Graph.invoke()
  ↓
Create RuntimeContext
  ↓
Loop:
  - Get current node
  - Execute node.run(state, context)
  - Merge returned state
  - Check for interrupts
  - Transition to next node
  ↓
Return result (end or interrupt)
```

### Detailed Execution Steps

1. **Initialization**: When `graph.invoke()` is called, a `RuntimeContext` is
   created with a unique `runId`.

2. **Context Layer Setup**: The runtime creates the first `ContextLayer` and
   sets `currentNode` to `START` (the special start node).

3. **Execution Loop** (`runInternal`):
   - If `currentNode` is `END`, execution stops
   - If `currentNode` is `START`, transition to the first real node
   - Otherwise, execute the current node via `step()`
   - Merge the node's returned state into the current state
   - Check if execution was interrupted
   - Transition to the next node based on edges

4. **Node Execution** (`step`):
   - Transform graph state to node state (`stateToNodeState`)
   - Clone state using `cloneAware()` to prevent mutations
   - Execute `node.run(state, context)`
   - Transform node state back to graph state (`nodeStateToState`)
   - Merge partial updates into full state (`mergeState`)

5. **Completion**: When `END` is reached or an interrupt occurs, return the
   final state.

## State Transformation

Graphs support state transformation between graph-level state and node-level
state. This enables graphs to work with different state schemas internally.

```
Graph State (Schema T)
    ↓
stateToNodeState() ← Node gets specific state type (Schema NS)
    ↓
Node.run() ← Node executes with NS state
    ↓
nodeStateToState() ← Convert back to graph state (Schema T)
    ↓
mergeState() ← Merge with existing state
    ↓
Updated Graph State (Schema T)
```

### State Transformation Methods

All graphs implement two abstract methods:

- **`stateToNodeState(state: S, context: ContextLayer): NS`** - Converts graph
  state to node state before passing to nodes
- **`nodeStateToState(nodeState: Partial<NS>, context: ContextLayer): Partial<S>`** -
  Converts node state back to graph state after execution

**Examples:**

- `StateMachine` and `NodeSequence`: No transformation (NS = S)
- `Iterator`: Transforms to include `index` and `item` fields for the current
  iteration

## Context Layers

Nested graphs create a stack of context layers for tracking execution position.
Each layer represents one level of nesting.

### ContextLayer Structure

```typescript
class ContextLayer {
  currentNode?: string; // Current node name at this layer
  custom: Record<string, any>; // Custom data storage
  index: number; // Position in stack (0 = root)
  runtime: RuntimeContext; // Reference to parent runtime
}
```

### Layer Stack Example

```typescript
RuntimeContext
  └─ ContextLayer 0 (root)
     ├─ currentNode: "node1"
     ├─ custom: { ... }
     └─ ContextLayer 1 (nested graph)
        ├─ currentNode: "subnode"
        └─ custom: { ... }
```

### Layer ID Generation

Layer IDs are generated hierarchically:

- Root layer: `"ROOT"`
- Nested layers: `"PARENT_ID.CURRENT_NODE"` (e.g., `"ROOT.delegate.subprocess"`)

This enables:

- Unique identification in OpenTelemetry traces
- Cursor encoding for checkpointing
- Debugging nested execution

### Layer Lifecycle

1. **Creation**: When a graph calls another graph, `nextLayer()` creates a new
   layer
2. **Execution**: The layer tracks which node is currently executing
3. **Completion**: When a nested graph finishes, `done()` removes the layer
   (unless interrupted)

## State Merging

State merging combines partial updates from nodes into the full graph state. The
merge process respects the Zod schema and supports custom merge strategies.

### Merge Process

1. **Clone Base State**: Use `cloneAware()` to create a deep clone that
   preserves class instances
2. **Iterate Changes**: For each key in the partial update:
   - If key is undefined/null in base: Set the new value
   - If registered merge function exists: Use custom merge strategy
   - If value is a class instance: Replace directly
   - If value is an array: Replace the entire array
   - If value is a plain object: Recursively merge
   - Otherwise: Replace the value

### Custom Merge Strategies

Graphs can register custom merge functions for specific schema fields:

```typescript
import { STATE_MERGE } from "@ellyco/agentic";

const schema = z.object({
  count: z.number().register(STATE_MERGE, {
    merge: (old: number, change: number) => old + change,
  }),
});
```

This enables:

- Additive merges (e.g., incrementing counters)
- Array concatenation (e.g., appending messages)
- Complex custom logic

### Clone-Aware Deep Cloning

The `cloneAware()` utility performs deep cloning while preserving:

- Class instances (not converted to plain objects)
- Circular references (handled safely)
- Special object types

This ensures nodes can mutate state without affecting the original, while
preserving object identity for classes.

## Checkpointing and Resumption

Graphs support pausing execution (interrupts) and resuming from checkpoints.
This enables long-running workflows and human-in-the-loop patterns.

### Cursor Encoding

Cursors encode the execution path through nested graphs:

```
"start.process.validate"
```

Format: `"node1.node2.node3"` where each segment is a node name at a different
layer depth.

### Interruption Flow

1. **Node Requests Interrupt**: `InterruptNode` calls
   `context.runtime.markInterrupted(message)`
2. **Execution Stops**: The execution loop detects interruption and breaks
3. **Cursor Saved**: `runtime.wrapCursor()` encodes the current path
4. **State Persisted**: If using a store, state and cursor are saved

### Resumption Flow

1. **Load Checkpoint**: Retrieve state and cursor from store (or use in-memory
   values)
2. **Restore Context**: `runtime.unwrapCursor(cursor)` recreates the layer stack
3. **Resume Execution**: Call `graph.invoke()` with `resumeFrom` option
4. **Continue**: Execution resumes from the interrupted node

### Storage Integration

The `BaseStore` interface enables persistence:

- **`SQLiteStore`**: SQLite-based persistence for production use
- **`StoredRun`**: Wrapper for interacting with individual runs

Stored runs can be resumed across:

- Different process invocations
- Server restarts
- Long time periods

## Graph Types

### StateMachine

The most flexible graph type:

- Manual node and edge definition
- Supports conditional edges for branching
- Full control over execution flow

**Implementation**: Directly uses graph state (no transformation)

### NodeSequence

Linear execution graph:

- Automatically wires edges between nodes
- No branching or conditional logic
- Simplified API for sequential workflows

**Implementation**: Directly uses graph state (no transformation)

### Iterator

Loops over an array in state:

- Manages index tracking automatically
- Extracts current item for looped node
- Handles iteration state internally

**Implementation**: Transforms state to include `index` and `item` fields:

- `{prefix}Index`: Current iteration index
- `{prefix}Item`: Current item from array

## Node Types

### FunctionNode

Executes a synchronous or asynchronous function:

- Receives state and context
- Returns partial state updates
- Can throw errors to stop execution

**Helper**: `makeNode()` provides type inference

### ModelNode

Invokes an AI model:

- Constructs messages from state (function or state path)
- Invokes model with messages
- Stores response in state at specified key

**Supports**: Both regular models and `StructuredOutputWrapper`

### InterruptNode

Pauses execution:

- Sets interruption flag in runtime
- Stores exit message
- Allows resumption from checkpoint

### StateTransformNode

Transforms state between different schemas, allowing nested nodes/graphs to
operate on a different state structure than the parent graph.

**Key Features**:

- **Input Transformation**: Converts parent state to child state schema before
  execution
- **Schema Validation**: Validates transformed state against child schema
- **Output Transformation**: Converts child state back to parent state updates
  after execution
- **Interrupt Handling**: Preserves wrapped state during interrupts for
  resumption
- **State Isolation**: Child state is stored separately during execution

**Implementation Details**:

- Wraps a node or graph that expects a different state schema
- Uses `stateToNodeState` and `nodeStateToState` pattern internally
- Stores wrapped state under key `__wrappedState_{contextId}.{nodeName}` during
  interrupts
- Automatically cleans up wrapped state key on completion
- Attaches parent state reference to child state as `__parentState` for access

**Use Cases**:

- Reusing nodes/graphs with different state schemas
- Isolating state transformations within a workflow
- Composing graphs with incompatible state structures
- Normalizing state formats between different parts of a workflow

**Example Flow**:

```
Parent State (Schema A)
    ↓
inputTransform() → Child State (Schema B)
    ↓
Wrapped Node/Graph executes with Schema B
    ↓
outputTransform() → Partial Parent State (Schema A)
    ↓
Merged into Parent State
```

## OpenTelemetry Integration

Every node execution automatically creates an OpenTelemetry span:

**Span Attributes**:

- `runId`: Unique run identifier
- `nodeName`: Name of the executing node
- `layerId`: Context layer ID (for nested graphs)
- `changes`: JSON-stringified state changes
- `newState`: JSON-stringified complete state after merge

**Nested Traces**: When graphs call other graphs, spans form a hierarchical
structure matching the context layer stack.

## Error Handling

- **Node Errors**: Propagate up and stop execution
- **Validation Errors**: Zod schema validation errors are caught and re-thrown
  with context
- **Graph Structure Errors**: Validation happens before execution starts
- **Interrupts**: Not errors - normal flow control mechanism

## Type Safety

The library uses TypeScript generics and Zod schemas for end-to-end type safety:

- **Graph State**: Typed by Zod schema `T`
- **Node State**: Typed by generic `NS` (defaults to `S`)
- **Node Returns**: `Partial<S>` or `Partial<NS>`
- **State Merging**: Validated against schema at runtime

This ensures compile-time type checking while maintaining runtime validation.
