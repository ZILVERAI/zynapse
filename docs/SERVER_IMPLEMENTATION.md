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
  .build();
```

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

### Access to Request Object

All procedure handlers receive the original HTTP Request as the second parameter:

```typescript
.registerProcedureImplementation("GetUserById", async (input, request) => {
  // Access request properties
  const cookies = request.headers.get("cookie");
  const userAgent = request.headers.get("user-agent");
  
  // Implementation logic...
})
```

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

If the schema in `@/api.schema.ts` includes services with middleware descriptions, you must implement the middleware:

```typescript
// For a service with a middleware description in the schema
const protectedServiceImplementation = new ServiceImplementationBuilder(apiSchema.services.ProtectedResource)
  // Define middleware that runs before each procedure in this service
  .setMiddleware(async (request) => {
    // Check authentication
    const authCookie = request.headers.get("cookie");
    if (!authCookie?.includes("auth_session=")) {
      throw new Error("Unauthorized");
    }

    // Validate session
    const sessionToken = extractSessionToken(authCookie);
    const session = await validateSession(sessionToken);
    if (!session) {
      throw new Error("Invalid session");
    }
  })
  // Implement all procedures...
  .build();
```

## Complete Example (Using schema from @/api.schema.ts)

Here's a complete example showing how to implement all services in your schema:

```typescript
import { Server, ServiceImplementationBuilder } from "zynapse/server";
import apiSchema from "@/api.schema.ts";
import { db } from "./database";

// Implement the Posts service
const postsServiceImplementation = new ServiceImplementationBuilder(apiSchema.services.Posts)
  .registerProcedureImplementation("GetUserPosts", async (input, request) => {
    console.log(`Getting posts for user ${input.userId}`);
    
    // Fetch posts from database
    const posts = await db.posts.findByUserId(input.userId);
    
    return {
      posts: posts.map(post => ({
        title: post.title,
        creationDate: post.createdAt,
      })),
    };
  })
  // Implement other procedures as defined in schema...
  .build();

// Implement the Auth service (assuming it has middleware)
const authServiceImplementation = new ServiceImplementationBuilder(apiSchema.services.Auth)
  .setMiddleware(async (request) => {
    // Auth middleware implementation
    const sessionCookie = request.headers.get("cookie");
    if (!sessionCookie) {
      throw new Error("No session cookie found");
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