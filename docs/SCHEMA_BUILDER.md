# Zynapse Schema Builder Documentation

Zynapse is a TypeScript library for building type-safe API schemas with runtime validation. This guide explains how to define well-structured API schemas using the schema builder.

## Core Concepts

- **Procedure**: A single API endpoint with defined input and output schemas
- **Service**: A logical group of related procedures
- **Schema**: The complete API definition containing all services

## Getting Started

### Import the necessary dependencies

```typescript
import { APISchema, Service } from "zynapse/schema";
import { z } from "zod";
```

### Define a Service with Procedures

```typescript
// Create a users service
const usersService = new Service("Users")
  .addProcedure({
    method: "QUERY",
    name: "GetUserById", 
    description: "Get a user by their ID",
    input: z.object({
      id: z.string().uuid()
    }),
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email()
    })
  })
  .addProcedure({
    method: "MUTATION",
    name: "CreateUser",
    description: "Create a new user",
    input: z.object({
      name: z.string().min(1),
      email: z.string().email()
    }),
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string()
    })
  });
```

### Create an API Schema with Services

```typescript
// Create the API schema with services
const apiSchema = new APISchema({
  Users: usersService
});
```

### Services with Middleware

The middleware description should be detailed and specific about cookie-based authentication/authorization requirements:

```typescript
const authProtectedService = new Service(
  "ProtectedResource",
  "Requires 'auth_session' cookie with valid session token. Cookie must be httpOnly, secure, and SameSite=Strict. Session must contain 'userId' and 'role' data. Role must be 'admin' or 'editor' to access these procedures."
).addProcedure({
  method: "QUERY",
  name: "GetSecretData",
  description: "Get data that requires authentication. Responds with 401 if unauthorized or 403 if user lacks 'admin' role. No session refresh is performed.",
  input: z.object({}),
  output: z.object({
    secretData: z.string()
  })
});

// Using extended cookie information
const userProfileService = new Service(
  "UserProfile",
  "Requires 'session_id' cookie with valid session. Session cookie must be present and unexpired (max 24h). Session is refreshed automatically if less than 1h remains, setting a new 'session_id' cookie in the response."
).addProcedure({
  method: "QUERY",
  name: "GetMyProfile",
  description: "Get current user profile based on session cookie. Returns 401 if no valid session found. If session is refreshed, a new cookie is set in the response.",
  input: z.object({}),
  output: z.object({
    username: z.string(),
    email: z.string().email()
  })
});
```

## Advanced Usage

### Complex Input/Output Schemas

Leverage Zod's schema composition for complex types:

```typescript
// Define reusable schemas
const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "user", "guest"])
});

const postSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  published: z.boolean(),
  authorId: z.string().uuid()
});

// Use in procedures
const contentService = new Service("Content")
  .addProcedure({
    method: "QUERY",
    name: "GetPostsWithAuthor",
    description: "Get posts with author details",
    input: z.object({
      limit: z.number().positive().default(10),
      offset: z.number().nonnegative().default(0),
      authorId: z.string().uuid().optional()
    }),
    output: z.object({
      posts: z.array(
        postSchema.extend({
          author: userSchema
        })
      ),
      total: z.number()
    })
  });
```

### Multiple Services

Organize your API by creating multiple services:

```typescript
const apiSchema = new APISchema({
  Users: usersService,
  Content: contentService, 
  Auth: authService
});
```

## Complete Example

Here's a complete example showing how to define an API schema with multiple services:

```typescript
import { APISchema, Service } from "zynapse/schema";
import { z } from "zod";

// Shared schemas
const todoSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  completed: z.boolean(),
  createdAt: z.date()
});

// Auth service
const authService = new Service("Auth")
  .addProcedure({
    method: "MUTATION",
    name: "Login",
    description: "Authenticates a user with email/password. Sets 'auth_session' cookie valid for 24h. If rememberMe is true, session cookie lasts 30 days. Rate limited to 5 attempts per IP address per hour. Responds with 429 if rate limit exceeded. Responds with 401 if credentials invalid. This procedure always sets a new 'auth_session' cookie in the response.",
    input: z.object({
      email: z.string().email("Must provide a valid email address"),
      password: z.string().min(8, "Password must be at least 8 characters"),
      rememberMe: z.boolean().optional().default(false)
    }),
    output: z.object({
      expiresAt: z.number().describe("Unix timestamp when session expires"),
      user: z.object({
        id: z.string().uuid(),
        email: z.string().email(),
        name: z.string(),
        role: z.enum(["admin", "user", "guest"])
      })
    })
  })
  .addProcedure({
    method: "MUTATION",
    name: "Logout",
    description: "Invalidates current session by clearing the 'auth_session' cookie. Sets an expired 'auth_session' cookie to ensure client deletion. Safe to call multiple times. Always returns success even if no session was active.",
    input: z.object({}),
    output: z.object({
      success: z.boolean()
    })
  });

// Todos service with detailed cookie authentication requirement
const todosService = new Service(
  "Todos", 
  "Requires 'auth_session' cookie with valid session. Cookie must contain 'userId' which is used to scope todos to the authenticated user. Session must not be expired. If session expires in less than 6 hours, a refreshed 'auth_session' cookie is automatically set in the response."
)
  .addProcedure({
    method: "QUERY",
    name: "GetAllTodos",
    description: "Gets all todos for the current authenticated user based on session cookie. Results are paginated with default limit of 20. Filters by completion status if 'completed' parameter provided. Todos are ordered by creation date descending (newest first). Responds with 401 if no valid session cookie found. May set a refreshed 'auth_session' cookie if current session is nearing expiration.",
    input: z.object({
      completed: z.boolean().optional().describe("Filter todos by completion status"),
      limit: z.number().min(1).max(100).optional().default(20),
      offset: z.number().min(0).optional().default(0),
      sortBy: z.enum(["createdAt", "updatedAt", "title"]).optional().default("createdAt"),
      sortDirection: z.enum(["asc", "desc"]).optional().default("desc")
    }),
    output: z.object({
      todos: z.array(todoSchema),
      total: z.number().describe("Total count of todos matching filters (ignoring pagination)"),
      hasMore: z.boolean().describe("Whether there are more todos beyond the current page")
    })
  })
  .addProcedure({
    method: "MUTATION",
    name: "CreateTodo",
    description: "Create a new todo",
    input: z.object({
      title: z.string().min(1)
    }),
    output: todoSchema
  })
  .addProcedure({
    method: "MUTATION", 
    name: "ToggleTodoStatus",
    description: "Toggle completion status of a todo",
    input: z.object({
      id: z.string().uuid()
    }),
    output: todoSchema
  });

// Create the full API schema
const apiSchema = new APISchema({
  Auth: authService,
  Todos: todosService
});

export { apiSchema };
```

## Type Safety

The schema builder provides full type safety:

1. Service and procedure names are typed
2. Input and output schemas generate TypeScript types
3. When implementing the server, you get type checking for all handlers

## Designing a Well-Structured Schema

A well-structured API schema requires thoughtful design. Here are some tips:

### Procedure Design Guidelines

1. **Clear Purpose**: Each procedure should have a single, clear purpose
2. **Descriptive Names**: Use names that indicate what the procedure does
3. **Input Validation**: Use Zod to validate all input parameters
4. **Output Structure**: Define consistent output structures

### Service Organization

Organize your procedures into services in a meaningful way:

```typescript
// Resource-oriented service design
const usersService = new Service("Users")
  .addProcedure(/* user creation */)
  .addProcedure(/* user retrieval */)
  .addProcedure(/* user update */);

const postsService = new Service("Posts")
  .addProcedure(/* post creation */)
  .addProcedure(/* post retrieval */);

// Feature-oriented service design
const authService = new Service("Auth")
  .addProcedure(/* login */)
  .addProcedure(/* logout */)
  .addProcedure(/* password reset */);

const analyticsService = new Service("Analytics")
  .addProcedure(/* usage stats */)
  .addProcedure(/* user activity */);
```

### Schema Evolution Guidelines

As your API evolves:

1. Avoid removing procedures (breaks compatibility)
2. Add new optional fields to existing input schemas rather than changing existing fields
3. Consider versioning services for major changes
4. Use detailed middleware descriptions to document:
   - Cookie-based authentication requirements
   - Required cookie names and values
   - Required permissions or roles stored in the session
   - Cookie/session lifetime and expiration handling
   - Cookie refresh behavior and conditions

## Schema as a Contract

Your API schema serves as a contract between your server implementation and clients. A well-designed schema:

1. **Defines clear boundaries** between different domains of your API
2. **Documents the purpose** of each procedure through descriptions
3. **Validates input/output data** at runtime using Zod schemas
4. **Provides type safety** throughout your application

When designing your schema, think about:

```typescript
// Good API design practice - clear domains and concise procedures
const usersService = new Service("Users")
  .addProcedure({
    method: "QUERY",
    name: "GetUserById", 
    description: "Get a user by their ID",
    input: z.object({
      id: z.string().uuid()
    }),
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email()
    })
  });

// Bad API design - mixing concerns, unclear purpose
const badService = new Service("Misc")
  .addProcedure({
    method: "MUTATION",
    name: "DoStuff", 
    description: "Does various things",
    input: z.object({
      userId: z.string().optional(),
      postId: z.string().optional(),
      action: z.string()
    }),
    output: z.any()
  });
```

Your schema is both documentation and validation all in one. The types you define will flow through to the implementation and ensure type safety across your application.

## Best Practices

1. **Model your domain** - Group procedures into services that represent clear domain boundaries
2. **Use descriptive names** - Services and procedures should have names that clearly indicate their purpose
3. **Make specific procedures** - Each procedure should do one thing well, rather than combining multiple operations
4. **Validate thoroughly** - Use Zod's schema validation to enforce strict data requirements
5. **Define reusable schemas** - Create shared schemas for common data structures in your API
6. **Document comprehensively** - Include in procedure descriptions:
   - Expected behavior
   - Error responses with status codes
   - Rate limiting information
   - Required permissions
   - Side effects
7. **Use QUERY/MUTATION correctly** - QUERY for read operations, MUTATION for operations that modify data
8. **Define error responses** - Document all possible error responses with their conditions
9. **Detail cookie-based authentication** - Document session cookies, expiration, refresh logic, and security attributes
10. **Keep schemas focused** - Avoid creating "catch-all" services or generic procedures
11. **Document input validation** - Use Zod's error messages to provide helpful validation feedback
12. **Consider versioning** - Plan for API evolution with versioning strategies

By following these practices, you'll create a schema that serves as clear documentation, provides runtime validation, and enables full type safety throughout your application.

## IMPORTANT: Cookie-Based Authentication Directive

**All procedures requiring authentication MUST use cookie-based sessions:**

```typescript
// REQUIRED: All authentication must use the 'auth_session' cookie
// NOT PERMITTED: Authentication via headers or query parameters

// Every authenticated procedure must:
// 1. Read the 'auth_session' cookie for authentication
// 2. Set a refreshed 'auth_session' cookie if necessary
// 3. Document cookie handling behavior in the procedure description

// Example middleware description:
"Requires 'auth_session' cookie with valid session. Cookie must be httpOnly, 
secure, and SameSite=Strict. If session expires in less than 6 hours, a 
refreshed cookie is set in the response."
```

This ensures consistent authentication across all services and enables proper session management.

## IMPORTANT: Schema Export

**Always export your API schema as the default export from your schema definition file:**

```typescript
// schema.ts
import { APISchema, Service } from "zynapse/schema";
import { z } from "zod";

// Define your services and schema...
const apiSchema = new APISchema({
  Users: usersService,
  Posts: postsService
});

// IMPORTANT: Export as default
export default apiSchema;
```

This export pattern is critical for proper integration with the Zynapse ecosystem and ensures compatibility with code generation tools and type inference features.