# @opsydyn/elysia-az-functionapp

[![npm version](https://img.shields.io/npm/v/%40opsydyn%2Felysia-az-functionapp.svg)](https://www.npmjs.com/package/@opsydyn/elysia-az-functionapp)
[![npm downloads](https://img.shields.io/npm/dm/%40opsydyn%2Felysia-az-functionapp.svg)](https://www.npmjs.com/package/@opsydyn/elysia-az-functionapp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/%40opsydyn%2Felysia-az-functionapp)](https://bundlephobia.com/package/@opsydyn/elysia-az-functionapp)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

Azure Functions adapter for [Elysia](https://elysiajs.com/) with support for:

- the Azure Functions **Node.js worker** model via `azureElysiaHandler()`
- **streaming responses and Server-Sent Events (SSE)** in Node worker mode
- **Bun custom handlers** via `@opsydyn/elysia-az-functionapp/bun`

## Requirements

- **Elysia**: 1.0.0 or higher
- **Azure Functions**: V4 programming model
- **@azure/functions**: 4.3.0 or higher for HTTP streaming, 4.9.0 or higher for Azure MCP bindings
- **Node.js**: 22.x or higher for the package toolchain and Node worker mode
- **Bun**: 1.0+ for Bun custom-handler mode

## Install

### Node worker mode

```bash
npm i @opsydyn/elysia-az-functionapp elysia @azure/functions
```

### Bun custom-handler mode

```bash
bun add @opsydyn/elysia-az-functionapp elysia bun
```

## Example project

If you want a runnable starter instead of assembling Azure's custom-handler files by hand, see [`examples/bun-custom-handler`](./examples/bun-custom-handler).

## Node worker quick start

### 1. Create your Elysia app

```typescript
// src/app.ts
import { Elysia } from "elysia";
import { azure } from "@opsydyn/elysia-az-functionapp";

const app = new Elysia()
  .use(azure())
  .get("/", ({ azure }) => {
    azure.log("Hello endpoint called!");
    return "Hello Elysia";
  })
  .get("/hello", ({ azure }) => {
    azure.logWithContext("Processing request");

    return {
      message: azure.isAzure
        ? "Hello from Azure Functions!"
        : "Hello from local dev!",
      invocationId: azure.invocationId,
    };
  });

export default app;
```

### 2. Create the HTTP trigger

```typescript
// src/functions/httpTrigger.ts
import { app } from "@azure/functions";
import { azureElysiaHandler } from "@opsydyn/elysia-az-functionapp";
import elysiaApp from "../app";

app.setup({
  enableHttpStream: true,
});

app.http("httpTrigger", {
  methods: ["GET", "POST", "DELETE", "HEAD", "PATCH", "PUT", "OPTIONS", "TRACE", "CONNECT"],
  authLevel: "anonymous",
  route: "{*proxy}",
  handler: azureElysiaHandler(elysiaApp),
});
```

If your Function App sits behind trusted infrastructure that rewrites the public origin, such as Azure API Management, Azure Front Door, App Service platform proxying, or a custom reverse proxy, opt in to forwarded URL reconstruction:

```typescript
app.http("httpTrigger", {
  methods: ["GET", "POST", "DELETE", "HEAD", "PATCH", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "{*proxy}",
  handler: azureElysiaHandler(elysiaApp, {
    trustForwardedHeaders: true,
  }),
});
```

Only enable `trustForwardedHeaders` when those headers are supplied by infrastructure you control. When enabled, the adapter trusts `x-forwarded-proto`, `x-forwarded-host`, and the standard `Forwarded` header to reconstruct `request.url` before Elysia handles the request.

### 3. Configure Azure Functions

`host.json`

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

`local.settings.json`

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

### 4. Run it

```bash
func start
```

## Bun custom-handler quick start

The Bun path is designed for **HTTP-triggered** apps running through Azure Functions Custom Handlers.
Azure still requires `host.json`, `local.settings.json`, and a `function.json` file because the Functions host chooses the runtime before your application code runs.

### 1. Create your shared Elysia app

```typescript
// src/app.ts
import { Elysia } from "elysia";
import { azure } from "@opsydyn/elysia-az-functionapp";

const app = new Elysia()
  .use(azure())
  .get("/", ({ azure }) => ({
    isAzure: azure.isAzure,
    invocationId: azure.invocationId,
  }));

export default app;
```

### 2. Start Bun with the package helper

```typescript
// src/bun.ts
import app from "./app";
import { azureBunServe } from "@opsydyn/elysia-az-functionapp/bun";

export default azureBunServe(app, {
  context: {
    functionName: "HttpTrigger",
  },
});
```

### 3. Configure the Functions host

`host.json`

```json
{
  "version": "2.0",
  "extensions": {
    "http": {
      "routePrefix": ""
    }
  },
  "customHandler": {
    "description": {
      "defaultExecutablePath": "node_modules/.bin/bun",
      "arguments": ["run", "src/bun.ts"]
    },
    "enableProxyingHttpRequest": true
  }
}
```

`local.settings.json`

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "Custom"
  }
}
```

`HttpTrigger/function.json`

```json
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["get", "post", "put", "patch", "delete", "head", "options"],
      "route": "{*route}"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}
```

### 4. Production deployment note

When you deploy Bun custom handlers to Azure, make sure the Bun binary matches the target OS.
In practice that means:

- build/install on **Linux CI** before ZIP deployment, or
- use a **custom container** for Azure Functions

This follows Azure's own guidance for custom handlers with platform-specific runtime dependencies.

## The `azure()` plugin

The `azure()` plugin provides a shared context abstraction that works in both runtimes.

```typescript
import { Elysia } from "elysia";
import { azure } from "@opsydyn/elysia-az-functionapp";

const app = new Elysia()
  .use(azure())
  .get("/example", ({ azure }) => {
    azure.log("Info message");
    azure.warn("Warning message");
    azure.error("Error message");
    azure.trace("Trace message");
    azure.logWithContext("Processing request");

    return {
      isAzure: azure.isAzure,
      invocationId: azure.invocationId,
      functionName: azure.functionName,
      azureUser: azure.user?.username,
    };
  });
```

## Streaming and SSE

`azureElysiaHandler()` preserves Elysia response bodies as Azure Functions HTTP streaming bodies. This covers routes that return `ReadableStream`, generator responses, async generator responses, and Elysia's `sse()` helper.

Enable HTTP streaming once in your Azure Functions entrypoint:

```typescript
import { app } from "@azure/functions";

app.setup({
  enableHttpStream: true,
});
```

Azure HTTP streaming requires the Azure Functions Node v4 model, Azure Functions runtime 4.28 or later, Azure Functions Core Tools 4.0.5530 or later for local development, and `@azure/functions` 4.3.0 or later.

### Plain streamed responses

```typescript
import { Elysia } from "elysia";

const encoder = new TextEncoder();

export const app = new Elysia().get("/stream", () => {
  return new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode("first\n"));
        controller.enqueue(encoder.encode("second\n"));
        controller.close();
      },
    }),
    {
      headers: {
        "content-type": "text/plain",
      },
    },
  );
});
```

### Server-Sent Events

```typescript
import { Elysia, sse } from "elysia";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const app = new Elysia().get("/events", async function* () {
  yield sse("ready");

  for (let index = 0; index < 3; index += 1) {
    yield sse(`tick ${index}`);
    await sleep(1000);
  }
});
```

When routing SSE through Azure API Management, disable response buffering and avoid policies that read or buffer the response body. APIM's Consumption tier is not recommended for long-running SSE connections.

### AzureContext properties

| Property | Type | Notes |
| -------- | ---- | ----- |
| `isAzure` | `boolean` | `true` in Azure Functions, `false` in plain local runs |
| `raw` | `InvocationContext \| undefined` | Only available in Node worker mode |
| `request` | `HttpRequest \| Request \| undefined` | Raw runtime request. Node worker mode exposes Azure's `HttpRequest`; Bun mode exposes the Web `Request` |
| `user` | `HttpRequestUser \| null \| undefined` | Azure App Service / Functions authenticated user. Only available in Node worker mode |
| `params` | `Record<string, string> \| undefined` | Route parameters resolved by the Azure Functions host. Elysia route params remain available through Elysia's own `params` |
| `invocationId` | `string \| undefined` | Available in Node worker mode and Bun when Azure forwards the invocation header |
| `functionName` | `string \| undefined` | Available in Node worker mode; in Bun mode you can provide it via `azureBunServe({ context: { functionName } })` |
| `triggerMetadata` | `Record<string, unknown> \| undefined` | Only available in Node worker mode unless you provide custom metadata yourself |
| `traceContext` | `TraceContext \| undefined` | Available in Node worker mode and Bun when trace headers are forwarded |
| `retryContext` | `RetryContext \| undefined` | Only available in Node worker mode |

### AzureContext methods

| Method | Description |
| ------ | ----------- |
| `log(message, ...args)` | Log info message |
| `info(message, ...args)` | Alias for `log()` |
| `warn(message, ...args)` | Log warning |
| `error(message, ...args)` | Log error |
| `trace(message, ...args)` | Log trace/debug |
| `logWithContext(message, ...args)` | Log with invocation ID prefix |

## Low-level APIs

### Node worker only

Use `getAzureContext()` when you explicitly need the raw Azure `InvocationContext`.
Use `getAzureRequest()` when you need Azure-specific HTTP fields that are not part of the standard Web `Request`, such as authenticated user information or Azure host route parameters.

```typescript
import {
  getAzureContext,
  getAzureRequest,
} from "@opsydyn/elysia-az-functionapp";

const app = new Elysia().get("/example", ({ request }) => {
  const invocation = getAzureContext(request);
  const azureRequest = getAzureRequest(request);

  return {
    invocationId: invocation?.invocationId,
    user: azureRequest?.user?.username,
    azureRouteParams: azureRequest?.params,
  };
});
```

### Bun custom-handler helpers

Use these from the Bun subpath:

```typescript
import {
  azureBunFetch,
  azureBunServe,
  getAzureCustomHandlerContext,
} from "@opsydyn/elysia-az-functionapp/bun";
```

`azureBunServe()` is the ergonomic default. `azureBunFetch()` is useful when you want to compose your own Bun `fetch` handler.

## API reference

### Root entrypoint

- `azure()`
- `azureElysiaHandler(app, options?)`
- `getAzureContext(request)`
- `getAzureRequest(request)`
- `getAzureCustomHandlerContext(request)`
- `getAzureRuntimeContext(request)`
- `AzureContext`
- `AzureElysiaHandlerOptions`
- `AZURE_CONTEXT`
- `AZURE_REQUEST`
- `AZURE_CUSTOM_HANDLER_CONTEXT`

### Bun entrypoint

- `azureBunServe(app, config?)`
- `azureBunFetch(app, context?)`
- `createAzureBunServeOptions(app, config?)`
- `getAzureCustomHandlerPort()`

Generate the full TypeDoc API reference locally with:

```bash
npm run docs:api
```

## Production checklist

- Enable `app.setup({ enableHttpStream: true })` before registering HTTP triggers that use streams or SSE.
- Use `trustForwardedHeaders: true` only behind trusted Azure or reverse-proxy infrastructure.
- Keep `routePrefix` aligned with your Elysia routes. Most catch-all Elysia apps should use `"routePrefix": ""` and `route: "{*proxy}"`.
- Use Azure App Service / Functions authentication, APIM, Easy Auth, or your own Elysia auth plugin for protected routes. This adapter exposes Azure auth metadata but does not enforce auth policies by itself.
- For long-running SSE, disable response buffering in APIM and avoid policies that read the response body.
- For Bun custom handlers, deploy with a Linux-compatible Bun binary or a custom container.
- Run `npm run build`, `npm test`, `npm run lint`, `npm run docs:api:check`, `npm run size`, and `npm run pack:dry-run` before publishing.

## Limitations

- Azure Functions does not expose an interruption signal for HTTP requests in the Node worker model.
- Bun support uses **Azure Custom Handlers**, so Azure host configuration is still required.
- Bun mode is currently focused on **HTTP-triggered** applications.
- Native Elysia WebSocket routes are not supported by the Node worker adapter because Azure Functions HTTP triggers do not expose the raw upgrade socket. Use Azure Web PubSub or Azure SignalR Service for production bidirectional realtime messaging.
- Azure Custom Handlers must start within 60 seconds.
- Bun deployments with platform-specific binaries should be built for the target OS or shipped in a custom container.

## Untested scenarios

- End-to-end Azure Functions host streaming smoke tests under Core Tools and deployed Azure infrastructure.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Credits

This adapter is based on [hono-azurefunc-adapter](https://github.com/Marplex/hono-azurefunc-adapter) by [@Marplex](https://github.com/Marplex), ported to work with Elysia.

## License

MIT
