import { describe, it } from "node:test";
import assert from "node:assert";
import {
	streamToAsyncIterator,
	headersToObject,
	cookiesFromHeaders,
	parseCookieString,
} from "../src/utils.ts";

describe("Utils", () => {
	describe("streamToAsyncIterator", () => {
		it("should convert ReadableStream to async iterator", async () => {
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("hello"));
					controller.enqueue(new TextEncoder().encode(" world"));
					controller.close();
				},
			});

			const iterator = streamToAsyncIterator(stream);
			assert.ok(iterator);
			assert.ok(typeof iterator.next === "function");
			assert.ok(Symbol.asyncIterator in iterator);

			const chunks = [];
			for await (const chunk of iterator) {
				chunks.push(chunk);
			}

			assert.strictEqual(chunks.length, 2);
			assert.strictEqual(new TextDecoder().decode(chunks[0]), "hello");
			assert.strictEqual(new TextDecoder().decode(chunks[1]), " world");
		});

		it("should return null for null stream", () => {
			const result = streamToAsyncIterator(null);
			assert.strictEqual(result, null);
		});

		it("should return null for undefined stream", () => {
			const result = streamToAsyncIterator(undefined as unknown as null);
			assert.strictEqual(result, null);
		});

		it("should cancel the source stream when iteration ends early", async () => {
			let wasCancelled = false;
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("first"));
				},
				cancel() {
					wasCancelled = true;
				},
			});

			const iterator = streamToAsyncIterator(stream);
			assert.ok(iterator);

			assert.deepStrictEqual(await iterator.next(), {
				done: false,
				value: new TextEncoder().encode("first"),
			});
			await iterator.return();

			assert.strictEqual(wasCancelled, true);
		});
	});

	describe("headersToObject", () => {
		it("should convert Headers to plain object", () => {
			const headers = new Headers({
				"content-type": "application/json",
				"x-custom-header": "value",
			});

			const obj = headersToObject(headers);

			assert.deepStrictEqual(obj, {
				"content-type": "application/json",
				"x-custom-header": "value",
			});
		});

		it("should handle empty headers", () => {
			const headers = new Headers();
			const obj = headersToObject(headers);
			assert.deepStrictEqual(obj, {});
		});

		it("should handle headers with multiple values", () => {
			const headers = new Headers();
			headers.append("set-cookie", "foo=bar");
			headers.append("set-cookie", "baz=qux");

			const obj = headersToObject(headers);
			// Note: Headers.forEach only returns the last value for duplicate keys
			assert.ok("set-cookie" in obj);
		});
	});

	describe("cookiesFromHeaders", () => {
		it("should extract cookies from Set-Cookie headers", () => {
			const headers = new Headers();
			headers.append("set-cookie", "session=abc123; Path=/; HttpOnly");
			headers.append(
				"set-cookie",
				"token=xyz789; Path=/; Secure; SameSite=Strict",
			);

			const cookies = cookiesFromHeaders(headers);

			assert.ok(Array.isArray(cookies));
			assert.strictEqual(cookies.length, 2);

			assert.strictEqual(cookies[0].name, "session");
			assert.strictEqual(cookies[0].value, "abc123");
			assert.strictEqual(cookies[0].path, "/");
			assert.strictEqual(cookies[0].httpOnly, true);

			assert.strictEqual(cookies[1].name, "token");
			assert.strictEqual(cookies[1].value, "xyz789");
			assert.strictEqual(cookies[1].secure, true);
			assert.strictEqual(cookies[1].sameSite, "Strict");
		});

		it("should return undefined when no Set-Cookie headers", () => {
			const headers = new Headers({
				"content-type": "application/json",
			});

			const cookies = cookiesFromHeaders(headers);
			assert.strictEqual(cookies, undefined);
		});

		it("should return undefined for empty headers", () => {
			const headers = new Headers();
			const cookies = cookiesFromHeaders(headers);
			assert.strictEqual(cookies, undefined);
		});
	});

	describe("parseCookieString", () => {
		it("should parse basic cookie", () => {
			const cookie = parseCookieString("sessionId=abc123");

			assert.strictEqual(cookie.name, "sessionId");
			assert.strictEqual(cookie.value, "abc123");
		});

		it("should parse cookie with Path", () => {
			const cookie = parseCookieString("sessionId=abc123; Path=/api");

			assert.strictEqual(cookie.name, "sessionId");
			assert.strictEqual(cookie.value, "abc123");
			assert.strictEqual(cookie.path, "/api");
		});

		it("should parse cookie with all attributes", () => {
			const cookieString =
				"token=xyz789; Path=/; Domain=example.com; Max-Age=3600; Expires=Wed, 21 Oct 2025 07:28:00 GMT; Secure; HttpOnly; SameSite=Strict";

			const cookie = parseCookieString(cookieString);

			assert.strictEqual(cookie.name, "token");
			assert.strictEqual(cookie.value, "xyz789");
			assert.strictEqual(cookie.path, "/");
			assert.strictEqual(cookie.domain, "example.com");
			assert.strictEqual(cookie.maxAge, 3600);
			assert.ok(cookie.expires instanceof Date);
			assert.strictEqual(cookie.secure, true);
			assert.strictEqual(cookie.httpOnly, true);
			assert.strictEqual(cookie.sameSite, "Strict");
		});

		it("should parse cookie with SameSite=Lax", () => {
			const cookie = parseCookieString("test=value; SameSite=Lax");

			assert.strictEqual(cookie.sameSite, "Lax");
		});

		it("should parse cookie with SameSite=None", () => {
			const cookie = parseCookieString("test=value; SameSite=None; Secure");

			assert.strictEqual(cookie.sameSite, "None");
			assert.strictEqual(cookie.secure, true);
		});

		it("should decode URL-encoded cookie value", () => {
			const cookie = parseCookieString("message=hello%20world%21");

			assert.strictEqual(cookie.value, "hello world!");
		});

		it("should preserve cookie name casing and values with equals signs", () => {
			const cookie = parseCookieString("sessionId=abc=123==; Path=/api");

			assert.strictEqual(cookie.name, "sessionId");
			assert.strictEqual(cookie.value, "abc=123==");
			assert.strictEqual(cookie.path, "/api");
		});

		it("should handle cookie without attributes", () => {
			const cookie = parseCookieString("simple=value");

			assert.strictEqual(cookie.name, "simple");
			assert.strictEqual(cookie.value, "value");
			assert.strictEqual(cookie.path, undefined);
			assert.strictEqual(cookie.secure, false);
			assert.strictEqual(cookie.httpOnly, false);
		});
	});
});
