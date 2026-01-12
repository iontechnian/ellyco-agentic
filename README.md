# Ellyco Agentic

A powerful TypeScript framework for building stateful, agentic workflows with built-in support for AI model orchestration, tool usage, interruptions, and persistent checkpointing.

## Features

✨ **Graph-Based Execution Engine** - Define complex workflows as directed graphs with nodes and edges  
🤖 **AI Model Integration** - Built-in support for AWS Bedrock and custom model implementations  
🔧 **Tool Calling** - Seamless tool definition and execution with automatic validation  
⏸️ **Interrupts & Resumption** - Pause execution for human input or external events, then resume from checkpoint  
💾 **Persistent Checkpointing** - SQLite-based state persistence for long-running workflows  
🔄 **State Management** - Declarative state merging with support for custom merge strategies  
🔀 **Flexible Graphs** - State machines, linear sequences, and iterators for different workflow patterns  
📦 **Fully Typed** - Complete TypeScript support with Zod schema validation  
📊 **OpenTelemetry Observability** - Built-in distributed tracing for monitoring and debugging  

## Installation

```bash
npm install @ellyco/agentic
```

### Dependencies
- `zod` - Schema validation
- `@aws-sdk/client-bedrock-runtime` - For Bedrock model support
- `better-sqlite3` - For persistent storage
- `@paralleldrive/cuid2` - For run ID generation

## Quick Start

### 1. Define Your Messages

```typescript
import { SystemMessage, UserMessage, AgentMessage } from '@ellyco/agentic';

const systemMsg = new SystemMessage(
  "You are a helpful assistant that processes data."
);

const userMsg = new UserMessage("Process this data: {data}");

// Interpolate template variables
userMsg.interpolate({ data: "important info" });
```

### 2. Define Your Tools

```typescript
import { defineTool, tool } from '@ellyco/agentic';
import { z } from 'zod';

const searchTool = defineTool(
  "search",
  "Search for information",
  z.object({
    query: z.string(),
    limit: z.number().optional()
  })
);

const searchImplementation = tool(
  searchTool,
  async (input) => {
    // Implement search logic
    return { results: [...] };
  }
);
```

### 3. Configure Your Model

```typescript
import { BedrockModel } from '@ellyco/agentic';

const model = new BedrockModel({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  temperature: 0.7,
  maxTokens: 2048
})
  .withSystemMessage(systemMsg)
  .withTools([searchTool]);

const response = await model.invoke([userMsg]);
```

### 4. Build a Graph

```typescript
import { StateMachine, makeNode } from '@ellyco/agentic';
import { z } from 'zod';

const schema = z.object({
  input: z.string(),
  output: z.string().optional(),
  iterations: z.number().default(0)
});

const graph = new StateMachine(schema);

// Add nodes
graph.addNode("process", makeNode((state) => ({
  output: state.input.toUpperCase(),
  iterations: state.iterations + 1
})));

graph.addNode("validate", makeNode((state) => {
  if (state.output && state.output.length > 0) {
    return { output: state.output };
  }
  throw new Error("Invalid output");
}));

// Add edges
graph.addEdge("start", "process");
graph.addEdge("process", "validate");
graph.addEdge("validate", "end");

// Execute
const result = await graph.invoke({ input: "hello world" });
console.log(result.state.output); // "HELLO WORLD"
```

## Core Concepts

### Graphs

Graphs represent workflows as directed acyclic graphs (DAGs) where execution flows from node to node. Three main types:

#### StateMachine
The most flexible graph type - manually define nodes and edges with conditional routing.

```typescript
const sm = new StateMachine(schema);
sm.addNode("decision", decisionNode);
sm.addNode("path1", path1Node);
sm.addNode("path2", path2Node);

// Conditional edge - route based on state
sm.addConditionalEdge(
  "decision",
  ["path1", "path2"],
  (state) => state.priority > 5 ? "path1" : "path2"
);
```

#### NodeSequence
Execute nodes linearly, one after another.

```typescript
const sequence = new NodeSequence(schema);
sequence
  .next(node1)
  .next(node2)
  .next(node3);
```

#### Iterator
Loop over an array in state, executing a node for each item.

```typescript
const schema = z.object({
  items: z.array(z.object({ value: z.number() }))
});

const iterator = new Iterator(schema, "items", "item");
iterator.setLoopedNode(loopedNode);

const result = await iterator.invoke({ 
  items: [{ value: 1 }, { value: 2 }, { value: 3 }]
});
```

### Nodes

Nodes are the building blocks of graphs - they execute logic and return partial state updates.

#### FunctionNode
Simple synchronous or asynchronous functions.

```typescript
import { makeNode } from '@ellyco/agentic';

const node = makeNode((state, context) => ({
  processed: true,
  timestamp: Date.now()
}));
```

#### ModelNode
Invoke an AI model and capture the response.

```typescript
const modelNode = new ModelNode(model, {
  messages: (state, context) => [
    new UserMessage(state.userInput)
  ],
  output: "modelOutput"
});
```

#### InterruptNode
Pause execution for human input or external intervention.

```typescript
const confirmNode = new InterruptNode(
  "Please confirm the action before proceeding"
);
```

### Messages

Messages represent communication in the system with different roles:

```typescript
import { SystemMessage, UserMessage, AgentMessage } from '@ellyco/agentic';

// System messages set context
const system = new SystemMessage("You are a data analyst");

// User messages are requests
const user = new UserMessage("Analyze {dataset_name}");
user.interpolate({ dataset_name: "sales_data" });

// Agent messages are responses
const agent = new AgentMessage("The analysis shows...");
```

### Tool Usage

Tools enable models to request external operations. Define tools and attach them to models:

```typescript
import { defineTool } from '@ellyco/agentic';
import { z } from 'zod';

// Define a tool with input schema
const weatherTool = defineTool(
  "get_weather",
  "Get current weather for a location",
  z.object({
    location: z.string(),
    unit: z.enum(["celsius", "fahrenheit"]).optional()
  })
);

// Attach tool to model
const model = new BedrockModel({ modelId: "..." })
  .withTools([weatherTool]);

// When you invoke the model, it can request tool usage
// The model's response will include ToolRequest messages that you can handle
const response = await model.invoke([
  new UserMessage("What's the weather in San Francisco?")
]);

// Check for tool requests in the response
for (const message of response.messages) {
  if (message instanceof ToolRequest) {
    // Execute the tool based on message.name and message.input
    // Then add ToolResponse or ToolError back to the conversation
  }
}
```

### State Management

State flows through graphs, with each node returning partial updates that are automatically merged:

```typescript
const schema = z.object({
  count: z.number(),
  items: z.array(z.string()),
  status: z.string().optional()
});

const graph = new StateMachine(schema);

// Node 1: Sets initial values
graph.addNode("init", makeNode((state) => ({
  count: 0,
  items: ["a", "b"]
})));

// Node 2: Updates count and adds items
graph.addNode("update", makeNode((state) => ({
  count: state.count + 1,
  items: [...state.items, "c"]
})));

// Node 3: Sets status
graph.addNode("finalize", makeNode((state) => ({
  status: `Processed ${state.count} items`
})));

// State evolves: {count: 0, items: ["a","b"]} 
//            → {count: 1, items: ["a","b","c"]} 
//            → {count: 1, items: ["a","b","c"], status: "Processed 1 items"}
```

## Advanced Features

### Interrupts and Resumption

Pause execution for human input and resume from the checkpoint:

```typescript
// Start execution
let result = await graph.invoke({ data: "..." });

if (result.exitReason === "interrupt") {
  console.log("Paused:", result.exitMessage);
  console.log("Run ID:", result.runId);
  console.log("Cursor:", result.cursor);
  
  // Get user confirmation...
  
  // Resume from checkpoint
  const result2 = await graph.invoke(
    result.state,
    { resumeFrom: result.cursor }
  );
}
```

### Persistent Storage

Use SQLite to persist and resume runs across sessions:

```typescript
import { SQLiteStore } from '@ellyco/agentic';
import Database from 'better-sqlite3';

// Setup database
const db = new Database("runs.db");
const store = new SQLiteStore(db, "graph_runs");

// Run with persistence
let result = await graph.invoke(initialState, { store });

if (result.exitReason === "interrupt") {
  // Later, in a different process:
  const db2 = new Database("runs.db");
  const store2 = new SQLiteStore(db2, "graph_runs");
  
  // Resume from stored checkpoint
  const result2 = await graph.invoke(result.state, {
    store: store2,
    runId: result.runId
  });
}

await store.dispose();
```

### Structured Output

Force models to return data in a specific format:

```typescript
import { z } from 'zod';

const schema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
  explanation: z.string()
});

const wrapper = model.withStructuredOutput(schema);
const result = await wrapper.invoke([userMessage]);

// TypeScript knows result matches the schema
console.log(result.sentiment);     // string enum
console.log(result.confidence);    // number 0-1
console.log(result.explanation);   // string
```

### Custom Models

Implement your own model provider by extending `BaseModel`:

```typescript
import { 
  BaseModel, 
  InvokeResponse, 
  InvokeResponseStopReason,
  ModelMessages 
} from '@ellyco/agentic';

class MyCustomModel extends BaseModel {
  protected async runModel(
    messages: ModelMessages[]
  ): Promise<InvokeResponse> {
    // Your API integration here
    const response = await fetch("your-api/v1/chat", {
      method: "POST",
      body: JSON.stringify({ messages })
    });
    
    const data = await response.json();
    
    return {
      messages: data.messages, // Array of AgentMessage or ToolRequest
      usage: { 
        inputTokens: data.usage.inputTokens, 
        outputTokens: data.usage.outputTokens 
      },
      stopReason: InvokeResponseStopReason.END_TURN
    };
  }
}

const model = new MyCustomModel({ temperature: 0.7 })
  .withSystemMessage("You are helpful")
  .withTools([myTool]);
```

### Testing with TestModel

Use the mock model for testing without hitting real APIs:

```typescript
import { TestModel, TestResponseConfig } from '@ellyco/agentic';

const testModel = new TestModel({ temperature: 0.7 });

// Configure expected responses
const config = new TestResponseConfig()
  .userSends([new UserMessage("Hello")])
  .respondWith([new AgentMessage("Hi there!")]);

testModel.addTestConfig(config);

// In tests
const response = await testModel.invoke([new UserMessage("Hello")]);
expect(response.messages[0].text).toBe("Hi there!");
```

### OpenTelemetry Traces

Graphs automatically emit OpenTelemetry traces for observability and debugging. Each node execution is captured as a span with rich context and state information.

#### Setup

OpenTelemetry is included as a dependency. Configure a tracer provider and exporter in your application:

```typescript
import { BasicTracerProvider, ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';

// Create a basic tracer provider
const provider = new BasicTracerProvider();
provider.addSpanProcessor(
  new SimpleSpanProcessor(new ConsoleSpanExporter())
);

// For production, use a real exporter (Jaeger, OTLP, etc.)
// const exporter = new OTLPTraceExporter({
//   url: 'http://localhost:4317/v1/traces'
// });
// provider.addSpanProcessor(new BatchSpanProcessor(exporter));

// Set the global tracer provider
import { trace } from '@opentelemetry/api';
trace.setGlobalTracerProvider(provider);
```

#### Automatic Span Collection

Every node execution in a graph automatically creates a span with:

- **Span name**: Node name (e.g., "process", "validate", "search")
- **Attributes**:
  - `runId` - Unique identifier for the graph run
  - `nodeName` - Name of the node being executed
  - `layerId` - Context layer ID (for nested graphs)
  - `changes` - JSON-stringified state changes from the node
  - `newState` - JSON-stringified complete state after merge

```typescript
// When this node runs, a span is automatically created
graph.addNode("process", makeNode((state) => {
  return { processed: true, count: state.count + 1 };
}));

// Span details:
// {
//   name: "process",
//   attributes: {
//     runId: "run-abc123",
//     nodeName: "process",
//     layerId: "ROOT",
//     changes: '{"processed":true,"count":6}',
//     newState: '{"input":"hello","processed":true,"count":6}'
//   }
// }
```

#### Viewing Traces

**Console Output**:
Simple tracing for development:
```typescript
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
```

**Jaeger Integration**:
Visualize traces in real-time:
```typescript
import { JaegerExporter } from '@opentelemetry/exporter-trace-jaeger-http';

const exporter = new JaegerExporter({
  serviceName: 'ellyco-agentic',
  host: 'localhost',
  port: 6831
});

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
```

Then access the Jaeger UI at `http://localhost:16686`

**OTLP Export**:
Export traces to any OTLP-compatible backend:
```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4317/v1/traces'
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter));
```

#### Debugging with Traces

Traces are invaluable for:
- **Performance analysis** - Identify slow nodes
- **State debugging** - See how state evolves through the graph
- **Error investigation** - Track state at each step before failure
- **Production monitoring** - Monitor graph executions in real-time

When graphs call other graphs (nested execution), traces automatically show the hierarchical structure with layer IDs, making it easy to understand the execution flow.

## API Reference

This is a high-level overview. For detailed API documentation, see the JSDoc comments in the source code.

### Graph Classes

- **`StateMachine<T, S>`** - Flexible graph with manual node/edge definition
- **`NodeSequence<T, S>`** - Linear graph executing nodes in sequence
- **`Iterator<Item, T, Prefix, S, NS>`** - Loop over array items

### Node Classes

- **`FunctionNode<T>`** - Execute a function (or use `makeNode()` helper)
- **`ModelNode<T>`** - Invoke an AI model and store response in state
- **`InterruptNode<T>`** - Pause execution for external input

### Message Classes

- **`SystemMessage`** - System context message
- **`UserMessage`** - User request message (supports template interpolation)
- **`AgentMessage`** - Agent response message
- **`ToolRequest<T>`** - Tool invocation request from models
- **`ToolResponse<T>`** - Tool execution result
- **`ToolError`** - Tool execution error

### Model Classes

- **`BaseModel`** - Abstract base class for custom model implementations
- **`BedrockModel`** - AWS Bedrock integration
- **`TestModel`** - Mock model for testing

### Storage Classes

- **`SQLiteStore`** - SQLite-based persistence for checkpoints
- **`StoredRun`** - Wrapper for interacting with a specific run's stored state

## Complete Example

Here's a complete example combining all concepts:

```typescript
import {
  StateMachine,
  BedrockModel,
  ModelNode,
  makeNode,
  UserMessage,
  SystemMessage,
  SQLiteStore,
  defineTool
} from '@ellyco/agentic';
import { z } from 'zod';
import Database from 'better-sqlite3';

// Define schema
const schema = z.object({
  query: z.string(),
  searchResults: z.array(z.string()).default([]),
  summary: z.string().optional(),
  attempts: z.number().default(0)
});

// Define tool
const searchTool = defineTool(
  "search",
  "Search for information",
  z.object({ query: z.string() })
);

// Setup model
const model = new BedrockModel({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  temperature: 0.7
})
  .withSystemMessage("You are a research assistant.")
  .withTools([searchTool]);

// Build graph
const graph = new StateMachine(schema);

graph.addNode("search", makeNode((state) => ({
  searchResults: ["Result 1", "Result 2", "Result 3"],
  attempts: state.attempts + 1
})));

graph.addNode("analyze", new ModelNode(model, {
  messages: (state) => [
    new UserMessage(`Summarize these results: ${state.searchResults.join(", ")}`)
  ],
  output: "summary"
}));

graph.addEdge("start", "search");
graph.addEdge("search", "analyze");
graph.addEdge("analyze", "end");

// Setup storage
const db = new Database("research.db");
const store = new SQLiteStore(db);

// Execute
const result = await graph.invoke(
  { query: "climate change" },
  { store }
);

console.log("Status:", result.exitReason);
console.log("Results:", result.state.searchResults);
console.log("Summary:", result.state.summary);

db.close();
```

## License

MIT

---

**Questions?** Check out the comprehensive JSDoc comments throughout the codebase for detailed API documentation and examples!
