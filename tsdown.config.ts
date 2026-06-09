import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/bun.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	sourcemap: true,
	target: "node22",
	outDir: "dist",
	deps: {
		neverBundle: ["elysia", "@azure/functions"],
	},
});
