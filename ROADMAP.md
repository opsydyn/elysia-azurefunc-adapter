# Roadmap

This roadmap tracks the path from the current production-focused 1.x adapter to a v2 Azure Functions toolkit for Elysia.

## Release Principles

- Keep the core HTTP adapter small, predictable, and dependency-light.
- Prefer explicit Azure affordances over implicit platform magic.
- Keep preview Azure capabilities behind examples, templates, or optional subpaths until the Azure runtime surface stabilizes.
- Treat package quality gates as product features: types, docs, package shape, bundle size, static analysis, and smoke tests should all fail loudly.

## v1.x Hardening Track

The 1.x line should stay backwards-compatible and focus on production confidence.

- Complete the v1.2 hardening release with trusted forwarded-header URL reconstruction, stream cancellation, TypeDoc API validation, package dry-run checks, and production dependency audit.
- Add `allowedForwardedHosts` to constrain `trustForwardedHeaders` and reduce host-header poisoning risk.
- Add APIM-focused documentation for streaming and SSE, including `buffer-response="false"` and guidance to avoid response-body buffering policies.
- Add Easy Auth documentation for Node worker mode via `azure.user` and custom-handler mode via forwarded identity headers.
- Add a production deployment checklist for APIM, Azure Front Door, App Service authentication, managed identity, Core Tools versions, and streaming support.
- Keep the package bundle budget under 5 KB for the root adapter.
- Keep `npm pack --dry-run`, `publint`, `attw`, TypeDoc, Knip, Biome, tests, and production audit in CI.

## v2 Vision

v2 should evolve from an HTTP adapter into an Azure Functions runtime toolkit for Elysia.

The core package should still expose the familiar API:

```typescript
azureElysiaHandler(app, options);
azure();
```

New runtime capabilities should live in focused subpaths so users only adopt what they need:

```text
@opsydyn/elysia-az-functionapp
@opsydyn/elysia-az-functionapp/bun
@opsydyn/elysia-az-functionapp/mcp
@opsydyn/elysia-az-functionapp/observability
@opsydyn/elysia-az-functionapp/testing
```

## v2 Themes

### Azure Edge and APIM Affordances

- Add `allowedForwardedHosts` and possibly `allowedForwardedProtocols`.
- Add `azure.edge` metadata:
  - `clientIp`
  - `originalHost`
  - `originalProto`
  - `originalUrl`
  - `forwardedFor`
- Normalize common Azure edge headers from APIM, Front Door, App Service, and Functions host forwarding.
- Document APIM policy recipes for SSE, managed identity backend authentication, CORS, request IDs, and rate limiting.
- Provide examples for custom domains and host-name preservation.

### Authentication and Identity

- Normalize Azure App Service / Functions Easy Auth identity into a runtime-neutral helper:
  - `azure.principal`
  - `azure.claims`
  - `azure.getClaim(name)`
  - `azure.hasRole(role)`
- Decode `X-MS-CLIENT-PRINCIPAL` in Bun custom-handler mode.
- Document how to combine Easy Auth with Elysia route guards.
- Add examples for APIM managed identity to Functions, Entra-protected APIs, and local auth simulation.

### MCP Support

- Add an optional MCP subpath for Azure Functions MCP binding integration and self-hosted MCP server patterns.
- Explore helpers such as:
  - `mcpTool()`
  - `mcpResource()`
  - `mcpPrompt()`
  - schema-to-tool metadata generation from Elysia route schemas
- Provide examples where an Elysia app exposes HTTP APIs and MCP tools from the same Functions app.
- Keep the MCP API optional until Azure's TypeScript MCP binding surface is stable enough for a strong abstraction.

### Azure Serverless Agents

- Treat Azure Functions serverless agents runtime support as a sidecar/template track first, not as a core handler dependency.
- Add an `agents-preview` example with:
  - `.agent.md`
  - `agents.config.yaml`
  - `mcp.json`
  - Elysia routes and MCP tools callable by the agent
- Document how agents, MCP servers, and Elysia HTTP endpoints compose in one repository.
- Revisit a first-class API only after the preview runtime settles.

### Observability

- Add an optional observability subpath for Azure Monitor and Application Insights patterns.
- Expose a correlation helper:
  - `invocationId`
  - `functionName`
  - `traceParent`
  - `traceState`
  - request ID headers
- Provide structured logging helpers that preserve Elysia ergonomics while matching Azure telemetry fields.
- Document OpenTelemetry setup for Azure Functions Node worker and custom-handler deployments.

### Testing and Local Runtime Tooling

- Add a small smoke-test helper or CLI:
  - `elysia-az smoke node`
  - `elysia-az smoke bun`
  - `elysia-az smoke stream`
  - `elysia-az smoke sse`
- Package reusable Azurite/Core Tools harness utilities for downstream apps.
- Keep property-based tests around request conversion, streamed bodies, cookies, forwarded headers, and custom-handler metadata.
- Add fixture apps for Node worker, Bun custom handler, APIM-style forwarded headers, Easy Auth, MCP, and agents preview.

### Project Scaffolding

- Add `create-elysia-az-functionapp` or a template command with:
  - Node worker app
  - Bun custom-handler app
  - SSE app
  - Easy Auth app
  - MCP app
  - agents-preview app
- Generate Azure Functions host files, local settings examples, smoke tests, and GitHub Actions.
- Include deployment variants for Flex Consumption, custom containers, and APIM-fronted APIs.

### Package Quality

- Use Biome for fast static linting and eventual formatting once the existing style is intentionally migrated.
- Use Knip to catch unused files, exports, dependencies, and unlisted workflow binaries.
- Keep TypeDoc as an API contract gate.
- Keep `publint` and `attw` as package-shape gates.
- Keep `size-limit` as a bundle budget gate.
- Add release smoke checks against the packed tarball, not only the workspace source.
- Consider a scheduled CI job that installs the published package into the example app and runs Core Tools smoke tests.

## Candidate v2 Breaking Changes

- Raise the minimum Node.js version to match the maintained Azure Functions and tooling baseline.
- Move low-level helper exports into more explicit subpaths if the root API grows too broad.
- Tighten forwarded-header behavior around allowed hosts and protocols.
- Normalize Azure context properties into stable grouped namespaces such as `azure.identity`, `azure.edge`, and `azure.correlation`.
- Remove any legacy aliases that make TypeDoc or Knip report ambiguous public API surface.

## Not Planned for Core

- Native WebSocket support in the Node worker adapter. Azure Functions HTTP triggers do not expose the raw upgrade socket; production bidirectional realtime should use Azure Web PubSub or Azure SignalR Service.
- Mandatory MCP, agents, OpenTelemetry, or Application Insights dependencies in the root package.
- Automatic trust of forwarded headers without explicit user opt-in.
- Hiding Azure host configuration. Azure Functions still owns `host.json`, `function.json` for custom handlers, and worker runtime selection.

## Decision Gates

Before cutting v2:

- At least one real downstream app validates Node worker and Bun custom-handler modes from the packed package.
- The APIM/SSE guidance is verified against Core Tools plus an Azure-hosted deployment path.
- The Easy Auth normalization API is proven in Node worker and custom-handler modes.
- MCP support is either stable enough for a public API or clearly marked as preview/template-only.
- Agents support remains isolated from the core package unless Azure's preview runtime stabilizes.
- CI runs TypeScript, tests, property tests, TypeDoc, Biome, Knip, package lint, size limit, dry-run pack, and production audit.
