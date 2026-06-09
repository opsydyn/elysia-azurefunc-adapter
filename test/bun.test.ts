import assert from "node:assert";
import { afterEach, describe, it, mock } from "node:test";
import { Elysia } from "elysia";
import { azure } from "../dist/index.mjs";
import {
	azureBunFetch,
	azureBunServe,
	getAzureCustomHandlerPort,
	type AzureBunServeOptions,
} from "../dist/bun.mjs";

const createApp = () => new Elysia({ sucrose: { gcTime: null } });

type BunGlobal = typeof globalThis & {
	Bun?: {
		serve: (options: AzureBunServeOptions) => {
			port: number;
			hostname?: string;
			stop(closeActiveConnections?: boolean): void;
		};
	};
};

const unsetEnv = (key: keyof NodeJS.ProcessEnv) => {
	Reflect.deleteProperty(process.env, key);
};

const unsetBunRuntime = () => {
	Reflect.deleteProperty(globalThis as BunGlobal, "Bun");
};

const originalCustomHandlerPort = process.env.FUNCTIONS_CUSTOMHANDLER_PORT;
const originalPort = process.env.PORT;
const originalWorkerRuntime = process.env.FUNCTIONS_WORKER_RUNTIME;
const originalBun = (globalThis as BunGlobal).Bun;

afterEach(() => {
	if (originalCustomHandlerPort === undefined) {
		unsetEnv("FUNCTIONS_CUSTOMHANDLER_PORT");
	} else {
		process.env.FUNCTIONS_CUSTOMHANDLER_PORT = originalCustomHandlerPort;
	}

	if (originalPort === undefined) {
		unsetEnv("PORT");
	} else {
		process.env.PORT = originalPort;
	}

	if (originalWorkerRuntime === undefined) {
		unsetEnv("FUNCTIONS_WORKER_RUNTIME");
	} else {
		process.env.FUNCTIONS_WORKER_RUNTIME = originalWorkerRuntime;
	}

	if (originalBun === undefined) {
		unsetBunRuntime();
	} else {
		(globalThis as BunGlobal).Bun = originalBun;
	}
});

describe("Bun custom handler support", () => {
	it("should expose Azure metadata through the shared azure() plugin", async () => {
		const app = createApp()
			.use(azure())
			.get("/bun", ({ azure }) => ({
				isAzure: azure.isAzure,
				hasRaw: azure.raw !== undefined,
				invocationId: azure.invocationId,
				functionName: azure.functionName,
				traceParent: azure.traceContext?.traceParent,
			}));

		const fetch = azureBunFetch(app, {
			functionName: "HttpTrigger",
		});

		const response = await fetch(
			new Request("http://localhost/bun", {
				headers: {
					"x-azure-functions-invocationid":
						"12345678-1234-1234-1234-123456789012",
					traceparent:
						"00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
				},
			}),
			{} as never,
		);

		assert.strictEqual(response.status, 200);
		assert.deepStrictEqual(await response.json(), {
			isAzure: true,
			hasRaw: false,
			invocationId: "12345678-1234-1234-1234-123456789012",
			functionName: "HttpTrigger",
			traceParent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
		});
	});

	it("should remain local when Bun is used outside Azure Functions", async () => {
		unsetEnv("FUNCTIONS_CUSTOMHANDLER_PORT");
		unsetEnv("FUNCTIONS_WORKER_RUNTIME");

		const app = createApp()
			.use(azure())
			.get("/local", ({ azure }) => ({
				isAzure: azure.isAzure,
				invocationId: azure.invocationId ?? null,
			}));

		const response = await azureBunFetch(app)(
			new Request("http://localhost/local"),
			{} as never,
		);

		assert.strictEqual(response.status, 200);
		assert.deepStrictEqual(await response.json(), {
			isAzure: false,
			invocationId: null,
		});
	});

	it("should resolve the custom-handler port from environment variables", () => {
		process.env.FUNCTIONS_CUSTOMHANDLER_PORT = "7071";
		process.env.PORT = "3001";
		assert.strictEqual(getAzureCustomHandlerPort(), 7071);

		unsetEnv("FUNCTIONS_CUSTOMHANDLER_PORT");
		assert.strictEqual(getAzureCustomHandlerPort(), 3001);

		unsetEnv("PORT");
		assert.strictEqual(getAzureCustomHandlerPort(), 3000);
	});

	it("should delegate to Bun.serve with the Azure-aware fetch handler", async () => {
		const serveMock = mock.fn((options: AzureBunServeOptions) => ({
			port: options.port,
			hostname: options.hostname,
			stop() {
				// noop
			},
		}));
		(globalThis as BunGlobal).Bun = {
			serve: serveMock,
		};
		process.env.FUNCTIONS_CUSTOMHANDLER_PORT = "9191";

		const app = createApp().get("/", () => "ok");
		const server = azureBunServe(app, {
			hostname: "127.0.0.1",
		});

		assert.strictEqual(serveMock.mock.calls.length, 1);
		const options = serveMock.mock.calls[0].arguments[0];
		assert.strictEqual(options.port, 9191);
		assert.strictEqual(options.hostname, "127.0.0.1");

		const response = await options.fetch(
			new Request("http://localhost/"),
			{} as never,
		);
		assert.strictEqual(await response.text(), "ok");
		assert.strictEqual(server.port, 9191);
	});

	it("should throw a clear error when Bun runtime APIs are unavailable", () => {
		unsetBunRuntime();

		assert.throws(
			() => azureBunServe(createApp()),
			/The Bun runtime is not available/,
		);
	});
});
