# Bun custom-handler example

This example shows how to run an Elysia app on Azure Functions using Bun Custom Handlers and `@opsydyn/elysia-az-functionapp`.

## What is included

- `src/app.ts` — shared Elysia app using the `azure()` plugin
- `src/bun.ts` — Bun entrypoint using `azureBunServe()`
- `host.json` — Azure Functions host configuration for Bun custom handlers
- `HttpTrigger/function.json` — catch-all HTTP trigger
- `local.settings.example.json` — local Azure Functions settings template

## Getting started

1. Install dependencies:

   ```bash
   bun install
   ```

2. Copy the local settings template:

   ```bash
   cp local.settings.example.json local.settings.json
   ```

3. Start Azure Functions Core Tools:

   ```bash
   bun run dev
   ```

4. Try the example:

   ```bash
   curl http://127.0.0.1:7071/
   curl http://127.0.0.1:7071/health
   curl -X POST http://127.0.0.1:7071/echo -H 'content-type: application/json' -d '{"hello":"world"}'
   ```

## Notes

- This example imports the local workspace source through `src/adapter.ts` so it runs cleanly inside this repository without extra install steps.
- If you copy this example into another repository, replace the `./adapter` imports with `@opsydyn/elysia-az-functionapp` and `@opsydyn/elysia-az-functionapp/bun`, then add the published package as a dependency.
- For Azure deployment, prefer Linux CI or a custom container so the Bun binary matches the target platform.
