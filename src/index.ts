/**
 * @module @opsydyn/elysia-az-functionapp
 * @description Azure Functions adapter for Elysia with support for the Node.js worker model and Bun custom handlers.
 * @license MIT
 */

import type {
	HttpRequest,
	InvocationContext,
	RetryContext,
	TraceContext,
} from "@azure/functions";
import type { AnyElysia } from "elysia";
import { Elysia } from "elysia";
import {
	attachAzureContext,
	getAzureContext as getAzureInvocationContext,
	getAzureRuntimeContext,
	isAzureCustomHandlerContext,
	type AzureRuntimeContext,
} from "./context";
import { newRequestFromAzureFunctions } from "./request";
import { newAzureFunctionsResponse } from "./response";

/**
 * Creates an Azure Functions HTTP handler from an Elysia application.
 *
 * This is the main entry point for integrating Elysia with Azure Functions.
 * It converts Azure's HttpRequest to a standard Web Request, processes it
 * through Elysia, and converts the response back to Azure's format.
 *
 * @param app - The Elysia application instance to handle requests
 * @returns An Azure Functions HTTP handler function
 *
 * @example
 * ```typescript
 * // src/functions/httpTrigger.ts
 * import { app } from '@azure/functions'
 * import { azureElysiaHandler } from '@opsydyn/elysia-az-functionapp'
 * import elysiaApp from '../app'
 *
 * app.http('httpTrigger', {
 *   methods: ['GET', 'POST', 'PUT', 'DELETE'],
 *   authLevel: 'anonymous',
 *   route: '{*proxy}',
 *   handler: azureElysiaHandler(elysiaApp),
 * })
 * ```
 */
export function azureElysiaHandler(app: AnyElysia) {
	return async (request: HttpRequest, context: InvocationContext) => {
		const webRequest = newRequestFromAzureFunctions(request);
		// Attach the invocation context to the request
		attachAzureContext(webRequest, context);

		return newAzureFunctionsResponse(await app.handle(webRequest));
	};
}

/**
 * Retrieves the Azure InvocationContext from an Elysia request.
 *
 * This is a low-level API for accessing the raw Azure context when you need
 * direct access to Azure Functions features not exposed by the `azure()` plugin.
 *
 * @param request - The Web Request object from Elysia's context
 * @returns The Azure InvocationContext if running in Azure Functions, undefined otherwise
 *
 * @example
 * ```typescript
 * import { Elysia } from 'elysia'
 * import { getAzureContext } from '@opsydyn/elysia-az-functionapp'
 *
 * const app = new Elysia()
 *   .get('/api/hello', ({ request }) => {
 *     const ctx = getAzureContext(request)
 *     if (ctx) {
 *       ctx.log('Running in Azure!')
 *     }
 *     return { ok: true }
 *   })
 * ```
 */
export function getAzureContext(
	request: Request,
): InvocationContext | undefined {
	return getAzureInvocationContext(request);
}

/**
 * Wrapper class for Azure Functions context with helper methods.
 *
 * Provides a consistent API for accessing Azure Functions context properties
 * and logging methods across both the Node.js worker model and Bun custom handlers,
 * with automatic fallback to console methods when running locally.
 *
 * @example
 * ```typescript
 * // Usually accessed via the azure() plugin:
 * app.get('/api/hello', ({ azure }) => {
 *   azure.log('Processing request')
 *   return { invocationId: azure.invocationId }
 * })
 *
 * // Or instantiate directly:
 * const ctx = new AzureContext(invocationContext)
 * ctx.logWithContext('Hello!')
 * ```
 */
export class AzureContext {
	/**
	 * Creates a new AzureContext wrapper.
	 * @param ctx - The Azure runtime context, or undefined if not running in Azure
	 */
	constructor(private ctx: AzureRuntimeContext | undefined) {}

	private get invocationContext(): InvocationContext | undefined {
		return isAzureCustomHandlerContext(this.ctx) ? undefined : this.ctx;
	}

	private get customHandlerContext() {
		return isAzureCustomHandlerContext(this.ctx) ? this.ctx : undefined;
	}

	/**
	 * Whether the application is currently running in Azure Functions.
	 * @returns `true` if running in Azure Functions, `false` otherwise
	 */
	get isAzure(): boolean {
		return (
			this.customHandlerContext?.isAzure ?? this.invocationContext !== undefined
		);
	}

	/**
	 * The raw Azure InvocationContext for advanced usage.
	 * Returns `undefined` in Bun custom handler mode because Azure does not expose
	 * InvocationContext to custom handlers.
	 * @returns The InvocationContext if running in the Node.js worker, undefined otherwise
	 */
	get raw(): InvocationContext | undefined {
		return this.invocationContext;
	}

	/**
	 * The unique identifier for this function invocation.
	 * Useful for correlating logs and distributed tracing.
	 * @returns The invocation ID string, or undefined if not in Azure
	 */
	get invocationId(): string | undefined {
		return (
			this.customHandlerContext?.invocationId ??
			this.invocationContext?.invocationId
		);
	}

	/**
	 * The name of the Azure Function being executed.
	 * @returns The function name, or undefined if not in Azure
	 */
	get functionName(): string | undefined {
		return (
			this.customHandlerContext?.functionName ??
			this.invocationContext?.functionName
		);
	}

	/**
	 * Metadata about the trigger that initiated this invocation.
	 * Contains information specific to the trigger type (HTTP, Queue, etc.).
	 * @returns Trigger metadata object, or undefined if not in Azure
	 */
	get triggerMetadata(): Record<string, unknown> | undefined {
		return (
			this.customHandlerContext?.triggerMetadata ??
			this.invocationContext?.triggerMetadata
		);
	}

	/**
	 * Distributed tracing context for Application Insights integration.
	 * Use this for correlating requests across services.
	 * @returns The TraceContext, or undefined if not in Azure
	 */
	get traceContext(): TraceContext | undefined {
		return (
			this.customHandlerContext?.traceContext ??
			this.invocationContext?.traceContext
		);
	}

	/**
	 * Retry information if the function is configured with a retry policy.
	 * @returns The RetryContext, or undefined if not in Azure or no retry policy
	 */
	get retryContext(): RetryContext | undefined {
		return (
			this.customHandlerContext?.retryContext ??
			this.invocationContext?.retryContext
		);
	}

	/**
	 * Logs an informational message.
	 * Falls back to `console.log` when not running in Azure.
	 * @param message - The message to log
	 * @param args - Additional arguments to include in the log
	 */
	log(message: string, ...args: unknown[]): void {
		if (this.customHandlerContext) {
			this.customHandlerContext.log(message, ...args);
		} else if (this.invocationContext) {
			this.invocationContext.log(message, ...args);
		} else {
			console.log(message, ...args);
		}
	}

	/**
	 * Alias for {@link log}. Logs an informational message.
	 * @param message - The message to log
	 * @param args - Additional arguments to include in the log
	 */
	info(message: string, ...args: unknown[]): void {
		this.log(message, ...args);
	}

	/**
	 * Logs a warning message.
	 * Falls back to `console.warn` when not running in Azure.
	 * @param message - The warning message to log
	 * @param args - Additional arguments to include in the log
	 */
	warn(message: string, ...args: unknown[]): void {
		if (this.customHandlerContext) {
			this.customHandlerContext.warn(message, ...args);
		} else if (this.invocationContext) {
			this.invocationContext.warn(message, ...args);
		} else {
			console.warn(message, ...args);
		}
	}

	/**
	 * Logs an error message.
	 * Falls back to `console.error` when not running in Azure.
	 * @param message - The error message to log
	 * @param args - Additional arguments to include in the log
	 */
	error(message: string, ...args: unknown[]): void {
		if (this.customHandlerContext) {
			this.customHandlerContext.error(message, ...args);
		} else if (this.invocationContext) {
			this.invocationContext.error(message, ...args);
		} else {
			console.error(message, ...args);
		}
	}

	/**
	 * Logs a trace/debug message.
	 * Falls back to `console.debug` when not running in Azure.
	 * @param message - The trace message to log
	 * @param args - Additional arguments to include in the log
	 */
	trace(message: string, ...args: unknown[]): void {
		if (this.customHandlerContext) {
			this.customHandlerContext.trace(message, ...args);
		} else if (this.invocationContext) {
			this.invocationContext.trace(message, ...args);
		} else {
			console.debug(message, ...args);
		}
	}

	/**
	 * Logs a message prefixed with the invocation ID for easy correlation.
	 * Uses `[local]` as prefix when not running in Azure.
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to include in the log
	 *
	 * @example
	 * ```typescript
	 * azure.logWithContext('Processing request')
	 * // Output in Azure: [abc12345] Processing request
	 * // Output locally: [local] Processing request
	 * ```
	 */
	logWithContext(message: string, ...args: unknown[]): void {
		const prefix = this.invocationId
			? `[${this.invocationId.slice(0, 8)}]`
			: "[local]";
		this.log(`${prefix} ${message}`, ...args);
	}
}

/**
 * Configuration options for the azure() plugin.
 */
export interface AzurePluginConfig {
	/**
	 * Custom name for the plugin instance.
	 * Used for Elysia's plugin deduplication mechanism.
	 * @default "elysia-azure-functions"
	 */
	name?: string;
}

/**
 * Elysia plugin that provides Azure Functions context in route handlers.
 *
 * Adds an `azure` object to the request context with access to:
 * - Invocation metadata (ID, function name, trigger info)
 * - Distributed tracing context
 * - Logging methods with automatic console fallback for local development
 *
 * @param config - Optional plugin configuration
 * @returns An Elysia plugin instance
 *
 * @example
 * Basic usage:
 * ```typescript
 * import { Elysia } from 'elysia'
 * import { azure } from '@opsydyn/elysia-az-functionapp'
 *
 * const app = new Elysia()
 *   .use(azure())
 *   .get('/hello', ({ azure }) => {
 *     azure.log('Hello from Azure!')
 *     return {
 *       invocationId: azure.invocationId,
 *       isAzure: azure.isAzure
 *     }
 *   })
 * ```
 *
 * @example
 * With custom plugin name (for multiple instances):
 * ```typescript
 * app.use(azure({ name: 'my-azure-plugin' }))
 * ```
 */
export const azure = (config?: AzurePluginConfig) => {
	return new Elysia({
		name: config?.name ?? "elysia-azure-functions",
		seed: config,
		sucrose: {
			gcTime: null,
		},
	}).derive({ as: "scoped" }, ({ request }) => ({
		azure: new AzureContext(getAzureRuntimeContext(request)),
	}));
};

export {
	AZURE_CONTEXT,
	AZURE_CUSTOM_HANDLER_CONTEXT,
	createAzureCustomHandlerContext,
	getAzureCustomHandlerContext,
	getAzureRuntimeContext,
} from "./context";

export type { AzureCustomHandlerContext, AzureRuntimeContext } from "./context";

// Re-export utilities for testing
export {
	streamToAsyncIterator,
	headersToObject,
	cookiesFromHeaders,
	parseCookieString,
} from "./utils";

// Re-export types for convenience
export type {
	InvocationContext,
	RetryContext,
	TraceContext,
} from "@azure/functions";
