import assert from "node:assert";
import { describe, it } from "node:test";
import azureFunctions from "@azure/functions";
import type { InvocationContext } from "@azure/functions";
import { Elysia } from "elysia";
import fc from "fast-check";
import { azureElysiaHandler } from "../dist/index.mjs";
import {
	headersToObject,
	parseCookieString,
	streamToAsyncIterator,
} from "../src/utils.ts";

const { HttpRequest: AzureHttpRequest } = azureFunctions;

const tokenChars =
	"!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split(
		"",
	);
const valueChars =
	" !#$%&'()*+,-./0123456789:<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~".split(
		"",
	);
const alphaChars =
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const token = fc
	.array(fc.constantFrom(...tokenChars), { minLength: 1, maxLength: 32 })
	.map((chars) => chars.join(""));

const headerValue = fc
	.array(fc.constantFrom(...valueChars), { maxLength: 80 })
	.map((chars) => chars.join(""));
const alphaValue = fc
	.array(fc.constantFrom(...alphaChars), { minLength: 1, maxLength: 40 })
	.map((chars) => chars.join(""));

const propertyOptions = { numRuns: 150 };
const asContext = (partial: Record<string, unknown>) =>
	partial as unknown as InvocationContext;

describe("utils properties", () => {
	it("streamToAsyncIterator yields exactly the source chunks in order", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(fc.uint8Array({ maxLength: 64 }), { maxLength: 30 }),
				async (chunks) => {
					const stream = new ReadableStream<Uint8Array>({
						start(controller) {
							for (const chunk of chunks) {
								controller.enqueue(chunk);
							}
							controller.close();
						},
					});

					const iterator = streamToAsyncIterator(stream);
					assert.ok(iterator);

					const actual: Uint8Array[] = [];
					for await (const chunk of iterator) {
						actual.push(chunk);
					}

					assert.deepStrictEqual(
						actual.map((chunk) => [...chunk]),
						chunks.map((chunk) => [...chunk]),
					);
				},
			),
			propertyOptions,
		);
	});

	it("headersToObject matches the platform Headers iteration contract", () => {
		fc.assert(
			fc.property(
				fc.array(fc.tuple(token, headerValue), { maxLength: 30 }),
				(entries) => {
					const headers = new Headers();
					for (const [key, value] of entries) {
						headers.append(key, value);
					}

					const expected: Record<string, string> = {};
					headers.forEach((value, key) => {
						expected[key] = value;
					});

					assert.deepStrictEqual(headersToObject(headers), expected);
				},
			),
			propertyOptions,
		);
	});

	it("parseCookieString round-trips encoded cookie values", () => {
		fc.assert(
			fc.property(token, headerValue, (name, value) => {
				const cookie = parseCookieString(`${name}=${encodeURIComponent(value)}`);

				assert.strictEqual(cookie.name, name);
				assert.strictEqual(cookie.value, value);
			}),
			propertyOptions,
		);
	});

	it("parseCookieString does not throw for malformed percent escapes", () => {
		fc.assert(
			fc.property(token, headerValue, (name, value) => {
				assert.doesNotThrow(() => parseCookieString(`${name}=%${value}`));
			}),
			propertyOptions,
		);
	});

	it("parseCookieString normalizes SameSite values case-insensitively", () => {
		fc.assert(
			fc.property(
				token,
				headerValue,
				fc.constantFrom("Strict", "strict", "STRICT", "Lax", "lax", "None", "none"),
				(name, value, sameSite) => {
					const cookie = parseCookieString(
						`${name}=${encodeURIComponent(value)}; SameSite=${sameSite}`,
					);

					assert.strictEqual(
						cookie.sameSite,
						sameSite.toLowerCase() === "strict"
							? "Strict"
							: sameSite.toLowerCase() === "lax"
								? "Lax"
								: "None",
					);
				},
			),
			propertyOptions,
		);
	});

	it("parseCookieString omits invalid Expires and Max-Age attributes", () => {
		fc.assert(
			fc.property(token, headerValue, alphaValue, (name, value, invalidValue) => {
				const cookie = parseCookieString(
					`${name}=${encodeURIComponent(value)}; Expires=${invalidValue}; Max-Age=${invalidValue}`,
				);

				assert.strictEqual(cookie.expires, undefined);
				assert.strictEqual(cookie.maxAge, undefined);
			}),
			propertyOptions,
		);
	});

	it("azureElysiaHandler moves Set-Cookie into Azure cookies only", async () => {
		const app = new Elysia({ sucrose: { gcTime: null } }).post(
			"/cookies",
			({ body }) => {
				const headers = new Headers({
					"content-type": "application/json",
					"x-source": "property",
				});

				for (const [name, value] of body as [string, string][]) {
					headers.append(
						"set-cookie",
						`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly`,
					);
				}

				return new Response("{}", { headers });
			},
		);
		const handler = azureElysiaHandler(app);

		await fc.assert(
			fc.asyncProperty(
				fc.array(fc.tuple(token, headerValue), {
					minLength: 1,
					maxLength: 12,
				}),
				async (cookiePairs) => {
					const response = await handler(
						new AzureHttpRequest({
							url: "http://localhost/cookies",
							method: "POST",
							headers: {
								"content-type": "application/json",
							},
							body: {
								string: JSON.stringify(cookiePairs),
							},
						}),
						asContext({
							invocationId: "property-cookies",
							log: () => {},
						}),
					);

					if (response.body) {
						for await (const _ of response.body) {
							// drain
						}
					}

					assert.strictEqual(
						response.headers?.["content-type"],
						"application/json",
					);
					assert.strictEqual(response.headers?.["x-source"], "property");
					assert.ok(!("set-cookie" in (response.headers ?? {})));
					assert.deepStrictEqual(
						response.cookies?.map((cookie) => [cookie.name, cookie.value]),
						cookiePairs,
					);
				},
			),
			propertyOptions,
		);
	});
});
