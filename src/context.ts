import type {
	HttpRequest,
	HttpRequestUser,
	InvocationContext,
	RetryContext,
	TraceContext,
	TriggerMetadata,
} from "@azure/functions";

type AzureLogger = (...args: unknown[]) => void;

/**
 * Symbol used to attach the Azure InvocationContext to the Request object.
 * This allows the context to be passed through Elysia's request handling pipeline.
 */
export const AZURE_CONTEXT: unique symbol = Symbol("azure-invocation-context");

/**
 * Symbol used to attach the raw Azure HttpRequest to the Web Request object.
 * This preserves Azure-specific request fields that are not part of Fetch.
 */
export const AZURE_REQUEST: unique symbol = Symbol("azure-http-request");

/**
 * Symbol used to attach Azure Custom Handler metadata to the Request object.
 * This is used by Bun custom-handler mode where no InvocationContext is available.
 */
export const AZURE_CUSTOM_HANDLER_CONTEXT: unique symbol = Symbol(
	"azure-custom-handler-context",
);

/**
 * Lightweight Azure context attached to proxied HTTP requests in custom-handler mode.
 */
export interface AzureCustomHandlerContext {
	kind: "custom-handler";
	isAzure: boolean;
	request?: Request;
	invocationId?: string;
	functionName?: string;
	traceContext?: TraceContext;
	retryContext?: RetryContext;
	triggerMetadata?: TriggerMetadata;
	log: AzureLogger;
	info: AzureLogger;
	warn: AzureLogger;
	error: AzureLogger;
	trace: AzureLogger;
}

/**
 * Initialization options for {@link AzureCustomHandlerContext}.
 */
export interface AzureCustomHandlerContextInit {
	isAzure?: boolean;
	request?: Request;
	invocationId?: string;
	functionName?: string;
	traceContext?: TraceContext;
	retryContext?: RetryContext;
	triggerMetadata?: TriggerMetadata;
	log?: AzureLogger;
	info?: AzureLogger;
	warn?: AzureLogger;
	error?: AzureLogger;
	trace?: AzureLogger;
}

export type AzureRuntimeContext = InvocationContext | AzureCustomHandlerContext;

declare global {
	interface Request {
		[AZURE_CONTEXT]?: InvocationContext;
		[AZURE_REQUEST]?: HttpRequest;
		[AZURE_CUSTOM_HANDLER_CONTEXT]?: AzureCustomHandlerContext;
	}
}

const readHeader = (headers: Headers, key: string): string | undefined => {
	return headers.get(key) ?? undefined;
};

const isAzureCustomHandlerRequest = (headers: Headers): boolean => {
	return (
		headers.has("x-azure-functions-invocationid") ||
		Boolean(process.env.FUNCTIONS_CUSTOMHANDLER_PORT) ||
		process.env.FUNCTIONS_WORKER_RUNTIME?.toLowerCase() === "custom"
	);
};

const createTraceContextFromHeaders = (
	headers: Headers,
): TraceContext | undefined => {
	const traceParent = readHeader(headers, "traceparent");
	const traceState = readHeader(headers, "tracestate");

	if (!traceParent && !traceState) {
		return undefined;
	}

	return {
		traceParent,
		traceState,
	};
};

const getFunctionNameFromHeaders = (headers: Headers): string | undefined => {
	return (
		readHeader(headers, "x-azure-functions-functionname") ??
		readHeader(headers, "x-azure-functions-function-name")
	);
};

/**
 * Creates a custom-handler Azure context from a proxied HTTP request.
 */
export const createAzureCustomHandlerContext = (
	request: Request,
	init: AzureCustomHandlerContextInit = {},
): AzureCustomHandlerContext => {
	const log = init.log ?? ((...args: unknown[]) => console.log(...args));

	return {
		kind: "custom-handler",
		isAzure: init.isAzure ?? isAzureCustomHandlerRequest(request.headers),
		request: init.request ?? request,
		invocationId:
			init.invocationId ??
			readHeader(request.headers, "x-azure-functions-invocationid"),
		functionName:
			init.functionName ?? getFunctionNameFromHeaders(request.headers),
		traceContext:
			init.traceContext ?? createTraceContextFromHeaders(request.headers),
		retryContext: init.retryContext,
		triggerMetadata: init.triggerMetadata,
		log,
		info: init.info ?? ((...args: unknown[]) => log(...args)),
		warn: init.warn ?? ((...args: unknown[]) => console.warn(...args)),
		error: init.error ?? ((...args: unknown[]) => console.error(...args)),
		trace: init.trace ?? ((...args: unknown[]) => console.debug(...args)),
	};
};

export const attachAzureContext = (
	request: Request,
	context: InvocationContext,
): Request => {
	request[AZURE_CONTEXT] = context;
	return request;
};

export const attachAzureRequest = (
	request: Request,
	azureRequest: HttpRequest,
): Request => {
	request[AZURE_REQUEST] = azureRequest;
	return request;
};

export const attachAzureCustomHandlerContext = (
	request: Request,
	context: AzureCustomHandlerContext,
): Request => {
	request[AZURE_CUSTOM_HANDLER_CONTEXT] = context;
	return request;
};

/**
 * Retrieves the raw Azure InvocationContext from a request.
 */
export const getAzureContext = (
	request: Request,
): InvocationContext | undefined => {
	return request[AZURE_CONTEXT];
};

/**
 * Retrieves the raw Azure HttpRequest from a Web Request.
 */
export const getAzureRequest = (request: Request): HttpRequest | undefined => {
	return request[AZURE_REQUEST];
};

/**
 * Retrieves custom-handler Azure metadata from a request.
 */
export const getAzureCustomHandlerContext = (
	request: Request,
): AzureCustomHandlerContext | undefined => {
	return request[AZURE_CUSTOM_HANDLER_CONTEXT];
};

/**
 * Retrieves whichever Azure runtime context is attached to the request.
 */
export const getAzureRuntimeContext = (
	request: Request,
): AzureRuntimeContext | undefined => {
	return getAzureContext(request) ?? getAzureCustomHandlerContext(request);
};

export const isAzureCustomHandlerContext = (
	context: AzureRuntimeContext | undefined,
): context is AzureCustomHandlerContext => {
	return (
		context !== undefined &&
		"kind" in context &&
		context.kind === "custom-handler"
	);
};

export type { HttpRequest, HttpRequestUser };
