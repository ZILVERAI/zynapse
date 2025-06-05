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
				controller.enqueue(": Connected\n\n");
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
	private closed: boolean;

	private keepaliveInterval: Timer;
	constructor(conn: Connection, procDefinition: P) {
		this.connection = conn;
		this.procedureDefinition = procDefinition;
		this.closeFn = this.connection.streamController.close.bind(
			this.connection.streamController,
		);
		this.enqueueFn = this.connection.streamController.enqueue.bind(
			this.connection.streamController,
		);
		this.closed = false;

		this.keepaliveInterval = setInterval(() => {
			this.enqueueFn(`: keepalive\n\n`);
		}, 30_000);
	}

	async close() {
		if (this.closed) {
			console.log("The connection has been already closed");
			return;
		}

		try {
			this.enqueueFn(`event: close\ndata: close\n\n`);
		} catch {
			console.log(
				"[ZYNAPSE SUBSCRIPTION] Failed to send close connection event, has the connection already closed?",
			);
		}

		clearInterval(this.keepaliveInterval);

		this.closeFn();
		this.closed = true;
	}

	async write(message: z.infer<P["output"]>) {
		if (this.closed) {
			console.error(new Error("Attepted to write on closed function."));
		}
		/* Write a message to the connection */
		if (this.connection.streamController === undefined) {
			console.error(new Error("Connection not found."));
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
