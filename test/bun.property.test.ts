import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { Elysia } from "elysia";
import fc from "fast-check";
import { azure } from "../dist/index.mjs";
import {
	azureBunFetch,
	getAzureCustomHandlerPort,
} from "../dist/bun.mjs";

const tokenChars =
	"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_".split("");

const token = fc
	.array(fc.constantFrom(...tokenChars), { minLength: 1, maxLength: 48 })
	.map((chars) => chars.join(""));

const invocationId = fc.uuid();
const propertyOptions = { numRuns: 100 };

const originalCustomHandlerPort = process.env.FUNCTIONS_CUSTOMHANDLER_PORT;
const originalPort = process.env.PORT;
const originalWorkerRuntime = process.env.FUNCTIONS_WORKER_RUNTIME;

const unsetEnv = (key: keyof NodeJS.ProcessEnv) => {
	Reflect.deleteProperty(process.env, key);
};

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
});

describe("Bun custom-handler properties", () => {
	it("propagates invocation, trace, function, and request metadata through azure()", async () => {
		const app = new Elysia({ sucrose: { gcTime: null } })
			.use(azure())
			.get("/metadata", ({ azure }) => ({
				isAzure: azure.isAzure,
				hasRawInvocationContext: azure.raw !== undefined,
				requestUrl: azure.request?.url,
				invocationId: azure.invocationId,
				functionName: azure.functionName,
				traceParent: azure.traceContext?.traceParent,
				traceState: azure.traceContext?.traceState,
			}));
		const fetch = azureBunFetch(app);

		await fc.assert(
			fc.asyncProperty(
				invocationId,
				token,
				token,
				token,
				async (idFromHeader, functionName, traceId, state) => {
					const url = "http://localhost/metadata";
					const traceParent = `00-${traceId.padEnd(32, "0").slice(0, 32)}-0123456789abcdef-01`;
					const response = await fetch(
						new Request(url, {
							headers: {
								"x-azure-functions-invocationid": idFromHeader,
								"x-azure-functions-functionname": functionName,
								traceparent: traceParent,
								tracestate: state,
							},
						}),
						{} as never,
					);

					assert.strictEqual(response.status, 200);
					assert.deepStrictEqual(await response.json(), {
						isAzure: true,
						hasRawInvocationContext: false,
						requestUrl: url,
						invocationId: idFromHeader,
						functionName,
						traceParent,
						traceState: state,
					});
				},
			),
			propertyOptions,
		);
	});

	it("prefers FUNCTIONS_CUSTOMHANDLER_PORT over PORT for generated port values", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 65535 }),
				fc.integer({ min: 1, max: 65535 }),
				(customHandlerPort, port) => {
					process.env.FUNCTIONS_CUSTOMHANDLER_PORT = String(customHandlerPort);
					process.env.PORT = String(port);

					assert.strictEqual(getAzureCustomHandlerPort(), customHandlerPort);

					unsetEnv("FUNCTIONS_CUSTOMHANDLER_PORT");
					assert.strictEqual(getAzureCustomHandlerPort(), port);
				},
			),
			propertyOptions,
		);
	});
});
