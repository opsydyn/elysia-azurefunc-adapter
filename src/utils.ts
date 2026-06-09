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
			}

			return result;
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
		value: decodeURIComponent(encodedValue),
		path: attrs.path,
		sameSite: attrs.samesite as "Strict" | "Lax" | "None" | undefined,
		secure: attrs.secure === "true",
		httpOnly: attrs.httponly === "true",
		domain: attrs.domain,
		expires: attrs.expires ? new Date(attrs.expires) : undefined,
		maxAge: attrs["max-age"] ? Number.parseInt(attrs["max-age"]) : undefined,
	};
}
