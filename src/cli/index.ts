import { parseArgs } from "util";

const { values } = parseArgs({
	args: Bun.argv || process.argv,
	allowPositionals: true,
	options: {
		inputFile: {
			type: "string",
			short: "I",
		},
		outputFile: {
			type: "string",
			short: "O",
		},
	},
});

console.log("Code gen started", process.cwd());
