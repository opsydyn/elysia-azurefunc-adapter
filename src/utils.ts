import type { Cookie } from "@azure/functions";

function splitCookiePart(part: string): [string, string | undefined] {
	const separatorIndex = part.indexOf("=");

	if (separatorIndex === -1) {
		return [part.trim(), undefined];
	}

	return [
		part.slice(0, separatorIndex).trim(),
		part.slice(separatorIndex + 1).trim(),
	];
}

function decodeCookieValue(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function parseCookieDate(value: string | undefined): Date | undefined {
	if (!value) return undefined;

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseCookieMaxAge(value: string | undefined): number | undefined {
	if (!value) return undefined;

	const maxAge = Number.parseInt(value, 10);
	return Number.isNaN(maxAge) ? undefined : maxAge;
}

function parseSameSite(value: string | undefined) {
	switch (value?.toLowerCase()) {
		case "strict":
			return "Strict";
		case "lax":
			return "Lax";
		case "none":
			return "None";
		default:
			return undefined;
	}
}

const textEncoder = new TextEncoder();

function normalizeStreamChunk(value: unknown): Uint8Array {
	if (value instanceof Uint8Array) return value;
	if (typeof value === "string") return textEncoder.encode(value);
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (ArrayBuffer.isView(value)) {
		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	}

	return textEncoder.encode(String(value));
}

export const streamToAsyncIterator = (readable: Response["body"]) => {
	if (readable == null) return null;
	const reader = readable.getReader();
	let released = false;

	const release = () => {
		if (released) return;
		released = true;
		reader.releaseLock();
	};

	return {
		async next() {
			const result = await reader.read();

			if (result.done) {
				release();
				return result;
			}

			return {
				done: false,
				value: normalizeStreamChunk(result.value),
			};
		},
		async return() {
			release();
			return {
				done: true,
				value: undefined,
			};
		},
		[Symbol.asyncIterator]() {
			return this;
		},
	} as AsyncIterableIterator<Uint8Array>;
};

type LoopableHeader = {
	forEach: (callbackfn: (value: string, key: string) => void) => void;
};

export function headersToObject(input: LoopableHeader): Record<string, string> {
	const headers: Record<string, string> = {};
	input.forEach((v, k) => {
		headers[k] = v;
	});
	return headers;
}

export function cookiesFromHeaders(headers: Headers): Cookie[] | undefined {
	const cookies = headers.getSetCookie();
	if (cookies.length === 0) return undefined;

	return cookies.map(parseCookieString);
}

export function parseCookieString(cookieString: string): Cookie {
	const [nameValue, ...attributeValues] = cookieString.split(";");
	const [name, encodedValue = ""] = splitCookiePart(nameValue);
	const attrs: Record<string, string> = Object.fromEntries(
		attributeValues.map((attribute) => {
			const [key, value] = splitCookiePart(attribute);
			return [key.toLowerCase(), value ?? "true"];
		}),
	);

	return {
		name,
		value: decodeCookieValue(encodedValue),
		path: attrs.path,
		sameSite: parseSameSite(attrs.samesite),
		secure: attrs.secure === "true",
		httpOnly: attrs.httponly === "true",
		domain: attrs.domain,
		expires: parseCookieDate(attrs.expires),
		maxAge: parseCookieMaxAge(attrs["max-age"]),
	};
}
