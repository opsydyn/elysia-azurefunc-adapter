import type { AnyElysia } from "elysia";
import {
	AZURE_CUSTOM_HANDLER_CONTEXT,
	attachAzureCustomHandlerContext,
	createAzureCustomHandlerContext,
	getAzureCustomHandlerContext,
	type AzureCustomHandlerContext,
	type AzureCustomHandlerContextInit,
} from "./context";

export interface BunServer {
	port: number;
	hostname?: string;
	stop(closeActiveConnections?: boolean): void;
}

export interface AzureBunServeOptions {
	fetch: (request: Request, server: BunServer) => Response | Promise<Response>;
	port: number;
	hostname?: string;
	development?: boolean;
	idleTimeout?: number;
	error?: (error: Error) => Response | Promise<Response>;
}

export interface AzureBunServeConfig
	extends Omit<AzureBunServeOptions, "fetch" | "port"> {
	port?: number;
	context?: AzureCustomHandlerContextInit;
}

type BunRuntime = {
	serve(options: AzureBunServeOptions): BunServer;
};

type BunGlobal = typeof globalThis & {
	Bun?: BunRuntime;
};

function getBunRuntime(): BunRuntime {
	const bunRuntime = (globalThis as BunGlobal).Bun;

	if (!bunRuntime?.serve) {
		throw new Error(
			"The Bun runtime is not available. Use '@opsydyn/elysia-az-functionapp/bun' from a Bun entrypoint or call createAzureBunServeOptions() for testing.",
		);
	}

	return bunRuntime;
}

export function getAzureCustomHandlerPort(fallback = 3000): number {
	const envPort = process.env.FUNCTIONS_CUSTOMHANDLER_PORT ?? process.env.PORT;
	const port = envPort ? Number.parseInt(envPort, 10) : Number.NaN;

	return Number.isFinite(port) ? port : fallback;
}

export function azureBunFetch(
	app: AnyElysia,
	context?: AzureCustomHandlerContextInit,
): AzureBunServeOptions["fetch"] {
	return async (request) => {
		attachAzureCustomHandlerContext(
			request,
			createAzureCustomHandlerContext(request, context),
		);

		return app.handle(request);
	};
}

export function createAzureBunServeOptions(
	app: AnyElysia,
	config: AzureBunServeConfig = {},
): AzureBunServeOptions {
	return {
		fetch: azureBunFetch(app, config.context),
		port: config.port ?? getAzureCustomHandlerPort(),
		hostname: config.hostname,
		development: config.development,
		idleTimeout: config.idleTimeout,
		error: config.error,
	};
}

export function azureBunServe(
	app: AnyElysia,
	config?: AzureBunServeConfig,
): BunServer {
	return getBunRuntime().serve(createAzureBunServeOptions(app, config));
}

export { AZURE_CUSTOM_HANDLER_CONTEXT, getAzureCustomHandlerContext };
export type { AzureCustomHandlerContext, AzureCustomHandlerContextInit };
