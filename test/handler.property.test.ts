import assert from "node:assert";
import { describe, it } from "node:test";
import azureFunctions from "@azure/functions";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { Elysia } from "elysia";
import fc from "fast-check";
import {
	azure,
	azureElysiaHandler,
	getAzureContext,
	getAzureRequest,
} from "../dist/index.mjs";

const { HttpRequest: AzureHttpRequest } = azureFunctions;

const routeChars =
	"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_".split("");

const routeSegment = fc
	.array(fc.constantFrom(...routeChars), { minLength: 1, maxLength: 32 })
	.map((chars) => chars.join(""));

const invocationId = fc.uuid();
const jsonBody = fc.jsonValue({ maxDepth: 3 });
const propertyOptions = { numRuns: 100 };

const asContext = (partial: Record<string, unknown>) =>
	partial as unknown as InvocationContext;
const asRequest = (partial: Record<string, unknown>) =>
	partial as unknown as HttpRequest;

async function readAzureResponseBody(response: {
	body?: AsyncIterable<Uint8Array> | null;
}) {
	assert.ok(response.body);

	const chunks: Uint8Array[] = [];
	for await (const chunk of response.body) {
		chunks.push(chunk);
	}

	return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
}

describe("azureElysiaHandler properties", () => {
	it("preserves SDK HttpRequest body, Elysia params, Azure params, and invocation context", async () => {
		const app = new Elysia({ sucrose: { gcTime: null } })
			.use(azure())
			.post("/echo/:id", ({ body, params, request, azure }) => {
				const invocation = getAzureContext(request);
				const azureRequest = getAzureRequest(request);

				return {
					body,
					elysiaId: params.id,
					azureRouteParams: azure.params,
					contextInvocationId: invocation?.invocationId,
					pluginInvocationId: azure.invocationId,
					rawRequestUrl: azureRequest?.url,
				};
			});
		const handler = azureElysiaHandler(app);

		await fc.assert(
			fc.asyncProperty(
				routeSegment,
				routeSegment,
				invocationId,
				jsonBody,
				async (id, proxy, idFromContext, body) => {
					const url = `http://localhost/echo/${id}?source=property`;
					const request = new AzureHttpRequest({
						url,
						method: "POST",
						headers: {
							"content-type": "application/json",
						},
						params: {
							proxy,
						},
						body: {
							string: JSON.stringify(body),
						},
					});

					const response = await handler(
						request,
						asContext({
							invocationId: idFromContext,
							log: () => {},
						}),
					);

					assert.strictEqual(response.status, 200);
					assert.deepStrictEqual(await readAzureResponseBody(response), {
						body: JSON.parse(JSON.stringify(body)),
						elysiaId: id,
						azureRouteParams: { proxy },
						contextInvocationId: idFromContext,
						pluginInvocationId: idFromContext,
						rawRequestUrl: url,
					});
				},
			),
			propertyOptions,
		);
	});

	it("does not attach request bodies for GET and HEAD methods", async () => {
		const app = new Elysia({ sucrose: { gcTime: null } })
			.use(azure())
			.all("/method", ({ request, azure }) => ({
				method: request.method,
				rawRequestUrl: azure.request?.url,
			}));
		const handler = azureElysiaHandler(app);

		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom("GET", "HEAD"),
				invocationId,
				async (method, idFromContext) => {
					const url = "http://localhost/method";
					const request = asRequest({
						url,
						method,
						headers: new Map(),
						body: {
							getReader() {
								throw new Error("GET and HEAD bodies must not be read");
							},
						},
					});

					const response = await handler(
						request,
						asContext({
							invocationId: idFromContext,
							log: () => {},
						}),
					);

					assert.strictEqual(response.status, 200);

					if (method === "HEAD") {
						assert.strictEqual(response.body, null);
						return;
					}

					assert.deepStrictEqual(await readAzureResponseBody(response), {
						method,
						rawRequestUrl: url,
					});
				},
			),
			propertyOptions,
		);
	});
});
