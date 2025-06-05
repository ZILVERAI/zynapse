# Zynapse Server Implementation Guide

This guide explains how to implement server-side handlers for an existing Zynapse API schema. We'll focus on implementing procedures defined in `@/api.schema.ts`.

## Overview

Zynapse follows a schema-first approach where the API schema is already defined in your codebase. The implementation workflow consists of:

1. Import the existing schema from `@/api.schema.ts`
2. Implement procedure handlers for each defined procedure
3. Create a server instance and start it

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

Zynapse supports three types of procedure methods:

1. **QUERY** - For retrieving data (read operations)
2. **MUTATION** - For modifying data (write operations)
3. **SUBSCRIPTION** - For streaming data with real-time updates

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
    connection.write({
      data: [{ id: 1, value: "Initial value" }]
    });
    
    // You can send multiple updates over time
    setTimeout(() => {
      connection.write({
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

1. `write(data)` - Sends data to the client that matches the output schema
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
    const intervalId = setInterval(() => {
      const currentMetrics = metrics.getCurrentValues();
      
      // Send the updated metrics to the client
      connection.write({
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
    connection.write({
      posts: initialPosts.map(post => ({
        title: post.title,
        creationDate: post.createdAt,
      })),
    });
    
    // Set up event listener for new posts for this specific user
    const eventHandler = (newPost) => {
      connection.write({
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