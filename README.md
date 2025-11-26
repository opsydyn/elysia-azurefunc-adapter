# elysia-azurefunc-adapter

[![npm version](https://img.shields.io/npm/v/elysia-azurefunc-adapter.svg)](https://www.npmjs.com/package/elysia-azurefunc-adapter)
[![npm downloads](https://img.shields.io/npm/dm/elysia-azurefunc-adapter.svg)](https://www.npmjs.com/package/elysia-azurefunc-adapter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/elysia-azurefunc-adapter)](https://bundlephobia.com/package/elysia-azurefunc-adapter)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

Azure Functions V4 adapter for [Elysia](https://elysiajs.com/). Run Elysia on Azure Functions.

## Requirements

- **Node.js**: 18.x or 20.x LTS (Azure Functions requirement)
- **Elysia**: 1.0.0 or higher
- **Azure Functions**: V4 programming model (`@azure/functions` ^4.0.0)

## Install

```bash
npm i elysia-azurefunc-adapter
# or
bun add elysia-azurefunc-adapter
```

## Quick Start

### 1. Create your Elysia app with the Azure plugin

```typescript
// src/app.ts
import { Elysia } from "elysia";
import { azure } from "elysia-azurefunc-adapter";

const app = new Elysia()
  .use(azure()) // Adds azure context to all routes
  .get("/", ({ azure }) => {
    azure.log("Hello endpoint called!");
    return "Hello Elysia";
  })
  .get("/api/hello", ({ azure }) => {
    // Logging works both locally and in Azure!
    azure.logWithContext("Processing request");
    
    return { 
      message: azure.isAzure 
        ? "Hello from Azure Functions!" 
        : "Hello from local dev!",
      invocationId: azure.invocationId
    };
  });

export default app;
```

### 2. Create the Azure Functions HTTP trigger

```typescript
// src/functions/httpTrigger.ts
import elysiaApp from "../app";
import { azureElysiaHandler } from "elysia-azurefunc-adapter";
import { app } from "@azure/functions";

app.http("httpTrigger", {
  methods: ["GET", "POST", "DELETE", "HEAD", "PATCH", "PUT", "OPTIONS", "TRACE", "CONNECT"],
  authLevel: "anonymous",
  route: "{*proxy}",
  handler: azureElysiaHandler(elysiaApp),
});
```

### 3. Configure Azure Functions

**host.json** - Remove the default `/api` prefix:

```json
{
  "version": "2.0",
  "extensions": {
    "http": {
      "routePrefix": ""
    }
  }
}
```

**local.settings.json** - Local development settings:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsFeatureFlags": "EnableWorkerIndexing"
  }
}
```

### 4. Build and run

```bash
# Build TypeScript
npx tsc

# Start Azure Functions locally
func start
```

## Azure Plugin

The `azure()` plugin provides a clean, type-safe way to access Azure Functions context in your routes.

```typescript
import { Elysia } from "elysia";
import { azure } from "elysia-azurefunc-adapter";

const app = new Elysia()
  .use(azure())
  .get("/api/example", ({ azure }) => {
    // Check if running in Azure
    if (azure.isAzure) {
      azure.log("Running in Azure Functions!");
    }

    // Logging works everywhere (falls back to console locally)
    azure.log("Info message");
    azure.warn("Warning message");
    azure.error("Error message");
    azure.trace("Trace message");
    
    // Log with invocation ID prefix
    azure.logWithContext("Processing request");
    // Output: [abc12345] Processing request

    return {
      invocationId: azure.invocationId,
      functionName: azure.functionName,
    };
  });
```

### AzureContext Properties

| Property | Type | Description |
|----------|------|-------------|
| `isAzure` | `boolean` | Whether running in Azure Functions |
| `raw` | `InvocationContext \| undefined` | Raw Azure InvocationContext |
| `invocationId` | `string \| undefined` | Unique invocation ID |
| `functionName` | `string \| undefined` | Name of the function |
| `triggerMetadata` | `Record<string, unknown> \| undefined` | Trigger metadata |
| `traceContext` | `TraceContext \| undefined` | Distributed tracing context |
| `retryContext` | `RetryContext \| undefined` | Retry information |

### AzureContext Methods

| Method | Description |
|--------|-------------|
| `log(message, ...args)` | Log info message (console.log locally) |
| `info(message, ...args)` | Alias for log() |
| `warn(message, ...args)` | Log warning (console.warn locally) |
| `error(message, ...args)` | Log error (console.error locally) |
| `trace(message, ...args)` | Log trace (console.debug locally) |
| `logWithContext(message, ...args)` | Log with invocation ID prefix |

## Low-Level API

For more control, you can use the low-level `getAzureContext()` function:

```typescript
import { Elysia } from "elysia";
import { getAzureContext } from "elysia-azurefunc-adapter";

const app = new Elysia()
  .get("/api/hello", ({ request }) => {
    const ctx = getAzureContext(request);
    
    if (ctx) {
      ctx.log("Processing request...");
      return { invocationId: ctx.invocationId };
    }
    
    return { message: "Running locally" };
  });
```

## API Reference

### `azure()`

Elysia plugin that adds `azure` context to all routes.

```typescript
import { azure } from "elysia-azurefunc-adapter";

app.use(azure());
```

### `azureElysiaHandler(app: AnyElysia)`

Creates an Azure Functions HTTP handler from an Elysia app.

```typescript
import { azureElysiaHandler } from "elysia-azurefunc-adapter";

const handler = azureElysiaHandler(elysiaApp);
```

### `getAzureContext(request: Request)`

Retrieves the raw Azure `InvocationContext` from a request.

```typescript
import { getAzureContext } from "elysia-azurefunc-adapter";

const context = getAzureContext(request);
```

### `AzureContext`

Class wrapper around InvocationContext with helper methods.

```typescript
import { AzureContext } from "elysia-azurefunc-adapter";
```

### `AZURE_CONTEXT`

Symbol used to store the invocation context on the request object.

```typescript
import { AZURE_CONTEXT } from "elysia-azurefunc-adapter";
```

## Limitations

- **Request signal**: Azure Functions does not expose any signal or event for listening to HTTP request interruptions.
- **Node.js version**: Requires Node.js 18.x or 20.x LTS (Azure Functions limitation).

## Untested Scenarios

- SSE (Server-Sent Events / streaming responses)
- WebSockets

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Credits

This adapter is based on [hono-azurefunc-adapter](https://github.com/Marplex/hono-azurefunc-adapter) by [@Marplex](https://github.com/Marplex), ported to work with Elysia.

## License

MIT
