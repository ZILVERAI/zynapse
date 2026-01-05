# Zynapse Server Implementation Guide

This guide explains how to implement server-side handlers for an existing Zynapse API schema. We'll focus on implementing procedures defined in `@/api.schema.ts`.

## Overview

Zynapse follows a schema-first approach where the API schema is already defined in your codebase. The implementation workflow consists of:

1. Import the existing schema from `@/api.schema.ts`
2. Implement procedure handlers for each defined procedure
3. Create a server instance and start it

## API Endpoint Structure

Zynapse uses a RESTful URL structure for all procedures:

```
/_api/:service/:procedure
```

For example:
- `/_api/Users/GetUserById` - Calls the GetUserById procedure in the Users service
- `/_api/Todos/CreateTodo` - Calls the CreateTodo procedure in the Todos service

### HTTP Methods by Procedure Type

Different procedure types use different HTTP methods:

| Procedure Type | HTTP Method | Data Location | Transport |
|---------------|-------------|---------------|-----------|
| QUERY | GET | URL query parameters | HTTP |
| MUTATION | POST | Request body | HTTP |
| SUBSCRIPTION | GET (upgrade) | URL query parameters | Server-Sent Events |
| BIDIRECTIONAL | GET (upgrade) | WebSocket messages | WebSocket |

**QUERY Example:**
```
GET /_api/Users/GetUserById?payload={"id":"123"}
```

**MUTATION Example:**
```
POST /_api/Todos/CreateTodo
Body: {"title":"New Todo"}
```

## Implementing Server Logic

### Step 1: Import Dependencies and Schema

```typescript
import { Server, ServiceImplementationBuilder } from "zynapse/server";
import apiSchema from "@/api.schema.ts";
```

### Step 2: Explore the Schema Structure

The schema in `@/api.schema.ts` defines your API contract with services and procedures. Before implementation, review the schema to understand:

- Available services
- Procedures in each service
- Input/output types for each procedure
- Middleware requirements

### Step 3: Implement Service Handlers

For each service in your schema, create a service implementation:

```typescript
// Implement the Users service
const usersImplementation = new ServiceImplementationBuilder(apiSchema.services.Users)
  .registerProcedureImplementation("GetUserById", async (input, request) => {
    // Implementation logic here
    console.log(`Getting user with ID: ${input.id}`);
    
    // Return data matching the output schema
    return {
      id: input.id,
      name: "Example User",
      email: "user@example.com"
    };
  })
  // Implement other procedures in the Users service...
  .build(); // IMPORTANT: Always call .build() to finalize the implementation
```

> **REMINDER**: Always call the `.build()` method after registering all procedure implementations. The server requires the built implementation, not the builder.

### Step 4: Initialize and Start the Server

```typescript
const server = new Server(apiSchema, {
  // Include all service implementations
  Users: usersImplementation,
  // Add other service implementations...
});

// Start the server on the default port (3000)
server.start();
```

## Working with Procedure Handlers

### Procedure Types

Zynapse supports four types of procedure methods with different transport mechanisms:

1. **QUERY** - For retrieving data (read operations, uses HTTP GET with parameters in URL)
2. **MUTATION** - For modifying data (write operations, uses HTTP POST with data in request body)
3. **SUBSCRIPTION** - For streaming data from server to client with real-time updates (uses Server-Sent Events)
4. **BIDIRECTIONAL** - For full two-way WebSocket communication between server and client

### Type-Safe Implementation

Procedure handlers are fully type-safe based on the schema definition in `@/api.schema.ts`:

```typescript
.registerProcedureImplementation("GetUserById", async (input, request) => {
  // Input is typed according to the schema definition
  const userId = input.id;
  
  // Your IDE will provide autocomplete for the expected return type
  return {
    id: userId,
    name: "User Name",
    email: "user@example.com"
  };
})
```

### Access to Request and Context Objects

All procedure handlers receive the original HTTP Request as the second parameter and the context as the third parameter:

```typescript
.registerProcedureImplementation("GetUserById", async (input, request, context) => {
  // Access request properties
  const cookies = request.cookies; // Direct access to cookies
  const userAgent = request.headers.get("user-agent");
  
  // Access context data set by middleware
  const currentUser = context.get("user");
  
  // Implementation logic...
})
```

The context object is passed from middleware to procedure handlers, allowing you to share data between them.

### Error Handling

Throw errors within your procedure handlers to indicate failures:

```typescript
.registerProcedureImplementation("GetUserById", async (input, request) => {
  // Input validation
  if (!isValidUUID(input.id)) {
    throw new Error("Invalid user ID format");
  }
  
  // Database operations
  const user = await db.users.findById(input.id);
  if (!user) {
    throw new Error("User not found");
  }
  
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
})
```

## Implementing Middleware

If the schema in `@/api.schema.ts` includes services with middleware descriptions, you must implement the middleware. Zynapse provides a `MiddlewareFunction` type for type-safe middleware implementations.

### Method 1: Inline Middleware Implementation

```typescript
import { ServiceImplementationBuilder } from "zynapse/server";

// For a service with a middleware description in the schema
const protectedServiceImplementation = new ServiceImplementationBuilder(apiSchema.services.ProtectedResource)
  // Define middleware that runs before each procedure in this service
  .setMiddleware(async (request, procedureName, context) => {
    // The middleware receives information about which procedure is being called
    console.log(`Procedure being called: ${procedureName}`);
    
    // Check authentication
    if (!request.cookies.get("auth_session")) {
      throw new Error("Unauthorized");
    }

    // Validate session
    const sessionToken = request.cookies.get("auth_session");
    const session = await validateSession(sessionToken);
    if (!session) {
      throw new Error("Invalid session");
    }
    
    // You can add data to the context for use in the procedure handler
    // The context is a Map that can be used to pass data to procedures
    context.set("user", session.user);
  })
  // Implement all procedures...
  .build();
```

### Method 2: Using the MiddlewareFunction Type

You can also define your middleware separately with proper typing:

```typescript
import { MiddlewareFunction, ServiceImplementationBuilder } from "zynapse/server";

// Create a type-safe middleware function
const authMiddleware: MiddlewareFunction = async (request, procedureName, context) => {
  // Middleware implementation
  console.log(`Procedure being called: ${procedureName}`);
  
  if (!request.cookies.get("auth_session")) {
    throw new Error("Unauthorized");
  }
  
  // Process authentication and set context data
  const user = await validateUser(request.cookies);
  context.set("user", user);
};

// For a service with a middleware description in the schema
const protectedServiceImplementation = new ServiceImplementationBuilder(apiSchema.services.ProtectedResource)
  // Use the separately defined middleware
  .setMiddleware(authMiddleware)
  // Implement all procedures...
  .build();
```

### Understanding Middleware Parameters

The middleware function receives three parameters:

1. `request`: The HTTP request object from Bun
2. `procedureName`: A string indicating which procedure is being called
3. `context`: A Map object that can be used to share data with the procedure handler

For proper type safety, you can import the `MiddlewareFunction` type from Zynapse:

```typescript
import { MiddlewareFunction } from "zynapse/server";

// Type-safe middleware implementation
const myMiddleware: MiddlewareFunction = async (request, procedureName, context) => {
  // Middleware implementation
  if (!request.cookies.get("auth_token")) {
    throw new Error("Authentication required");
  }
  
  // Add data to context for procedure handlers
  context.set("userId", "123");
};
```

### Using the Context Object

The context object is a Map that allows middleware to pass data to procedure handlers:

```typescript
// In middleware
.setMiddleware(async (request, procedureName, context) => {
  // Add user data to context
  context.set("user", { id: '123', role: 'admin' });
  
  // You can conditionally execute logic based on the procedure
  if (procedureName === "DeleteAccount") {
    // Apply stricter validation for sensitive operations
    context.set("requiresReauth", true);
  }
})

// In procedure implementation
.registerProcedureImplementation("UpdateSettings", async (input, request, context) => {
  // Access the user data set by middleware
  const user = context.get("user");
  
  // Use the context data in your implementation
  if (user.role !== 'admin') {
    throw new Error('Insufficient permissions');
  }
  
  return { success: true };
})
```

The context persists only for the lifetime of the request, ensuring data isolation between different requests.

## Implementing SUBSCRIPTION Procedures

SUBSCRIPTION procedures enable real-time data streaming between the server and client. They differ from regular QUERY and MUTATION procedures in that they maintain an open connection to continuously send data updates. All SUBSCRIPTION procedures MUST use the provided `connection` parameter and MUST return `undefined` (no return value).

### Basic Structure

```typescript
.registerProcedureImplementation(
  "StreamedData",
  async (input, request, context, connection) => {
    // The fourth parameter 'connection' is available only for SUBSCRIPTION procedures
    // It provides methods to send data to the client
    
    // Send initial data
    await connection.write({
      data: [{ id: 1, value: "Initial value" }]
    });
    
    // You can send multiple updates over time
    setTimeout(async () => {
      await connection.write({
        data: [{ id: 2, value: "Updated value" }]
      });
    }, 1000);
    
    // Register a callback for when the connection closes
    connection.onClose(() => {
      console.log("Connection closed - cleaning up resources");
      // Perform any necessary cleanup when the connection is closed
      // For example: clear intervals, remove event listeners, etc.
    });
    
    // You can also manually close the connection when needed
    setTimeout(() => {
      connection.close(); // This will trigger the onClose callback
    }, 5000);
  }
)
```

### Connection Object

The `connection` object provides the following methods:

1. `write(data)` - Sends data to the client that matches the output schema (this is an async function and **MUST BE** awaited)
2. `close()` - Closes the connection with the client
3. `onClose(callback)` - Registers a callback function to be executed when the connection is closed

The `onClose` method is particularly useful for resource cleanup when the client disconnects or when the connection is closed by the server. This ensures your application properly manages resources and prevents memory leaks.

### Use Cases for SUBSCRIPTION Procedures

- Real-time dashboards with continuously updating metrics
- Chat applications where messages arrive in real-time
- Event logs and activity feeds
- Live data visualization
- Progress updates for long-running operations

### Example: Implementing a Real-Time Data Stream

```typescript
.registerProcedureImplementation(
  "StreamMetrics",
  async (input, request, context, connection) => {
    // Access the input parameters
    const { interval = 1000 } = input;
    
    // Initialize data source
    const metrics = initializeMetricsCollector();
    
    // Set up an interval to send updates
    const intervalId = setInterval(async () => {
      const currentMetrics = metrics.getCurrentValues();
      
      // Send the updated metrics to the client
      await connection.write({
        timestamp: new Date(),
        values: currentMetrics
      });
    }, interval);
    
    // Set up cleanup for when the connection closes
    connection.onClose(() => {
      console.log("Metrics stream connection closed");
      clearInterval(intervalId); // Clean up the interval when connection closes
    });
    
    // Auto-close after 1 minute as a safety measure
    setTimeout(() => {
      connection.close(); // This will trigger the onClose callback
    }, 60000);
  }
)
```

### Important Notes About SUBSCRIPTION Procedures

1. SUBSCRIPTION procedures receive a fourth parameter (`connection`) not available in QUERY/MUTATION procedures
2. The `connection` parameter MUST be used in all subscription methods
3. SUBSCRIPTION procedures MUST always return `undefined` (do not return any values)
4. The procedure function should set up any necessary intervals or event listeners for data updates
5. Always implement proper cleanup to avoid memory leaks using the `connection.onClose()` method
6. Data sent via `connection.write()` must conform to the output schema defined in your API schema
7. The client will receive each data update as a separate message
8. The `connection.write()` method is async and **MUST BE** awaited in all cases
8. SUBSCRIPTION connections are automatically closed when the client disconnects

### Best Practices for Connection Cleanup

Always use the `connection.onClose()` method to handle resource cleanup:

```typescript
// Register cleanup logic that runs when the connection is closed
connection.onClose(() => {
  // 1. Clear any intervals
  clearInterval(myInterval);
  
  // 2. Remove event listeners
  myEventEmitter.off('myEvent', myEventHandler);
  
  // 3. Close any open database connections or streams
  myDatabaseConnection.release();
  
  // 4. Log the disconnection for monitoring/debugging
  console.log('Client disconnected, cleaned up resources');
});
```

Benefits of using the `onClose` method:
- Ensures cleanup happens regardless of how the connection is closed (client disconnect, server shutdown, timeout, etc.)
- Centralizes cleanup logic in one place
- Prevents memory leaks and resource exhaustion
- Makes code more maintainable and easier to debug

## Implementing BIDIRECTIONAL Procedures

BIDIRECTIONAL procedures enable full two-way WebSocket communication between the server and client. Unlike SUBSCRIPTION procedures which only stream data from server to client, BIDIRECTIONAL procedures allow both parties to send messages at any time, making them ideal for interactive real-time applications.

### Basic Structure

```typescript
.registerProcedureImplementation(
  "ChatRoom",
  async (initialRequest, connection, context) => {
    // The handler receives three parameters:
    // - initialRequest: The original HTTP request that initiated the WebSocket upgrade
    // - connection: A BidirectionalConnection object for two-way communication
    // - context: Context data set by middleware

    // Register message handlers for incoming client messages
    connection.addOnMessageListener({
      name: "MessageHandler",
      callback: async (conn, msg) => {
        // msg is typed according to the input schema
        console.log(`Received message: ${msg.content}`);

        // Send a response back to the client
        await conn.sendMessage({
          status: "received",
          timestamp: new Date().toISOString()
        });
      }
    });

    // BIDIRECTIONAL procedures MUST return undefined
  }
)
```

### Connection Object

The `connection` object (`BidirectionalConnection`) provides the following methods:

1. `sendMessage(data)` - Sends data to the client that matches the output schema
2. `addOnMessageListener(callable)` - Registers a callback function to handle incoming messages from the client
3. `close(reason?)` - Manually closes the WebSocket connection with an optional reason string
4. `addOnCloseMessageListener(callback)` - Registers a callback function to be executed when the connection is closed

### Message Listener Structure

When adding message listeners, you provide an object with:

```typescript
{
  name: string;              // A unique name for debugging purposes
  callback: (conn, msg) => Promise<void>;  // The handler function
}
```

The callback receives:
- `conn`: The BidirectionalConnection object (allows sending responses)
- `msg`: The incoming message, typed according to the input schema

### Closing Connections and Cleanup

BIDIRECTIONAL connections can be closed either by the client disconnecting or by the server calling `close()`. Use `addOnCloseMessageListener()` to handle cleanup when the connection ends.

```typescript
.registerProcedureImplementation(
  "ChatRoom",
  async (initialRequest, connection, context) => {
    const userId = context.get("userId");

    // Register cleanup logic that runs when the connection is closed
    connection.addOnCloseMessageListener(async (conn) => {
      console.log(`User ${userId} disconnected`);

      // Clean up resources
      chatRooms.removeUser(userId);
      await notifyOtherUsers(userId, "left");
    });

    connection.addOnMessageListener({
      name: "MessageHandler",
      callback: async (conn, msg) => {
        if (msg.type === "leave") {
          // Server-initiated close with a reason
          await conn.close("User requested to leave");
          return;
        }

        // Handle other messages...
      }
    });
  }
)
```

The `addOnCloseMessageListener` callback:
- Receives the `BidirectionalConnection` object as its parameter
- Is called regardless of how the connection was closed (client disconnect, server `close()`, or network error)
- Can be used to clean up intervals, remove event listeners, update user status, etc.

### Input and Output Schemas

For BIDIRECTIONAL procedures:
- **Input schema**: Defines the structure of messages FROM the client TO the server
- **Output schema**: Defines the structure of messages FROM the server TO the client

```typescript
.addProcedure({
  method: "BIDIRECTIONAL",
  name: "ChatRoom",
  description: "Real-time chat room",
  input: z.object({
    // Structure of client-to-server messages
    type: z.enum(["join", "message", "typing"]),
    roomId: z.string().optional(),
    content: z.string().optional(),
    isTyping: z.boolean().optional()
  }),
  output: z.object({
    // Structure of server-to-client messages
    type: z.enum(["joined", "message", "ack", "typing"]),
    from: z.string().optional(),
    content: z.string().optional(),
    timestamp: z.string()
  })
})
```

### Use Cases for BIDIRECTIONAL Procedures

- Real-time chat applications
- Multiplayer games with live interactions
- Collaborative editing (documents, whiteboards)
- Interactive dashboards with user inputs
- Live auctions or trading platforms
- Remote control applications

### Example: Implementing a Chat Room

```typescript
.registerProcedureImplementation(
  "ChatRoom",
  async (initialRequest, connection, context) => {
    // Get user info from context (set by middleware)
    const userId = context.get("userId");

    // Track which room this user joins (set when they send a "join" message)
    let currentRoomId: string | null = null;

    // Handle incoming messages from this client
    connection.addOnMessageListener({
      name: "ChatMessageHandler",
      callback: async (conn, msg) => {
        // Handle different message types
        switch (msg.type) {
          case "join":
            // Client sends room ID via WebSocket message to join a room
            currentRoomId = msg.roomId;
            chatRooms.addConnection(currentRoomId, userId, conn);

            // Acknowledge the join
            await conn.sendMessage({
              type: "joined",
              timestamp: new Date().toISOString()
            });
            break;

          case "message":
            if (!currentRoomId) {
              // User hasn't joined a room yet
              return;
            }

            console.log(`User ${userId} sent: ${msg.content}`);

            // Broadcast to other users in the room
            const otherConnections = chatRooms.getOtherConnections(currentRoomId, userId);
            for (const otherConn of otherConnections) {
              await otherConn.sendMessage({
                type: "message",
                from: userId,
                content: msg.content,
                timestamp: new Date().toISOString()
              });
            }

            // Acknowledge receipt to sender
            await conn.sendMessage({
              type: "ack",
              timestamp: new Date().toISOString()
            });
            break;

          case "typing":
            if (!currentRoomId) return;

            // Broadcast typing indicator to other users
            const roomConnections = chatRooms.getOtherConnections(currentRoomId, userId);
            for (const otherConn of roomConnections) {
              await otherConn.sendMessage({
                type: "typing",
                from: userId,
                timestamp: new Date().toISOString()
              });
            }
            break;
        }
      }
    });

    // BIDIRECTIONAL procedures MUST return undefined
  }
)
```

### Example: Real-Time Game State

```typescript
.registerProcedureImplementation(
  "GameSession",
  async (initialRequest, connection, context) => {
    const playerId = context.get("playerId");
    let gameId: string | null = null;

    connection.addOnMessageListener({
      name: "GameHandler",
      callback: async (conn, msg) => {
        switch (msg.type) {
          case "joinGame":
            // Player joins a game by sending a message with the game ID
            gameId = msg.gameId;
            gameEngine.addPlayer(gameId, playerId, conn);

            // Send initial game state
            const initialState = await gameEngine.getState(gameId);
            await conn.sendMessage({
              type: "gameState",
              state: initialState
            });
            break;

          case "action":
            if (!gameId) return;

            // Process the player's action
            const result = await gameEngine.processAction(gameId, playerId, msg.action);

            // Send the result back to this player
            await conn.sendMessage({
              type: "actionResult",
              success: result.success,
              newState: result.state
            });

            // Broadcast state update to all other players
            await broadcastGameState(gameId, playerId, result.state);
            break;
        }
      }
    });

    // BIDIRECTIONAL procedures MUST return undefined
  }
)
```

### Important Notes About BIDIRECTIONAL Procedures

1. BIDIRECTIONAL procedures receive three parameters: `initialRequest`, `connection`, and `context`
2. The `connection` parameter MUST be used to handle WebSocket communication
3. BIDIRECTIONAL procedures MUST always return `undefined` (do not return any values)
4. Messages sent via `sendMessage()` must conform to the output schema defined in your API schema
5. Incoming messages received in the callback must conform to the input schema
6. You can register multiple message listeners for different handling logic
7. The listener `name` property is used for debugging and error messages
8. Errors in message handlers are caught and logged automatically
9. Use `close(reason?)` to programmatically close the connection from the server side
10. Use `addOnCloseMessageListener()` to handle cleanup when the connection closes (regardless of who initiated the close)

### Differences from SUBSCRIPTION Procedures

| Feature | SUBSCRIPTION | BIDIRECTIONAL |
|---------|--------------|---------------|
| Communication | Server → Client only | Server ↔ Client |
| Transport | Server-Sent Events (SSE) | WebSockets |
| Client can send data | No (only initial input) | Yes (anytime) |
| Send data to client | `write()` | `sendMessage()` |
| Handle incoming messages | N/A | `addOnMessageListener()` |
| Close connection | `close()` | `close(reason?)` |
| Handle close event | `onClose()` | `addOnCloseMessageListener()` |
| Use case | Data streaming, notifications | Interactive real-time apps |

### Best Practices for BIDIRECTIONAL Procedures

1. **Use message types**: Add a `type` field to your input schema to differentiate message purposes (join, message, action, etc.)
2. **Handle connection state**: Track user state (e.g., which room they've joined) within the handler closure
3. **Validate state before actions**: Check that prerequisites are met (e.g., user has joined a room) before processing messages
4. **Organize message handlers**: Use descriptive names for your listeners to make debugging easier
5. **Always register cleanup handlers**: Use `addOnCloseMessageListener()` to clean up resources when connections close
6. **Error handling**: Errors in message callbacks are logged automatically, but consider sending error responses to clients

## Modifying Cookies

Zynapse allows you to modify response cookies directly within both middleware and procedure implementations using the Bun Request object.

### Working with Cookies

Both middleware and procedure handlers receive a `BunRequest` object that allows you to manipulate cookies:

```typescript
.setMiddleware(async (request) => {
  // Check authentication
  const userToken = request.headers.get("authorization")?.split(" ")[1];
  
  if (!userToken) {
    throw new Error("No authentication token provided");
  }
  
  // Validate the token
  const user = await validateToken(userToken);
  
  // Set cookies that will be included in the response
  request.cookies.set("user_id", user.id, {
    httpOnly: true,
    secure: true,
    maxAge: 60 * 60 * 24, // 1 day in seconds
    path: '/'
  });
});
```

### Modifying Cookies in Procedures

The same approach works in procedure implementations:

```typescript
.registerProcedureImplementation("Login", async (input, request) => {
  // Authenticate user
  const user = await authenticateUser(input.email, input.password);
  
  // Generate a session token
  const sessionToken = createSessionToken(user);
  
  // Set a cookie that will be included in the response
  request.cookies.set("auth_token", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7 // 7 days in seconds
  });
  
  // Return the procedure's data output
  return {
    userId: user.id,
    expiresAt: Date.now() + 86400000
  };
})
```

### Removing Cookies

To remove a cookie, you can use the `delete` method or set it with immediate expiration:

```typescript
.registerProcedureImplementation("Logout", async (input, request) => {
  // Method 1: Delete the cookie
  request.cookies.delete("auth_token");
  
  // Method 2: Set with zero maxAge
  request.cookies.set("auth_token", "", {
    maxAge: 0,
    path: '/'
  });
  
  return { success: true };
})
```

### Behavior in Middleware and Procedures

When both middleware and procedures modify the same cookies:

1. Changes from both sources are preserved
2. If the same cookie is modified in both places, the procedure's changes take precedence
3. All cookie modifications are automatically included in the final response

## Implementing Webhooks

Webhooks provide a way to handle custom HTTP requests outside of the standard Zynapse procedure system. This is useful for integrating with third-party services that need to send data to your server, such as payment processors, notification services, or external APIs.

### Understanding Webhooks

Unlike procedures which follow the Zynapse protocol (sending JSON with service, procedure, and data fields), webhooks allow you to handle raw HTTP requests at a dedicated endpoint. The webhook handler receives the raw `BunRequest` object and must return a `Response`.

### Webhook Endpoint

All webhook requests are handled at the `/_api/webhook` endpoint on your server. This endpoint is automatically configured when you start the server.

### Implementing a Webhook Handler

To implement webhook functionality, you need to:

1. Define a webhook handler function
2. Register it with the server using `registerWebhookHandler()`

#### Step 1: Define the Webhook Handler

```typescript
import type { WebhookHandlerFunction } from "zynapse/server";

// Create a webhook handler function
const myWebhookHandler: WebhookHandlerFunction = async (req) => {
  // Access request properties
  const url = new URL(req.url);
  const method = req.method;

  // Parse the request body if needed
  try {
    const body = await req.json();
    console.log("Webhook received:", body);

    // Process the webhook data
    // For example, handle a payment notification
    if (body.event === "payment.success") {
      await processPayment(body.paymentId);
    }

    // Return a success response
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response("Webhook processing failed", {
      status: 500
    });
  }
};
```

#### Step 2: Register the Webhook Handler

After creating your server instance, register the webhook handler:

```typescript
import { Server, ServiceImplementationBuilder } from "zynapse/server";
import apiSchema from "@/api.schema.ts";

// Create and configure your server
const server = new Server(apiSchema, {
  // Your service implementations...
});

// Register the webhook handler
server.registerWebhookHandler(myWebhookHandler);

// Start the server
server.start(3000);
```

### Webhook Handler Capabilities

The webhook handler receives the full `BunRequest` object, giving you access to:

- **Request Method**: `req.method` (GET, POST, PUT, DELETE, etc.)
- **URL and Query Parameters**: `new URL(req.url)`
- **Headers**: `req.headers.get("header-name")`
- **Body**: `await req.json()`, `await req.text()`, `await req.blob()`, etc.
- **Cookies**: `req.cookies.get("cookie-name")`

### Example: Payment Webhook Integration

Here's a complete example showing how to handle webhooks from a payment provider:

```typescript
import { Server, type WebhookHandlerFunction } from "zynapse/server";
import apiSchema from "@/api.schema.ts";

// Webhook handler for payment notifications
const paymentWebhookHandler: WebhookHandlerFunction = async (req) => {
  // Verify the request method
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify webhook signature (example for security)
  const signature = req.headers.get("X-Webhook-Signature");
  if (!signature || !verifyWebhookSignature(signature, req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();

    // Handle different webhook events
    switch (payload.event) {
      case "payment.success":
        await handlePaymentSuccess(payload.data);
        break;
      case "payment.failed":
        await handlePaymentFailure(payload.data);
        break;
      case "subscription.cancelled":
        await handleSubscriptionCancellation(payload.data);
        break;
      default:
        console.log(`Unknown webhook event: ${payload.event}`);
    }

    // Always return a 200 response to acknowledge receipt
    return new Response(JSON.stringify({ status: "processed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Webhook error:", error);

    // Return error response
    return new Response(JSON.stringify({ error: "Processing failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

// Create server and register webhook
const server = new Server(apiSchema, {
  // Service implementations...
});

server.registerWebhookHandler(paymentWebhookHandler);
server.start(3000);

// Helper functions
async function verifyWebhookSignature(signature: string, req: BunRequest): Promise<boolean> {
  // Implement your signature verification logic
  // This depends on your webhook provider's requirements
  return true;
}

async function handlePaymentSuccess(data: any) {
  console.log("Payment successful:", data);
  // Update database, send confirmation email, etc.
}

async function handlePaymentFailure(data: any) {
  console.log("Payment failed:", data);
  // Notify user, update payment status, etc.
}

async function handleSubscriptionCancellation(data: any) {
  console.log("Subscription cancelled:", data);
  // Update subscription status, process refund, etc.
}
```

### Security Best Practices for Webhooks

1. **Verify Signatures**: Always verify webhook signatures to ensure requests come from the expected source
2. **Use HTTPS**: In production, always use HTTPS to encrypt webhook data in transit
3. **Validate Payloads**: Validate the structure and content of webhook payloads before processing
4. **Rate Limiting**: Consider implementing rate limiting to prevent abuse
5. **Idempotency**: Handle duplicate webhook deliveries gracefully (many webhook providers retry on failure)
6. **Logging**: Log all webhook attempts for debugging and audit purposes

### Error Handling

If no webhook handler is registered and a request is made to `/_api/webhook`, the server will automatically return a 404 response with an error logged to the console:

```
[ZYNAPSE] Webhook endpoint was called, but no endpoint has been registered.
```

### Important Notes

1. Only one webhook handler can be registered per server instance
2. The webhook endpoint is always located at `/_api/webhook`
3. Webhook handlers bypass the normal Zynapse procedure validation and middleware
4. You are responsible for all validation, authentication, and error handling within the webhook handler
5. Unlike procedures, webhooks do not have automatic input/output schema validation

## Complete Example (Using schema from @/api.schema.ts)

Here's a complete example showing how to implement all services in your schema:

```typescript
import { Server, ServiceImplementationBuilder } from "zynapse/server";
import apiSchema from "@/api.schema.ts";
import { db } from "./database";
import { EventEmitter } from "events"; // Node.js built-in module for event handling

// Create an event emitter for post updates
const postEvents = new EventEmitter();

// Implement the Posts service
const postsServiceImplementation = new ServiceImplementationBuilder(apiSchema.services.Posts)
  .registerProcedureImplementation("GetUserPosts", async (input, request, context) => {
    console.log(`Getting posts for user ${input.userId}`);
    
    // Access user data from context if it was set by middleware
    const currentUser = context.get("user");
    console.log(`Request made by user: ${currentUser?.id}`);
    
    // Fetch posts from database
    const posts = await db.posts.findByUserId(input.userId);
    
    return {
      posts: posts.map(post => ({
        title: post.title,
        creationDate: post.createdAt,
      })),
    };
  })
  // MUTATION that creates a new post
  .registerProcedureImplementation("CreatePost", async (input, request, context) => {
    console.log(`Creating post for user ${input.userId}`);
    
    // Create post in database
    const newPost = await prisma.post.create({
      data: {
        title: input.title,
        content: input.content,
        userId: input.userId,
      }
    });
    
    // Emit event when a new post is created
    // This event will be listened to by active subscription connections
    postEvents.emit(`newPost:${input.userId}`, {
      title: newPost.title,
      creationDate: newPost.createdAt,
    });
    
    return { success: true, postId: newPost.id };
  })
  // SUBSCRIPTION that streams new posts
  .registerProcedureImplementation("StreamNewPosts", async (input, request, context, connection) => {
    console.log(`Streaming new posts for user ${input.userId}`);
    
    // Send initial posts data
    const initialPosts = await prisma.post.findMany({
      where: { userId: input.userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    // MUST use the connection parameter in subscription methods
    await connection.write({
      posts: initialPosts.map(post => ({
        title: post.title,
        creationDate: post.createdAt,
      })),
    });
    
    // Set up event listener for new posts for this specific user
    const eventHandler = async (newPost) => {
      await connection.write({
        posts: [newPost],
      });
    };
    
    // Subscribe to events for this user
    postEvents.on(`newPost:${input.userId}`, eventHandler);
    
    // Use the onClose method to clean up resources when the connection closes
    // This is the recommended way to handle cleanup for subscription connections
    connection.onClose(() => {
      console.log(`Connection closed for user ${input.userId}`);
      
      // Remove the event listener when the connection closes
      postEvents.off(`newPost:${input.userId}`, eventHandler);
      
      // Additional cleanup could be performed here
      // For example: logging, metrics updates, etc.
    });
    
    // SUBSCRIPTION methods MUST return undefined (do not return any value)
    // No explicit return statement is needed as JavaScript functions implicitly return undefined
  })
  // Implement other procedures as defined in schema...
  .build();

// Implement the Auth service (assuming it has middleware)
const authServiceImplementation = new ServiceImplementationBuilder(apiSchema.services.Auth)
  .setMiddleware(async (request) => {
    // Auth middleware implementation
    if (Object.keys(request.cookies).length === 0) {
      throw new Error("No cookies found");
    }
    // Additional auth logic...
  })
  .registerProcedureImplementation("Login", async (input, request) => {
    // Login implementation
    const { email, password } = input;
    const user = await authenticateUser(email, password);
    
    return {
      expiresAt: Date.now() + 86400000, // 24 hours
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    };
  })
  .registerProcedureImplementation("Logout", async (input, request) => {
    // Logout implementation
    return { success: true };
  })
  .build();

// Initialize the server with all service implementations
const server = new Server(apiSchema, {
  Posts: postsServiceImplementation,
  Auth: authServiceImplementation,
  // Add all other service implementations from the schema
});

// Start the server
server.start(3000);
```

## Type Checking and Validation

The implementation process enforces:

1. **Complete implementation** - All services and procedures must be implemented
2. **Type safety** - Input and output types must match the schema definition
3. **Middleware requirements** - Services with middleware descriptions require middleware implementation

If your implementation is incomplete or incorrect, you'll get compilation errors or runtime exceptions.

## Best Practices

1. **Keep implementations organized** - Create separate files for each service implementation
2. **Modular structure** - Group related implementation files in a logical directory structure
3. **Dependency injection** - Pass database connections and other dependencies to your handlers
4. **Error handling** - Implement robust error handling with informative error messages
5. **Testing** - Write tests for your implementation using the schema's type definitions

## Example Project Structure

```
src/
├── api.schema.ts              # Your API schema definition
├── server/
│   ├── index.ts               # Main server file that composes everything
│   ├── implementations/       # Service implementations
│   │   ├── users.service.ts   # Users service implementation
│   │   ├── posts.service.ts   # Posts service implementation
│   │   └── auth.service.ts    # Auth service implementation
│   └── utils/                 # Shared utilities for implementations
│       ├── auth.utils.ts      # Authentication utilities
│       └── validation.utils.ts # Input validation utilities
└── database/                  # Database connection and models
```

By following these patterns, you'll create a robust, type-safe API server based on the schema defined in `@/api.schema.ts`.