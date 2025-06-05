#!/usr/bin/env bun

import path from "path";
import { parseArgs } from "util";
import { GenerateCode } from "../schema/client_side";
import { existsSync, readFile, readdir, readdirSync, rm } from "fs";

const {
	values: { inputFile, outputFolder },
} = parseArgs({
	args: Bun.argv || process.argv,
	allowPositionals: true,
	options: {
		inputFile: {
			type: "string",
			short: "I",
		},
		outputFolder: {
			type: "string",
			short: "O",
		},
	},
});

if (!inputFile || !outputFolder) {
	throw new Error("One or more arguments are missing");
}

console.log("Code gen started", process.cwd());
// Find the file and dynamically import it

const fullPath = path.join(process.cwd(), inputFile);
const file = (await import(fullPath)).default;

// Remove old files.
const oldFilesDirectory = path.join(process.cwd(), outputFolder);
const files = readdirSync(oldFilesDirectory);
for (const file of files) {
	const toDelete = path.join(oldFilesDirectory, file);
	rm(toDelete, (err) => {
		if (err) {
			console.log(`Error con deleting file ${file}, ${err}`);
		} else {
			console.log("Successfully deleted", file);
		}
	});
}

// TODO: Add some sort of validation to make sure the mentioned file is actually a schema

const services_buffers = await GenerateCode(file);

let total_bytes = 0;
for (const service_buf of services_buffers) {
	const full_filename = path.join(
		process.cwd(),
		outputFolder,
		service_buf.filename,
	);
	const fHandle = Bun.file(full_filename);

	const bytes = await fHandle.write(service_buf.code);
	console.log(`${bytes} written to ${full_filename}`);
	total_bytes += bytes;
}

console.log(`${total_bytes} total bytes written`);
