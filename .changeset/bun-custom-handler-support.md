---
"@opsydyn/elysia-az-functionapp": minor
---

Add first-class Bun custom-handler support via the `@opsydyn/elysia-az-functionapp/bun` subpath, unify Azure request context handling across Node worker and Bun runtimes, preserve the raw Azure `HttpRequest` for auth user and route metadata access, remove duplicate `set-cookie` response headers when using Azure's cookie output, rename the package to `@opsydyn/elysia-az-functionapp`, and fix cookie parsing to preserve cookie-name casing.
