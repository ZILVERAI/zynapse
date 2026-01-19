import path from "path";
import { parseArgs } from "util";
import { GenerateCode } from "../schema/client_side";
import { existsSync, readFile, readdir, readdirSync, readFileSync } from "fs";
import { rm } from "fs/promises";
import { fileURLToPath } from "url";
import { GenerateMobileCode } from "../schema/client_side_mobile";

// Read the WebSocket template file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatePath = path.join(__dirname, "../schema/useWebSocket.ts");
const useWebsocketTemplate = readFileSync(templatePath, "utf-8");

const {
	values: { inputFile, outputFolder, mobile },
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
		mobile: {
			type: "boolean",
			short: "M",
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
	try {
		await rm(toDelete, {
			maxRetries: 3,
			recursive: true,
			force: true,
		});
		console.log(`${toDelete} deleted`);
	} catch (e) {
		console.error("Fialed at deleting file", e);
	}
}

// First, update the websocket lib.
const wsFileName = path.join(process.cwd(), outputFolder, "useWebsocket.ts");
const wsFHandle = Bun.file(wsFileName);
const bytes = await wsFHandle.write(useWebsocketTemplate);
console.log(`Websocket lib updated with ${bytes} at ${wsFileName}`);
// TODO: Add some sort of validation to make sure the mentioned file is actually a schema

let fnToCall = GenerateCode;
if (mobile) {
	console.info("Generating code for mobile");
	fnToCall = GenerateMobileCode;
}

const services_buffers = await fnToCall(file);

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
