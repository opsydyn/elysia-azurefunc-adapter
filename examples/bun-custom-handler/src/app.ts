import { Elysia } from "elysia";
import { azure } from "./adapter";

const app = new Elysia()
	.use(azure())
	.get("/", ({ azure }) => {
		azure.logWithContext("Serving Bun custom-handler example");

		return {
			ok: true,
			runtime: azure.raw
				? "node-worker"
				: azure.isAzure
					? "bun-custom-handler"
					: "local",
			invocationId: azure.invocationId ?? null,
			functionName: azure.functionName ?? null,
			traceParent: azure.traceContext?.traceParent ?? null,
		};
	})
	.get("/health", () => ({ ok: true }))
	.post("/echo", ({ body, headers, azure }) => ({
		ok: true,
		body,
		userAgent: headers["user-agent"] ?? null,
		invocationId: azure.invocationId ?? null,
	}));

export default app;
