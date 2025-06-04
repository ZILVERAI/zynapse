import type { BunRequest } from "bun";
import type { Procedure, ProcedureType } from "../schema";
import type { z } from "zod";

export class Connection {
	stream: ReadableStream<string>;
	streamController: Bun.ReadableStreamController<string> | undefined;
	constructor() {
		this.stream = new ReadableStream<string>({
			start: (controller) => {
				this.streamController = controller;
				controller.enqueue(": Connected");
			},
		});
	}

	getStream() {
		if (this.stream === undefined) {
			throw new Error("No stream has been stablished");
		}
		return this.stream;
	}
}

export class ConnectionWritter<P extends Procedure<ProcedureType, any, any>> {
	private connection: Connection;
	private procedureDefinition: P;
	constructor(conn: Connection, procDefinition: P) {
		this.connection = conn;
		this.procedureDefinition = procDefinition;
	}

	async close() {
		this.connection.streamController?.close();
		// await this.connection.stream.cancel();
	}

	async write(message: z.infer<P["output"]>) {
		/* Write a message to the connection */
		if (this.connection.streamController === undefined) {
			throw new Error("Connection not found.");
		}
		try {
			const payload = JSON.stringify(message);
			const buff = `event: content\ndata: ${payload}\n\n`;
			this.connection.streamController.enqueue(buff);
		} catch (e: any) {
			console.log("Error at write method.", e);
			this.connection.streamController.enqueue(`event: error\ndata: ${e}\n\n`);
		}
	}
}
