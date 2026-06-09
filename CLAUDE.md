# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An Azure Functions V4 adapter for Elysia that bridges Azure's HTTP trigger model with Elysia's Web Request/Response API. The adapter converts between Azure's `HttpRequest`/`HttpResponseInit` and standard Web API Request/Response objects, allowing Elysia applications to run on Azure Functions.

## Build Commands

```bash
# Build the library (dual CJS/ESM output)
npm run build

# Build in watch mode for development
npm run dev

# Type check without emitting files
npm run typecheck

# Lint package exports and types
npm run lint

# Check bundle size
npm run size

# Release workflow (build + lint + publish with changesets)
npm run release
```

## Core Architecture

### Request/Response Flow

The adapter follows this transformation pipeline:

1. **Azure HTTP Trigger** receives `HttpRequest` + `InvocationContext`
2. **Request Adapter** ([src/request.ts:4](src/request.ts#L4)) converts `HttpRequest` → standard Web `Request`
3. **Context Attachment** ([src/index.ts:63](src/index.ts#L63)) stores `InvocationContext` on the Request using `AZURE_CONTEXT` symbol
4. **Elysia Processing** handles the Request through normal route handlers
5. **Response Adapter** ([src/response.ts:8](src/response.ts#L8)) converts Web `Response` → `HttpResponseInit`

### Key Design Patterns

**Symbol-based Context Storage**: The `AZURE_CONTEXT` symbol ([src/index.ts:25](src/index.ts#L25)) attaches Azure's `InvocationContext` to Web Request objects without polluting the standard Request interface. This enables context to flow through Elysia's middleware chain while maintaining type safety.

**Dual API Surface**: The library provides both:
- **High-level plugin API** (`azure()` plugin) that adds an `azure` context property to all routes
- **Low-level function API** (`getAzureContext()`) for direct access when needed

**Environment Abstraction**: `AzureContext` class ([src/index.ts:119](src/index.ts#L119)) provides a unified logging API that works both in Azure Functions (using `InvocationContext` methods) and locally (falling back to `console.*` methods). Check `isAzure` property to detect environment.

### Module Structure

- **[src/index.ts](src/index.ts)**: Main exports, plugin definition, context wrapper class, and handler factory
- **[src/request.ts](src/request.ts)**: Azure `HttpRequest` → Web `Request` conversion
- **[src/response.ts](src/response.ts)**: Web `Response` → Azure `HttpResponseInit` conversion
- **[src/utils.ts](src/utils.ts)**: Stream handling, header conversion, cookie parsing utilities

### Build Configuration

Uses `tsdown` for bundling with dual format output:
- **Target**: Node.js 22+
- **Formats**: ESM (`.mjs`) and CJS (`.cjs`) with corresponding `.d.mts`/`.d.cts` types
- **Entry**: Single entry point at `src/index.ts`
- **Output**: `dist/` directory with sourcemaps

The package exports are configured in [package.json](package.json#L38-L50) to properly expose both module formats with their type definitions.

### External Dependencies Configuration

Peer dependencies (`elysia` and `@azure/functions`) are marked as external in [tsdown.config.ts:11](tsdown.config.ts#L11). This is critical to prevent bundling these dependencies and ensure type compatibility when the package is consumed.

**Important for local development with `file:` dependencies**: The Elysia version in devDependencies must exactly match the consuming app's version to avoid TypeScript errors about "separate declarations of a private property". If you encounter type compatibility errors when using this package locally via `file:../elysia-azurefunc-adapter`, ensure both projects have the exact same Elysia version installed.

## Important Implementation Details

### Request Body Handling

Request bodies are only attached for non-GET/HEAD methods ([src/request.ts:5](src/request.ts#L5)). The `duplex: "half"` option is required when passing a ReadableStream as body per the Fetch spec.

### Cookie Parsing

Azure Functions uses a structured `Cookie[]` format, not raw Set-Cookie headers. The adapter extracts Set-Cookie headers from the Response and parses them into Azure's cookie format ([src/utils.ts:31](src/utils.ts#L31), [src/utils.ts:38](src/utils.ts#L38)).

### Stream Conversion

Response bodies are converted from Web Streams (ReadableStream) to async iterators ([src/utils.ts:3](src/utils.ts#L3)) to match Azure Functions' expected body format.

## Plugin Usage Pattern

The `azure()` plugin uses Elysia's `.derive({ as: "scoped" })` ([src/index.ts:322](src/index.ts#L322)) to inject the `azure` context into all routes. The `scoped` option ensures the context is available to the parent, current instance, and all descendants, which is the recommended pattern for adapter plugins per Elysia best practices. This provides reliable context propagation while avoiding edge cases associated with global scope.

## Testing Considerations

Currently no automated tests are configured (`npm test` exits with error). When adding tests, consider:

- Testing both in-Azure and local (context undefined) scenarios
- Verifying cookie parsing edge cases (various Set-Cookie attribute combinations)
- Stream handling for large request/response bodies
- SSE and WebSocket scenarios remain untested per README
