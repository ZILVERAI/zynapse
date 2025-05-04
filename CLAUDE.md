# CLAUDE.md - Zynapse Project Guide

## Project Overview
Zynapse is a TypeScript library providing a schema-based API system with type-safe server implementations.

## Development Commands
- Testing: `bun test` (all tests) or `bun test tests/schema.test.ts` (single test)
- Run example server: `bun examples/server.ts`

## Code Style Guidelines
- TypeScript with strict type checking
- ESNext module system with explicit imports
- Zod for runtime schema validation
- Type-safe patterns with generics
- PascalCase for types/interfaces, camelCase for variables/functions
- Async/Promise-based handlers
- Error objects with descriptive messages

## Project Structure
- `/src/schema` - Schema definition system
- `/src/server` - Server implementation
- `/src/cli` - CLI tooling
- `/examples` - Usage examples
- `/tests` - Test files

## Development Patterns
- Schema-first API design
- Type safety enforced through builders
- Implementation validation at runtime