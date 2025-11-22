import type { BunRequest } from "bun";
import {
	APISchema,
	Service,
	type Procedure,
	type ProcedureType,
} from "../schema";
import { z } from "zod";

import { Connection, ConnectionWritter } from "./connection";

type ContextType = Map<string, any>;

type SubscriptionHandler<P extends Procedure<ProcedureType, any, any>> = (
	args: z.infer<P["input"]>,
	request: BunRequest,
	context: ContextType, // Information that the middleware is capable of passing to the handler
	connection: ConnectionWritter<P>,
) => Promise<undefined>;

type NormalProcedureHandler<P extends Procedure<ProcedureType, any, any>> = (
	args: z.infer<P["input"]>,
	request: BunRequest,
	context: ContextType, // Information that the middleware is capable of passing to the handler.
) => Promise<z.infer<P["output"]>>;

type ProcedureHandler<P extends Procedure<ProcedureType, any, any>> =
	P["method"] extends `SUBSCRIPTION`
		? SubscriptionHandler<P>
		: NormalProcedureHandler<P>;

async function* x() {}

type FullImplementation<SchemaT extends APISchema> = {
	[ServiceName in keyof SchemaT["services"]]: ServiceImplementationHandlers<
		SchemaT["services"][ServiceName]
	>;
};

export type MiddlewareFunction = (
	req: BunRequest,
	procedureName: string, // The procedure name being executed.
	context: ContextType, // The middleware can modify this context so that downstream handlers can read the information.
) => Promise<void>;

type ServiceImplementationHandlers<ServiceT extends Service> = {
	[ProcName in keyof ServiceT["procedures"]]: ProcedureHandler<
		ServiceT["procedures"][ProcName]
	>;
};

export type WebhookHandlerFunction = (req: Request) => Promise<Response>;

export class ServiceImplementationBuilder<ServiceT extends Service> {
	middleware: MiddlewareFunction | undefined = undefined;
	handlers: Partial<ServiceImplementationHandlers<ServiceT>> = {};
	serviceSchema: ServiceT;
	constructor(serviceSchema: ServiceT) {
		this.serviceSchema = serviceSchema;
	}

	registerProcedureImplementation<
		ProcName extends keyof ServiceT["procedures"],
	>(
		procedureName: ProcName,
		handler: ProcedureHandler<ServiceT["procedures"][ProcName]>,
	) {
		this.handlers[procedureName] = handler;
		return this;
	}

	setMiddleware(middleware: MiddlewareFunction) {
		this.middleware = middleware;
		return this;
	}

	build(): ServiceImplementationHandlers<ServiceT> {
		const requiredProcedureNames = Object.keys(this.serviceSchema.procedures);
		const implementedProcedureNames = Object.keys(this.handlers);

		const missingProcedures = requiredProcedureNames.filter(
			(pName) => !implementedProcedureNames.includes(pName),
		);

		if (missingProcedures.length > 0) {
			throw new Error(
				`Service implementation for "${this.serviceSchema.name}" is incomplete. Missing procedures: ${missingProcedures.join(", ")}`,
			);
		}

		const extraProcedures = implementedProcedureNames.filter(
			(pName) => !requiredProcedureNames.includes(pName),
		);

		if (extraProcedures.length > 0) {
			// This case is less likely if using registerProcedureImplementation correctly
			// due to the keyof constraint, but good for robustness.
			console.warn(
				`Service implementation for "${this.serviceSchema.name}" has extra procedure handlers defined that are not in the schema: ${extraProcedures.join(", ")}`,
			);
		}

		if (
			this.serviceSchema.middlewareDescription !== undefined &&
			this.middleware === undefined
		) {
			throw new Error(
				`A middleware for the service ${this.serviceSchema.name} is required but has not been implemented.`,
			);
		}
		const finalHandlers = { ...this.handlers };

		// Add middleware if defined
		const result: ServiceImplementationHandlers<ServiceT> = {
			...(this.middleware && { middleware: this.middleware }),
			// Spread the required handlers (already checked for existence)
			...finalHandlers,
		} as ServiceImplementationHandlers<ServiceT>; // Assert final type

		// Final check to ensure all required keys are present after assembly
		for (const pName of requiredProcedureNames) {
			if (!result[pName as keyof typeof result]) {
				// This should ideally not happen if the logic above is correct, but acts as a safeguard.
				throw new Error(
					`Internal error during build: Procedure "${pName}" handler missing in final object for service "${this.serviceSchema.name}".`,
				);
			}
		}

		return result;
	}
}

const RequestBodySchema = z.object({
	procedure: z.string({ message: "Procedure is not present in the body" }),
	service: z.string({ message: "Service is not present in the body" }),
	data: z.custom<Required<any>>((d) => d !== undefined && d !== null, {
		message: "Data must be present",
	}),
});

type Head<T> = T extends any ? T : never;

async function* generatorTransform(
	inp: AsyncGenerator<any>,
): AsyncGenerator<string> {
	try {
		for await (const chunk of inp) {
			yield `event: content\ndata: ${JSON.stringify(chunk)}\n\n`;
		}
	} catch (e: any) {
		console.log("Error at iterator.", e);
		yield `event: error\ndata: ${e}\n\n`;
	}
}

export class Server<SchemaT extends APISchema> {
	schema: SchemaT;
	implementation: FullImplementation<SchemaT>;
	webhookHandler?: WebhookHandlerFunction;
	private _server: Bun.Server<{}> | undefined;
	private connectionPool: Array<
		ConnectionWritter<Procedure<ProcedureType, any, any>>
	>;
	constructor(schema: SchemaT, implementation: FullImplementation<SchemaT>) {
		this.schema = schema;
		this.implementation = implementation;
		this.connectionPool = [];
	}

	private buildHandler() {
		return async (request: BunRequest) => {
			// Only open under _api, if not, then close the connection
			const urlObject = new URL(request.url);
			if (urlObject.pathname.split("/")[1] !== "_api") {
				console.log(
					"[ZYNAPSE] The base url of the requested resource is invalid.",
				);
				return new Response(null, {
					status: 400,
				});
			}

			// Parse the request body
			try {
				let body: any;
				if (urlObject.searchParams.has("payload")) {
					const p = urlObject.searchParams.get("payload")!;
					const decodedBody = decodeURIComponent(p);
					body = JSON.parse(decodedBody);
				} else {
					body = await request.json();
				}
				const parsedBody = await RequestBodySchema.safeParseAsync(body);
				if (parsedBody.success === false) {
					return new Response(parsedBody.error.message, {
						status: 400,
					});
				}

				// Now, lets check if we have that procedure.
				const serviceDefinition = this.schema.services[parsedBody.data.service];
				const implementationHandler =
					this.implementation[parsedBody.data.service];
				if (
					implementationHandler === undefined ||
					serviceDefinition === undefined
				) {
					console.error(
						`[ZYNAPSE] The service ${parsedBody.data.service} doesn't exist`,
					);
					return new Response(
						`The service ${parsedBody.data.service} doesn't exist`,
						{
							status: 404,
						},
					);
				}

				// Before proceding to the final execution, lets check if we have the procedure that the client is asking.
				const procedureHandler =
					implementationHandler[parsedBody.data.procedure];
				const procedureDefinition = serviceDefinition.getProcedure(
					parsedBody.data.procedure,
				) as Procedure<ProcedureType, z.Schema, z.Schema>;

				if (
					procedureHandler === undefined ||
					procedureDefinition === undefined
				) {
					console.log(
						`[ZYNAPSE] The procedure ${parsedBody.data.procedure} doesn't exist`,
					);
					return new Response(
						`The procedure ${parsedBody.data.procedure} doesn't exist`,
						{
							status: 404,
						},
					);
				}

				// Validate the procedure input
				const parsedArgumentsResult =
					await procedureDefinition.input.safeParseAsync(parsedBody.data.data);
				if (parsedArgumentsResult.success === false) {
					console.log(
						`[ZYNAPSE] The input has failed the validation: ${parsedArgumentsResult.error.message}`,
					);
					return new Response(
						`The input has failed the validation: ${parsedArgumentsResult.error.message}`,
						{
							status: 400,
						},
					);
				}

				const ctx: ContextType = new Map();

				// Now, run the middleware if it exists
				if (implementationHandler.middleware !== undefined) {
					console.log("[ZYNAPSE] Running middleware");
					try {
						await (
							implementationHandler.middleware as unknown as MiddlewareFunction
						)(request, procedureDefinition.name, ctx);
					} catch (e) {
						console.log("[ZYNAPSE] Error on middleware", e);
						return new Response(undefined, {
							status: 500,
						});
					}
				}

				try {
					if (procedureDefinition.method === "SUBSCRIPTION") {
						const conn = new Connection();
						const connWritter = new ConnectionWritter(
							conn,
							procedureDefinition,
						);
						request.signal.addEventListener("abort", async () => {
							await connWritter.close();
						});
						this.connectionPool.push(connWritter);

						procedureHandler(
							parsedArgumentsResult.data,
							request,
							ctx,
							connWritter,
						).catch((e) => {
							console.error(
								`[ZYNAPSE] [${procedureDefinition.name}-${procedureDefinition.method}] ${e}`,
							);
						});

						return new Response(conn.getStream(), {
							headers: {
								"Content-Type": "text/event-stream",
								"Access-Control-Allow-Origin": "*", // NOTE: Temporal patch to be able to test in localhost
							},
						});
					}
					const output = await (
						procedureHandler as NormalProcedureHandler<
							typeof procedureDefinition
						>
					)(parsedArgumentsResult.data, request, ctx);

					return new Response(
						JSON.stringify({
							data: output,
						}),
						{
							status: 200,
						},
					);
				} catch (e) {
					console.error("[ZYNAPSE] The handler threw an error", e);
					return new Response(`The endpoint returned an error ${e}`, {
						status: 500,
					});
				}
			} catch (e) {
				console.log("[ZYNAPSE] The body could not be parsed into JSON", e);
				return new Response("Request cannot be parsed at the moment", {
					status: 500,
				});
			}
		};
	}

	registerWebhookHandler(handler: WebhookHandlerFunction) {
		this.webhookHandler = handler;
	}

	private async handleWebhook(req: BunRequest) {
		if (this.webhookHandler) {
			return this.webhookHandler(req);
		}

		console.error(
			"[ZYNAPSE] Webhook endpoint was called, but no endpoint has been registered.",
		);
		return new Response(null, {
			status: 404,
		});
	}

	start(port?: number) {
		if (this._server !== undefined) {
			throw new Error("Cannot start 2 instances of the same server");
		}
		const _port = port || 3000;

		const handler = this.buildHandler();

		this._server = Bun.serve({
			port: _port,
			idleTimeout: 45,
			routes: {
				"/_api": handler,
				"/_api/webhook": (req) => this.handleWebhook(req),
			},
			async fetch(req) {
				console.log(`[ZYNAPSE] Invalid request received. ${req.url}`);
				return new Response(null, {
					status: 404,
				});
			},
		});

		const stopServer = async () => {
			await this.stop();
		};

		process.on("SIGTERM", stopServer);
		process.on("SIGINT", stopServer);
		process.on("SIGKILL", stopServer);
		process.on("SIGHUP", stopServer);

		console.log(`[ZYNAPSE] Listening on ${_port}`);
	}

	async stop() {
		if (this._server === undefined) {
			console.log("[ZYNAPSE] Nothing to stop");
			return;
		}

		console.log(`[ZYNAPSE] Closing ${this.connectionPool.length} connections`);
		for (const conn of this.connectionPool) {
			await conn.close();
		}
		console.log("[ZYNAPSE] All connections has been closed.");

		await this._server.stop();
		console.log("[ZYNAPSE] Server stopped");
		process.exit(0);
	}
}
