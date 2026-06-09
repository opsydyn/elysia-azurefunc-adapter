import assert from "node:assert";
import { describe, it } from "node:test";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { Elysia } from "elysia";
import {
	AZURE_CONTEXT,
	azure,
	azureElysiaHandler,
	getAzureContext,
} from "../dist/index.mjs";
import type { AzureContext } from "../dist/index.mjs";

const createApp = () => new Elysia({ sucrose: { gcTime: null } });

const drainResponseBody = async (response: { body?: AsyncIterable<unknown> }) => {
	if (!response.body) return;
	for await (const _ of response.body) {
		// drain
	}
};

/** Helper to cast partial mock objects to HttpRequest */
const asRequest = (partial: Record<string, unknown>) =>
	partial as unknown as HttpRequest;

/** Helper to cast partial mock objects to InvocationContext */
const asContext = (partial: Record<string, unknown>) =>
	partial as unknown as InvocationContext;

describe("azureElysiaHandler", () => {
	it("should create a handler function", () => {
		const app = createApp().get("/", () => "Hello");
		const handler = azureElysiaHandler(app);

		assert.strictEqual(typeof handler, "function");
	});

	it("should handle GET request", async () => {
		const app = createApp().get("/test", () => ({ message: "ok" }));
		const handler = azureElysiaHandler(app);

		const mockRequest = asRequest({
			url: "http://localhost/test",
			method: "GET",
			headers: new Map([["accept", "application/json"]]),
		});

		const mockContext = asContext({
			invocationId: "test-123",
			functionName: "testFunc",
			log: () => {},
		});

		const response = await handler(mockRequest, mockContext);

		assert.ok(response);
		assert.strictEqual(response.status, 200);
		await drainResponseBody(response);
	});

	it("should handle POST request with body", async () => {
		const app = createApp().post("/data", async ({ body }) => ({
			received: body,
		}));
		const handler = azureElysiaHandler(app);

		const bodyData = JSON.stringify({ test: "data" });
		const mockRequest = asRequest({
			url: "http://localhost/data",
			method: "POST",
			headers: new Map([
				["content-type", "application/json"],
				["content-length", String(bodyData.length)],
			]),
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(bodyData));
					controller.close();
				},
			}),
		});

		const mockContext = asContext({
			invocationId: "test-456",
			log: () => {},
		});

		const response = await handler(mockRequest, mockContext);

		assert.ok(response);
		assert.strictEqual(response.status, 200);
		await drainResponseBody(response);
	});

	it("should attach InvocationContext to request", async () => {
		let capturedContext: InvocationContext | undefined;

		const app = createApp().get("/context", ({ request }) => {
			capturedContext = getAzureContext(request);
			return { ok: true };
		});

		const handler = azureElysiaHandler(app);

		const mockRequest = asRequest({
			url: "http://localhost/context",
			method: "GET",
			headers: new Map(),
		});

		const mockContext = asContext({
			invocationId: "ctx-789",
			functionName: "contextTest",
			log: () => {},
		});

		const response = await handler(mockRequest, mockContext);

		assert.ok(capturedContext);
		assert.strictEqual(capturedContext.invocationId, "ctx-789");
		assert.strictEqual(capturedContext.functionName, "contextTest");
		await drainResponseBody(response);
	});

	it("should return Azure-compatible response format", async () => {
		const app = createApp().get("/", () => "Hello Azure");
		const handler = azureElysiaHandler(app);

		const mockRequest = asRequest({
			url: "http://localhost/",
			method: "GET",
			headers: new Map(),
		});

		const mockContext = asContext({ log: () => {} });

		const response = await handler(mockRequest, mockContext);

		assert.ok(response);
		assert.ok("status" in response);
		assert.ok("headers" in response);
		assert.ok("body" in response);
		await drainResponseBody(response);
	});

	it("should handle cookies in response", async () => {
		const app = createApp().get("/cookie", ({ cookie }) => {
			cookie.session.set({
				value: "abc123",
				httpOnly: true,
				path: "/",
			});
			return { ok: true };
		});

		const handler = azureElysiaHandler(app);

		const mockRequest = asRequest({
			url: "http://localhost/cookie",
			method: "GET",
			headers: new Map(),
		});

		const mockContext = asContext({ log: () => {} });

		const response = await handler(mockRequest, mockContext);

		assert.ok(response);
		// Cookies should be extracted
		if (response.cookies) {
			assert.ok(Array.isArray(response.cookies));
		}
		await drainResponseBody(response);
	});
});

describe("azure plugin", () => {
	it("should add azure context to routes", async () => {
		let capturedAzureCtx: AzureContext | undefined;

		const app = createApp().use(azure()).get("/test", ({ azure }) => {
			capturedAzureCtx = azure;
			return { ok: true };
		});

		const handler = azureElysiaHandler(app);

		const mockRequest = asRequest({
			url: "http://localhost/test",
			method: "GET",
			headers: new Map(),
		});

		const mockContext = asContext({
			invocationId: "plugin-test",
			log: () => {},
		});

		await handler(mockRequest, mockContext);

		assert.ok(capturedAzureCtx);
		assert.strictEqual(typeof capturedAzureCtx.log, "function");
		assert.strictEqual(typeof capturedAzureCtx.warn, "function");
		assert.strictEqual(typeof capturedAzureCtx.error, "function");
		assert.strictEqual(capturedAzureCtx.isAzure, true);
	});

	it("should work without InvocationContext", async () => {
		let capturedAzureCtx: AzureContext | undefined;

		const app = createApp().use(azure()).get("/local", ({ azure }) => {
			capturedAzureCtx = azure;
			return { ok: true };
		});

		const handler = azureElysiaHandler(app);

		const mockRequest = asRequest({
			url: "http://localhost/local",
			method: "GET",
			headers: new Map(),
		});

		// Simulate no Azure context by not providing InvocationContext
		const response = await handler(mockRequest, undefined as never);

		assert.ok(capturedAzureCtx);
		assert.strictEqual(capturedAzureCtx?.isAzure, false);
		assert.strictEqual(capturedAzureCtx?.invocationId, undefined);
		await drainResponseBody(response);
	});

	it("should allow custom plugin name", () => {
		const app = createApp().use(azure({ name: "custom-azure" }));

		// Plugin should be registered
		assert.ok(app);
	});
});

describe("getAzureContext", () => {
	it("should retrieve context from request", () => {
		const mockContext = asContext({
			invocationId: "test-id",
			functionName: "testFunc",
		});

		const request = new Request("http://localhost/test");
		request[AZURE_CONTEXT] = mockContext;

		const retrieved = getAzureContext(request);

		assert.strictEqual(retrieved, mockContext);
		assert.strictEqual(retrieved?.invocationId, "test-id");
	});

	it("should return undefined when no context attached", () => {
		const request = new Request("http://localhost/test");

		const retrieved = getAzureContext(request);

		assert.strictEqual(retrieved, undefined);
	});
});

describe("AZURE_CONTEXT symbol", () => {
	it("should be a unique symbol", () => {
		assert.strictEqual(typeof AZURE_CONTEXT, "symbol");
	});

	it("should be usable as object key", () => {
		const request = new Request("http://localhost/test");
		request[AZURE_CONTEXT] = asContext({ invocationId: "test-value" });

		assert.strictEqual(request[AZURE_CONTEXT]?.invocationId, "test-value");
	});
});
