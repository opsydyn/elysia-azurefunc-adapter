import assert from "node:assert";
import { describe, it, mock } from "node:test";
import type { InvocationContext } from "@azure/functions";
import { AzureContext } from "../dist/index.mjs";

/** Helper type for creating mock InvocationContext objects in tests */
type MockInvocationContext = Partial<InvocationContext> &
	Record<string, unknown>;

/** Cast a partial mock to InvocationContext for use with AzureContext */
const asContext = (mock: MockInvocationContext): InvocationContext =>
	mock as unknown as InvocationContext;

describe("AzureContext", () => {
	describe("constructor", () => {
		it("should create instance with InvocationContext", () => {
			const mockCtx = asContext({
				invocationId: "test-id",
				functionName: "testFunction",
				log: () => {},
			});

			const azureCtx = new AzureContext(mockCtx);

			assert.ok(azureCtx);
			assert.strictEqual(azureCtx.isAzure, true);
			assert.strictEqual(azureCtx.raw, mockCtx);
		});

		it("should create instance without InvocationContext", () => {
			const azureCtx = new AzureContext(undefined);

			assert.ok(azureCtx);
			assert.strictEqual(azureCtx.isAzure, false);
			assert.strictEqual(azureCtx.raw, undefined);
		});
	});

	describe("isAzure", () => {
		it("should return true when context exists", () => {
			const mockCtx = asContext({ invocationId: "test" });
			const azureCtx = new AzureContext(mockCtx);

			assert.strictEqual(azureCtx.isAzure, true);
		});

		it("should return false when context is undefined", () => {
			const azureCtx = new AzureContext(undefined);

			assert.strictEqual(azureCtx.isAzure, false);
		});
	});

	describe("properties", () => {
		it("should expose invocationId from context", () => {
			const mockCtx = asContext({ invocationId: "abc-123" });
			const azureCtx = new AzureContext(mockCtx);

			assert.strictEqual(azureCtx.invocationId, "abc-123");
		});

		it("should return undefined for invocationId when no context", () => {
			const azureCtx = new AzureContext(undefined);

			assert.strictEqual(azureCtx.invocationId, undefined);
		});

		it("should expose functionName from context", () => {
			const mockCtx = asContext({ functionName: "myFunction" });
			const azureCtx = new AzureContext(mockCtx);

			assert.strictEqual(azureCtx.functionName, "myFunction");
		});

		it("should expose triggerMetadata from context", () => {
			const metadata = { type: "http", url: "/api/test" };
			const mockCtx = asContext({ triggerMetadata: metadata });
			const azureCtx = new AzureContext(mockCtx);

			assert.deepStrictEqual(azureCtx.triggerMetadata, metadata);
		});

		it("should expose traceContext from context", () => {
			const traceCtx = { traceparent: "00-abc-def-01" };
			const mockCtx = asContext({ traceContext: traceCtx as never });
			const azureCtx = new AzureContext(mockCtx);

			assert.deepStrictEqual(azureCtx.traceContext, traceCtx);
		});

		it("should expose retryContext from context", () => {
			const retryCtx = { retryCount: 2, maxRetryCount: 5 };
			const mockCtx = asContext({ retryContext: retryCtx });
			const azureCtx = new AzureContext(mockCtx);

			assert.deepStrictEqual(azureCtx.retryContext, retryCtx);
		});
	});

	describe("logging methods", () => {
		describe("log", () => {
			it("should call context.log when context exists", () => {
				const logMock = mock.fn();
				const mockCtx = asContext({ log: logMock });
				const azureCtx = new AzureContext(mockCtx);

				azureCtx.log("test message", "arg1", 123);

				assert.strictEqual(logMock.mock.calls.length, 1);
				assert.deepStrictEqual(logMock.mock.calls[0].arguments, [
					"test message",
					"arg1",
					123,
				]);
			});

			it("should call console.log when no context", () => {
				const consoleLogMock = mock.method(console, "log");
				const azureCtx = new AzureContext(undefined);

				azureCtx.log("test message", "arg1");

				assert.strictEqual(consoleLogMock.mock.calls.length, 1);
				assert.deepStrictEqual(consoleLogMock.mock.calls[0].arguments, [
					"test message",
					"arg1",
				]);

				consoleLogMock.mock.restore();
			});
		});

		describe("info", () => {
			it("should call log method", () => {
				const logMock = mock.fn();
				const mockCtx = asContext({ log: logMock });
				const azureCtx = new AzureContext(mockCtx);

				azureCtx.info("info message");

				assert.strictEqual(logMock.mock.calls.length, 1);
				assert.deepStrictEqual(logMock.mock.calls[0].arguments, [
					"info message",
				]);
			});
		});

		describe("warn", () => {
			it("should call context.warn when context exists", () => {
				const warnMock = mock.fn();
				const mockCtx = asContext({ warn: warnMock });
				const azureCtx = new AzureContext(mockCtx);

				azureCtx.warn("warning message", "data");

				assert.strictEqual(warnMock.mock.calls.length, 1);
				assert.deepStrictEqual(warnMock.mock.calls[0].arguments, [
					"warning message",
					"data",
				]);
			});

			it("should call console.warn when no context", () => {
				const consoleWarnMock = mock.method(console, "warn");
				const azureCtx = new AzureContext(undefined);

				azureCtx.warn("warning");

				assert.strictEqual(consoleWarnMock.mock.calls.length, 1);

				consoleWarnMock.mock.restore();
			});
		});

		describe("error", () => {
			it("should call context.error when context exists", () => {
				const errorMock = mock.fn();
				const mockCtx = asContext({ error: errorMock });
				const azureCtx = new AzureContext(mockCtx);

				azureCtx.error("error message", new Error("test"));

				assert.strictEqual(errorMock.mock.calls.length, 1);
				assert.strictEqual(
					errorMock.mock.calls[0].arguments[0],
					"error message",
				);
			});

			it("should call console.error when no context", () => {
				const consoleErrorMock = mock.method(console, "error");
				const azureCtx = new AzureContext(undefined);

				azureCtx.error("error");

				assert.strictEqual(consoleErrorMock.mock.calls.length, 1);

				consoleErrorMock.mock.restore();
			});
		});

		describe("trace", () => {
			it("should call context.trace when context exists", () => {
				const traceMock = mock.fn();
				const mockCtx = asContext({ trace: traceMock });
				const azureCtx = new AzureContext(mockCtx);

				azureCtx.trace("trace message");

				assert.strictEqual(traceMock.mock.calls.length, 1);
				assert.deepStrictEqual(traceMock.mock.calls[0].arguments, [
					"trace message",
				]);
			});

			it("should call console.debug when no context", () => {
				const consoleDebugMock = mock.method(console, "debug");
				const azureCtx = new AzureContext(undefined);

				azureCtx.trace("trace");

				assert.strictEqual(consoleDebugMock.mock.calls.length, 1);

				consoleDebugMock.mock.restore();
			});
		});

		describe("logWithContext", () => {
			it("should prefix with invocationId when context exists", () => {
				const logMock = mock.fn();
				const mockCtx = asContext({
					invocationId: "12345678-1234-1234-1234-123456789012",
					log: logMock,
				});
				const azureCtx = new AzureContext(mockCtx);

				azureCtx.logWithContext("test message", "arg");

				assert.strictEqual(logMock.mock.calls.length, 1);
				assert.strictEqual(
					logMock.mock.calls[0].arguments[0],
					"[12345678] test message",
				);
				assert.strictEqual(logMock.mock.calls[0].arguments[1], "arg");
			});

			it("should prefix with [local] when no context", () => {
				const consoleLogMock = mock.method(console, "log");
				const azureCtx = new AzureContext(undefined);

				azureCtx.logWithContext("test message");

				assert.strictEqual(consoleLogMock.mock.calls.length, 1);
				assert.strictEqual(
					consoleLogMock.mock.calls[0].arguments[0],
					"[local] test message",
				);

				consoleLogMock.mock.restore();
			});

			it("should truncate long invocationId to 8 chars", () => {
				const logMock = mock.fn();
				const mockCtx = asContext({
					invocationId: "very-long-invocation-id-string",
					log: logMock,
				});
				const azureCtx = new AzureContext(mockCtx);

				azureCtx.logWithContext("message");

				const loggedMessage = logMock.mock.calls[0].arguments[0];
				assert.ok(loggedMessage.startsWith("[very-lon]"));
			});
		});
	});
});
