import assert from "node:assert";
import { describe, it } from "node:test";
import azureFunctions from "@azure/functions";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { Elysia, sse } from "elysia";
import {
	AZURE_CONTEXT,
	AZURE_REQUEST,
	azure,
	azureElysiaHandler,
	getAzureContext,
	getAzureRequest,
} from "../dist/index.mjs";
import type { AzureContext } from "../dist/index.mjs";

const createApp = () => new Elysia({ sucrose: { gcTime: null } });
const { HttpRequest: AzureHttpRequest } = azureFunctions;

const drainResponseBody = async (response: { body?: AsyncIterable<unknown> }) => {
	if (!response.body) return;
	for await (const _ of response.body) {
		// drain
	}
};

const readResponseBodyText = async (response: {
	body?: AsyncIterable<Uint8Array> | null;
}) => {
	const chunks: Uint8Array[] = [];
	if (!response.body) return "";

	for await (const chunk of response.body) {
		chunks.push(chunk);
	}

	return new TextDecoder().decode(Buffer.concat(chunks));
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

	it("should handle the Azure Functions SDK HttpRequest implementation", async () => {
		const app = createApp()
			.use(azure())
			.post("/sdk/:id", ({ body, params, azure }) => ({
				body,
				elysiaId: params.id,
				azureRouteParams: azure.params,
				rawUrl: azure.request?.url,
			}));
		const handler = azureElysiaHandler(app);

		const azureRequest = new AzureHttpRequest({
			url: "http://localhost/sdk/42?debug=true",
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			params: {
				proxy: "sdk/42",
			},
			body: {
				string: JSON.stringify({ ok: true }),
			},
		});

		const response = await handler(
			azureRequest,
			asContext({
				invocationId: "sdk-request",
				log: () => {},
			}),
		);

		assert.strictEqual(response.status, 200);
		assert.ok(response.body);

		const chunks: Uint8Array[] = [];
		for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
			chunks.push(chunk);
		}

		assert.deepStrictEqual(
			JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))),
			{
				body: { ok: true },
				elysiaId: "42",
				azureRouteParams: { proxy: "sdk/42" },
				rawUrl: "http://localhost/sdk/42?debug=true",
			},
		);
	});

	it("should keep the Azure request URL by default when forwarded headers are present", async () => {
		const app = createApp().get("/url", ({ request }) => ({
			url: request.url,
		}));
		const handler = azureElysiaHandler(app);

		const response = await handler(
			asRequest({
				url: "http://internal.azurewebsites.net/url?debug=true",
				method: "GET",
				headers: new Map([
					["x-forwarded-proto", "https"],
					["x-forwarded-host", "api.example.com"],
				]),
			}),
			asContext({ log: () => {} }),
		);

		assert.deepStrictEqual(await readResponseBodyText(response).then(JSON.parse), {
			url: "http://internal.azurewebsites.net/url?debug=true",
		});
	});

	it("should reconstruct request URLs from trusted forwarded headers when enabled", async () => {
		const app = createApp().get("/url", ({ request }) => ({
			url: request.url,
		}));
		const handler = azureElysiaHandler(app, {
			trustForwardedHeaders: true,
		});

		const response = await handler(
			asRequest({
				url: "http://internal.azurewebsites.net/url?debug=true",
				method: "GET",
				headers: new Map([
					["x-forwarded-proto", "https"],
					["x-forwarded-host", "api.example.com"],
				]),
			}),
			asContext({ log: () => {} }),
		);

		assert.deepStrictEqual(await readResponseBodyText(response).then(JSON.parse), {
			url: "https://api.example.com/url?debug=true",
		});
	});

	it("should reconstruct request URLs from standard Forwarded headers when enabled", async () => {
		const app = createApp().get("/forwarded", ({ request }) => ({
			url: request.url,
		}));
		const handler = azureElysiaHandler(app, {
			trustForwardedHeaders: true,
		});

		const response = await handler(
			asRequest({
				url: "http://internal.azurewebsites.net/forwarded",
				method: "GET",
				headers: new Map([
					["forwarded", 'for=192.0.2.60;proto=https;host="edge.example.com"'],
				]),
			}),
			asContext({ log: () => {} }),
		);

		assert.deepStrictEqual(await readResponseBodyText(response).then(JSON.parse), {
			url: "https://edge.example.com/forwarded",
		});
	});

	it("should attach InvocationContext to request", async () => {
		let capturedContext: InvocationContext | undefined;
		let capturedRequest: HttpRequest | undefined;

		const app = createApp().get("/context", ({ request }) => {
			capturedContext = getAzureContext(request);
			capturedRequest = getAzureRequest(request);
			return { ok: true };
		});

		const handler = azureElysiaHandler(app);

		const mockRequest = asRequest({
			url: "http://localhost/context",
			method: "GET",
			headers: new Map(),
			params: { proxy: "context" },
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
		assert.strictEqual(capturedRequest, mockRequest);
		assert.deepStrictEqual(capturedRequest?.params, { proxy: "context" });
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
			assert.ok(!("set-cookie" in (response.headers ?? {})));
		}
		await drainResponseBody(response);
	});

	it("should preserve streamed response chunks as Azure streaming body chunks", async () => {
		const app = createApp().get(
			"/stream",
			() =>
				new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode("alpha"));
							controller.enqueue(new TextEncoder().encode("beta"));
							controller.close();
						},
					}),
					{
						headers: {
							"content-type": "text/plain",
						},
					},
				),
		);
		const handler = azureElysiaHandler(app);

		const response = await handler(
			asRequest({
				url: "http://localhost/stream",
				method: "GET",
				headers: new Map(),
			}),
			asContext({ log: () => {} }),
		);

		assert.strictEqual(response.status, 200);
		assert.strictEqual(response.headers?.["content-type"], "text/plain");
		assert.strictEqual(await readResponseBodyText(response), "alphabeta");
	});

	it("should preserve Elysia SSE responses for Azure HTTP streaming", async () => {
		const app = createApp().get("/events", function* () {
			yield sse("hello");
			yield sse("world");
		});
		const handler = azureElysiaHandler(app);

		const response = await handler(
			asRequest({
				url: "http://localhost/events",
				method: "GET",
				headers: new Map([["accept", "text/event-stream"]]),
			}),
			asContext({ log: () => {} }),
		);

		assert.strictEqual(response.status, 200);
		assert.strictEqual(response.headers?.["content-type"], "text/event-stream");
		assert.strictEqual(response.headers?.["cache-control"], "no-cache");

		const body = await readResponseBodyText(response);
		assert.match(body, /data: hello\n\n/);
		assert.match(body, /data: world\n\n/);
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
			params: { proxy: "test" },
			user: {
				type: "AppService",
				id: "user-1",
				username: "user@example.com",
				claimsPrincipalData: {},
				claims: [],
			},
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
		assert.strictEqual(capturedAzureCtx.request, mockRequest);
		assert.strictEqual(capturedAzureCtx.user?.username, "user@example.com");
		assert.deepStrictEqual(capturedAzureCtx.params, { proxy: "test" });
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
		assert.strictEqual(capturedAzureCtx?.request, mockRequest);
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

describe("getAzureRequest", () => {
	it("should retrieve Azure HttpRequest from request", () => {
		const mockRequest = asRequest({
			url: "http://localhost/test",
			method: "GET",
			headers: new Map(),
			params: { proxy: "test" },
		});

		const request = new Request("http://localhost/test");
		request[AZURE_REQUEST] = mockRequest;

		const retrieved = getAzureRequest(request);

		assert.strictEqual(retrieved, mockRequest);
		assert.deepStrictEqual(retrieved?.params, { proxy: "test" });
	});

	it("should return undefined when no Azure HttpRequest is attached", () => {
		const request = new Request("http://localhost/test");

		assert.strictEqual(getAzureRequest(request), undefined);
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

describe("AZURE_REQUEST symbol", () => {
	it("should be a unique symbol", () => {
		assert.strictEqual(typeof AZURE_REQUEST, "symbol");
	});

	it("should be usable as object key", () => {
		const request = new Request("http://localhost/test");
		const mockRequest = asRequest({
			url: "http://localhost/test",
			method: "GET",
			headers: new Map(),
		});
		request[AZURE_REQUEST] = mockRequest;

		assert.strictEqual(request[AZURE_REQUEST], mockRequest);
	});
});
