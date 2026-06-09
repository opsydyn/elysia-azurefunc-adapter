# Changelog

## 1.3.0

### Minor Changes

- 0109ed9: Add the v2 roadmap and harden the package with Biome and Knip static-analysis gates in CI.

## 1.2.0

### Minor Changes

- eba9b1e: Harden production Azure Functions integration with opt-in trusted forwarded-header URL reconstruction, response stream cancellation on early iterator return, release-time JSR version syncing, TypeDoc API contract checks, and CI checks for bundle size, package contents, and production dependency audit.

## 1.1.0

### Minor Changes

- 4cc10ea: Add first-class Bun custom-handler support via the `@opsydyn/elysia-az-functionapp/bun` subpath, unify Azure request context handling across Node worker and Bun runtimes, preserve the raw Azure `HttpRequest` for auth user and route metadata access, remove duplicate `set-cookie` response headers when using Azure's cookie output, rename the package to `@opsydyn/elysia-az-functionapp`, and fix cookie parsing to preserve cookie-name casing.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-07

### Added

- Initial release
- `azureElysiaHandler()` - Azure Functions HTTP handler for Elysia apps
- `azure()` - Elysia plugin for Azure Functions context access
- `AzureContext` class with logging methods and context properties
- `getAzureContext()` - Low-level API for raw InvocationContext access
- Full TypeScript support with JSDoc documentation
- ESM and CommonJS builds
- Node.js 22+ support
- Renovate automated dependency updates
