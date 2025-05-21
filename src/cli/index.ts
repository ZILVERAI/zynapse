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

const services_buffers = await GenerateCode(file);

let total_bytes = 0;
for (const service_buf of services_buffers) {
	const full_filename = path.join(
		process.cwd(),
		outputFile,
		service_buf.filename,
	);
	const fHandle = Bun.file(full_filename);

	const bytes = await fHandle.write(service_buf.code);
	console.log(`${bytes} written to ${full_filename}`);
	total_bytes += bytes;
}

console.log(`${total_bytes} total bytes written`);
