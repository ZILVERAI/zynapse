#!/usr/bin/env bun

import path from "path";
import { parseArgs } from "util";
import { GenerateCode } from "../schema/client_side";

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
const file = (await import(fullPath)).default;

// TODO: Add some sort of validation to make sure the mentioned file is actually a schema

const buffer = await GenerateCode(file);

const fHandle = Bun.file(path.join(process.cwd(), outputFile));

const bytes = await fHandle.write(buffer);

console.log(`${bytes} bytes has been written to file!`);
