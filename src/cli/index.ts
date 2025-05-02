#!/usr/bin/env bun

import path from "path";
import { parseArgs } from "util";

const {
	values: { inputFile, outputFile },
} = parseArgs({
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

if (!inputFile || !outputFile) {
	throw new Error("One or more arguments are missing");
}

console.log("Code gen started", process.cwd());
// Find the file and dynamically import it

const fullPath = path.join(process.cwd(), inputFile);
const file = await import(fullPath);

console.log("File found and imported", file);
