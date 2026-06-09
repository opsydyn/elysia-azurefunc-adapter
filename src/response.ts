import type { HttpResponseInit } from "@azure/functions";
import {
	cookiesFromHeaders,
	headersToObject,
	streamToAsyncIterator,
} from "./utils";

export const newAzureFunctionsResponse = (
	response: Response,
): HttpResponseInit => {
	const headers = headersToObject(response.headers);
	const cookies = cookiesFromHeaders(response.headers);

	if (cookies) {
		for (const key of Object.keys(headers)) {
			if (key.toLowerCase() === "set-cookie") {
				delete headers[key];
			}
		}
	}

	return {
		cookies,
		headers,
		status: response.status,
		body: streamToAsyncIterator(response.body),
	};
};
