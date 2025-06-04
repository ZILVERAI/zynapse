import type { BunRequest, ReadableStreamController } from "bun";
import type { Procedure, ProcedureType } from "../schema";
import type { z } from "zod";

export class Connection {
	stream: ReadableStream<string>;
	streamController: Bun.ReadableStreamController<string>;
	constructor() {
		let controllerToBeSet: Bun.ReadableStreamController<string> | undefined;
		this.stream = new ReadableStream<string>({
			start(controller) {
				controllerToBeSet = controller;
				controller.enqueue(": Connected");
			},
		});
		if (!controllerToBeSet) {
			throw new Error("No controller has been captured");
		}
		this.streamController = controllerToBeSet;
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
	private closeFn: () => void;
	private enqueueFn: ReadableStreamController<string>["enqueue"];
	constructor(conn: Connection, procDefinition: P) {
		this.connection = conn;
		this.procedureDefinition = procDefinition;
		this.closeFn = this.connection.streamController.close.bind(
			this.connection.streamController,
		);
		this.enqueueFn = this.connection.streamController.enqueue.bind(
			this.connection.streamController,
		);
	}

	async close() {
		this.closeFn();

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
			this.enqueueFn(buff);
		} catch (e: any) {
			console.log("Error at write method.", e);
			// this.connection.streamController.enqueue(`event: error\ndata: ${e}\n\n`);
		}
	}
}
