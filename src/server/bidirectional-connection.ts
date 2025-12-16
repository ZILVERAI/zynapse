import type { z } from "zod";
import type { Procedure, ProcedureType } from "../schema";
import type { ContextType } from "./index.ts";
import type { EventListener } from "bun";

type BidirectionalCustomIncomingEvent<TInput extends z.ZodTypeAny> =
	Bun.CustomEventInit<z.infer<TInput>>;

type onMessageCallable<
	TInput extends z.ZodTypeAny,
	TOutput extends z.ZodTypeAny,
> = {
	name: string;
	callback: (
		connection: BidirectionalConnection<TInput, TOutput>,
		msg: z.infer<TInput>,
	) => Promise<void>;
};

export class BidirectionalConnection<
	TInput extends z.ZodTypeAny,
	TOutput extends z.ZodTypeAny,
> {
	private ctx: ContextType;
	private procDefinition: Procedure<`BIDIRECTIONAL`, TInput, TOutput>;
	private connection: Bun.ServerWebSocket;

	private eventTarget: EventTarget;
	constructor(
		ctx: ContextType,
		procDefintion: Procedure<`BIDIRECTIONAL`, TInput, TOutput>,
		ws: Bun.ServerWebSocket<any>,
	) {
		this.ctx = ctx;
		this.procDefinition = procDefintion;
		this.eventTarget = new EventTarget();
		this.connection = ws;
	}

	public async sendMessage(msg: z.infer<TOutput>) {
		const result = await this.procDefinition.output.safeParseAsync(msg);
		if (!result.success) {
			console.error(
				`[ZYNAPSE] The message to be sent to the connection does not conform to the schema.\nMessage: ${msg}\nError: ${result.error}`,
			);
			return;
		}

		this.connection.send(JSON.stringify(result.data));
	}

	public async addOnMessageListener(
		callable: onMessageCallable<TInput, TOutput>,
	) {
		const defRef = this.procDefinition;
		this.eventTarget.addEventListener(
			"msg",
			(ev: BidirectionalCustomIncomingEvent<TInput>) => {
				callable.callback(this, ev.detail).catch((e) => {
					console.error(
						`[ZYNAPSE] The websocket handler of name ${callable.name} defined by procedure ${defRef.name} had an error while executing.\nError: ${e}`,
					);
				});
			},
		);
	}
	public async _onClientMessage(msg: Object) {
		const result = await this.procDefinition.input.safeParseAsync(msg);
		if (!result.success) {
			throw new Error(
				`The procedure ${this.procDefinition.name} received an invalid payload.\nError: ${result.error}`,
			);
		}

		this.eventTarget.dispatchEvent(
			new CustomEvent("msg", {
				detail: result.data,
			} as BidirectionalCustomIncomingEvent<TInput>),
		);
	}
}
