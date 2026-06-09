import type { HttpRequest } from "@azure/functions";
import { headersToObject } from "./utils";

export interface AzureRequestTransformOptions {
	/**
	 * Reconstruct the Web Request URL from trusted proxy headers.
	 *
	 * Keep this disabled unless the Function App is behind infrastructure you
	 * control, such as Azure Front Door, Azure API Management, App Service's
	 * platform proxy, or another trusted reverse proxy.
	 */
	trustForwardedHeaders?: boolean;
}

function firstForwardedValue(value: string | null): string | undefined {
	return value?.split(",")[0]?.trim() || undefined;
}

function unquoteForwardedValue(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1);
	}

	return value;
}

function readForwardedDirective(
	headers: Headers,
	directive: "host" | "proto",
): string | undefined {
	const forwarded = firstForwardedValue(headers.get("forwarded"));
	if (!forwarded) return undefined;

	for (const part of forwarded.split(";")) {
		const [rawKey, ...rawValue] = part.split("=");
		if (rawKey?.trim().toLowerCase() !== directive) continue;

		const value = rawValue.join("=").trim();
		return value ? unquoteForwardedValue(value) : undefined;
	}

	return undefined;
}

function safeForwardedProtocol(value: string | undefined): string | undefined {
	const protocol = value?.toLowerCase();
	return protocol === "http" || protocol === "https" ? protocol : undefined;
}

function isPotentialHost(value: string | undefined): value is string {
	if (value === undefined || value.length === 0 || /[/?#\\\s]/.test(value)) {
		return false;
	}

	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code <= 31 || code === 127) return false;
	}

	return true;
}

function forwardedUrl(rawUrl: string, headers: Headers): string {
	const url = new URL(rawUrl);
	const protocol = safeForwardedProtocol(
		firstForwardedValue(headers.get("x-forwarded-proto")) ??
			readForwardedDirective(headers, "proto"),
	);
	const host =
		firstForwardedValue(headers.get("x-forwarded-host")) ??
		readForwardedDirective(headers, "host");

	if (protocol) {
		url.protocol = `${protocol}:`;
	}

	if (isPotentialHost(host)) {
		try {
			url.host = new URL(`${protocol ?? url.protocol.slice(0, -1)}://${host}`)
				.host;
		} catch {
			// Ignore malformed forwarded host values instead of failing the request.
		}
	}

	return url.toString();
}

export const newRequestFromAzureFunctions = (
	request: HttpRequest,
	options: AzureRequestTransformOptions = {},
): Request => {
	const hasBody = !["GET", "HEAD"].includes(request.method);
	const headers = new Headers(headersToObject(request.headers));
	const url = options.trustForwardedHeaders
		? forwardedUrl(request.url, headers)
		: request.url;

	return new Request(url, {
		method: request.method,
		headers,
		...(hasBody ? { body: request.body as ReadableStream, duplex: "half" } : {}),
	});
};
