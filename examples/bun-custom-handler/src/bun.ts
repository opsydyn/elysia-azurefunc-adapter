import app from "./app";
import { azureBunServe } from "./adapter";

const server = azureBunServe(app, {
	context: {
		functionName: "HttpTrigger",
	},
});

export default server;
