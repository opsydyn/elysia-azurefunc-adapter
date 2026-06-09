import assert from "node:assert";
import { describe, it } from "node:test";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { Elysia } from "elysia";
import fc from "fast-check";
import { azureElysiaHandler } from "../dist/index.mjs";

const labelChars =
	"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const labelStartChars =
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const pathChars =
	"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_".split("");

const label = fc
	.tuple(
		fc.constantFrom(...labelStartChars),
		fc.array(fc.constantFrom(...labelChars), { maxLength: 11 }),
	)
	.map(([first, rest]) => [first, ...rest].join(""));
const hostname = fc
	.array(label, { minLength: 2, maxLength: 4 })
	.map((labels) => labels.join(".").toLowerCase());
const pathSegment = fc
	.array(fc.constantFrom(...pathChars), { minLength: 1, maxLength: 24 })
	.map((chars) => chars.join(""));
const propertyOptions = { numRuns: 100 };

const asRequest = (partial: Record<string, unknown>) =>
	partial as unknown as HttpRequest;
const asContext = (partial: Record<string, unknown>) =>
	partial as unknown as InvocationContext;

async function readResponseJson(response: {
	body?: AsyncIterable<Uint8Array> | null;
}) {
	assert.ok(response.body);

	const chunks: Uint8Array[] = [];
	for await (const chunk of response.body) {
		chunks.push(chunk);
	}

	return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
}

describe("request conversion properties", () => {
	it("keeps the original URL unless forwarded headers are trusted", async () => {
		const app = new Elysia({ sucrose: { gcTime: null } }).get(
			"/api/check",
			({ request }) => ({ url: request.url }),
		);
		const handler = azureElysiaHandler(app);

		await fc.assert(
			fc.asyncProperty(
				hostname,
				fc.constantFrom("http", "https"),
				async (host, proto) => {
					const request = asRequest({
						url: "http://internal.azurewebsites.net/api/check?source=internal",
						method: "GET",
						headers: new Headers({
							"x-forwarded-host": host,
							"x-forwarded-proto": proto,
						}),
					});

					assert.deepStrictEqual(
						await readResponseJson(
							await handler(request, asContext({ log: () => {} })),
						),
						{
							url: "http://internal.azurewebsites.net/api/check?source=internal",
						},
					);
				},
			),
			propertyOptions,
		);
	});

	it("reconstructs the URL origin from trusted X-Forwarded headers", async () => {
		const app = new Elysia({ sucrose: { gcTime: null } }).get(
			"/api/:segment",
			({ request }) => ({ url: request.url }),
		);
		const handler = azureElysiaHandler(app, {
			trustForwardedHeaders: true,
		});

		await fc.assert(
			fc.asyncProperty(
				hostname,
				fc.constantFrom("http", "https"),
				pathSegment,
				pathSegment,
				async (host, proto, segment, queryValue) => {
					const request = asRequest({
						url: `http://internal.azurewebsites.net/api/${segment}?value=${queryValue}`,
						method: "GET",
						headers: new Headers({
							"x-forwarded-host": host,
							"x-forwarded-proto": proto,
						}),
					});

					assert.deepStrictEqual(
						await readResponseJson(
							await handler(request, asContext({ log: () => {} })),
						),
						{ url: `${proto}://${host}/api/${segment}?value=${queryValue}` },
					);
				},
			),
			propertyOptions,
		);
	});

	it("ignores malformed forwarded host values without failing the request", async () => {
		const app = new Elysia({ sucrose: { gcTime: null } }).get(
			"/api/check",
			({ request }) => ({ url: request.url }),
		);
		const handler = azureElysiaHandler(app, {
			trustForwardedHeaders: true,
		});

		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom("bad host", "example.com/path", "example.com?x=1"),
				fc.constantFrom("http", "https"),
				async (host, proto) => {
					const request = asRequest({
						url: "http://internal.azurewebsites.net/api/check",
						method: "GET",
						headers: new Headers({
							"x-forwarded-host": host,
							"x-forwarded-proto": proto,
						}),
					});

					assert.deepStrictEqual(
						await readResponseJson(
							await handler(request, asContext({ log: () => {} })),
						),
						{ url: `${proto}://internal.azurewebsites.net/api/check` },
					);
				},
			),
			propertyOptions,
		);
	});
});
