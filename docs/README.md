# Zynapse Documentation

Zynapse is a TypeScript library for building type-safe, schema-first APIs with automatic client code generation. It provides a complete solution for defining API schemas, implementing server handlers, and generating type-safe React hooks for frontend consumption.

## Quick Links

- [Schema Builder Guide](./SCHEMA_BUILDER.md) - Learn how to define API schemas
- [Server Implementation Guide](./SERVER_IMPLEMENTATION.md) - Learn how to implement server handlers
- [Example Project](../examples/) - See working examples

## Core Features

### Schema-First Design

Define your API once using Zod schemas, and Zynapse handles the rest:

```typescript
const todoService = new Service("Todo")
  .addProcedure({
    method: "QUERY",
    name: "GetTodos",
    description: "Retrieves all todos",
    input: z.object({ limit: z.number() }),
    output: z.object({ todos: z.array(...) })
  });
```

### Four Procedure Types

1. **QUERY** - Read operations using HTTP GET
2. **MUTATION** - Write operations using HTTP POST
3. **SUBSCRIPTION** - Real-time server-to-client updates using Server-Sent Events
4. **BIDIRECTIONAL** - Two-way real-time communication using WebSocket

### Type-Safe Server Implementation

Implement handlers with full type safety:

```typescript
const implementation = new ServiceImplementationBuilder(todoService)
  .registerProcedureImplementation("GetTodos", async (input) => {
    // input is typed based on schema
    return { todos: await db.getTodos(input.limit) };
  })
  .build();
```

### Automatic Client Code Generation

Generate React hooks for all procedures:

```bash
zynapse-cli -I ./backend/src/api.schema.ts -O ./frontend/src/_generated
```

Use in your components:

```typescript
const { data } = useTodoGetTodosQuery({ limit: 10 });
const createTodo = useTodoCreateTodoMutation();

// With custom headers for authentication
const { data } = useTodoGetTodosQuery(
  { limit: 10 },
  {},
  { "Authorization": "Bearer token123" }
);
```

## Documentation Overview

### [Schema Builder Guide](./SCHEMA_BUILDER.md)

Learn how to define API schemas including:

- Creating services and procedures
- Using Zod for input/output validation
- Working with all four procedure types
- Implementing middleware and authentication
- Best practices for schema design
- Client-side code generation patterns

### [Server Implementation Guide](./SERVER_IMPLEMENTATION.md)

Learn how to implement server handlers including:

- API endpoint structure
- Implementing procedure handlers for each type
- Working with middleware and context
- Handling subscriptions and WebSocket connections
- Cookie management
- Webhook integration
- Complete working examples

## Getting Started

1. **Install Zynapse**

```bash
bun add zynapse
```

2. **Define Your Schema**

Create a schema file (e.g., `api.schema.ts`):

```typescript
import { APISchema, Service } from "zynapse/schema";
import { z } from "zod";

const myService = new Service("MyService")
  .addProcedure({
    method: "QUERY",
    name: "Hello",
    description: "Says hello",
    input: z.object({ name: z.string() }),
    output: z.object({ message: z.string() })
  });

export default new APISchema({
  MyService: myService
});
```

3. **Implement Server Handlers**

```typescript
import { Server, ServiceImplementationBuilder } from "zynapse/server";
import apiSchema from "./api.schema";

const implementation = new ServiceImplementationBuilder(apiSchema.services.MyService)
  .registerProcedureImplementation("Hello", async (input) => {
    return { message: `Hello, ${input.name}!` };
  })
  .build();

const server = new Server(apiSchema, {
  MyService: implementation
});

server.start(3000);
```

4. **Generate Client Code**

```bash
zynapse-cli -I ./api.schema.ts -O ./frontend/src/_generated
```

5. **Use in Your React App**

```typescript
import { useMyServiceHelloQuery } from "./_generated/myservice.service";

function App() {
  const { data } = useMyServiceHelloQuery({ name: "World" });
  return <div>{data?.message}</div>;
}
```

## Architecture

```
┌─────────────────────┐
│   API Schema        │  Define once using Zod
│   (api.schema.ts)   │
└──────────┬──────────┘
           │
           ├─────────────────┐
           │                 │
           ▼                 ▼
┌──────────────────┐  ┌──────────────────┐
│  Server          │  │  Client Code     │
│  Implementation  │  │  Generation      │
│                  │  │                  │
│  • Handlers      │  │  • React Hooks   │
│  • Middleware    │  │  • Type Safety   │
│  • Validation    │  │  • TanStack      │
│                  │  │    Query         │
└──────────────────┘  └──────────────────┘
```

## HTTP Methods and Transport

| Procedure Type | HTTP Method | Data Location | Transport | Use Case |
|---------------|-------------|---------------|-----------|----------|
| QUERY | GET | URL params | HTTP | Read data |
| MUTATION | POST | Request body | HTTP | Write data |
| SUBSCRIPTION | GET (upgrade) | URL params | SSE | Stream updates |
| BIDIRECTIONAL | GET (upgrade) | Messages | WebSocket | Two-way communication |

## Example Endpoints

All procedures are accessed via the pattern `/_api/:service/:procedure`:

```
GET  /_api/Todo/GetTodos?payload={"limit":10}
POST /_api/Todo/CreateTodo
     Body: {"title":"New Todo"}
GET  /_api/Todo/WatchTodos?payload={"filter":"all"}
     (Upgrades to Server-Sent Events)
GET  /_api/Todo/CollaborateTodo
     (Upgrades to WebSocket)
```

## Real-World Example

Check out the [ZilverProjectTemplate](https://github.com/your-repo/ZilverProjectTemplate) for a complete example featuring:

- Todo service with all 4 procedure types
- Full backend implementation
- React frontend with generated hooks
- Authentication and middleware
- Real-time subscriptions
- WebSocket collaboration

## Key Benefits

1. **Type Safety** - End-to-end type safety from schema to implementation to client
2. **Schema First** - Define your API contract once, generate everything else
3. **Real-time Support** - Built-in support for SSE and WebSocket
4. **Developer Experience** - Full autocomplete and compile-time validation
5. **Productivity** - Automatic code generation eliminates boilerplate
6. **Flexible Authentication** - Custom headers support for QUERY and MUTATION requests

## Contributing

Zynapse is under active development. For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/your-repo/zynapse).

## License

MIT
