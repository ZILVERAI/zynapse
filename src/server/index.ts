import type { BunRequest } from "bun";
import {
	APISchema,
	Service,
	type Procedure,
	type ProcedureType,
} from "../schema";
import { z } from "zod";
import { PassThrough, Readable } from "stream";

type ContextType = Map<string, any>;

type ProcedureHandler<P extends Procedure<ProcedureType, any, any>> = (
	args: z.infer<P["input"]>,
	request: BunRequest,
	context: ContextType, // Information that the middleware is capable of passing to the handler.
) => P["method"] extends `SUBSCRIPTION`
	? AsyncGenerator<z.infer<P["output"]>>
	: Promise<z.infer<P["output"]>>;

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
	private _server: Bun.Server | undefined;
	constructor(schema: SchemaT, implementation: FullImplementation<SchemaT>) {
		this.schema = schema;
		this.implementation = implementation;
	}

	private buildHandler(): Bun.RouterTypes.RouteHandler<string> {
		return async (request) => {
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
				const body = await request.json();
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
					console.log("[ZYNAPSE] Service not found");
					return new Response("Service not found", {
						status: 404,
					});
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
					console.log("[ZYNAPSE Procedure not found]");
					return new Response("Procedure not found", {
						status: 404,
					});
				}

				// Validate the procedure input
				const parsedArgumentsResult =
					await procedureDefinition.input.safeParseAsync(parsedBody.data.data);
				if (parsedArgumentsResult.success === false) {
					console.log("[ZYNAPSE] The input has failed the validation");
					return new Response("Invalid input", {
						status: 400,
					});
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
					const handlerResult = procedureHandler(
						parsedArgumentsResult.data,
						request,
						ctx,
					);

					// Check if the procedure is of type subscription, in which case the output is an Async generator
					if (procedureDefinition.method === "SUBSCRIPTION") {
						const transformed = generatorTransform(
							handlerResult as AsyncGenerator<
								z.infer<typeof procedureDefinition.output>
							>,
						);
						return new Response(transformed, {
							headers: {
								"Content-Type": "text/event-stream",
							},
						});
					}
					const output = await procedureHandler(
						parsedArgumentsResult.data,
						request,
						ctx,
					);

					return new Response(
						JSON.stringify({
							data: output,
						}),
						{
							status: 200,
						},
					);
				} catch (e) {
					console.log("[ZYNAPSE] The handler threw an error");
					return new Response("Function error", {
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

	start(port?: number) {
		if (this._server !== undefined) {
			throw new Error("Cannot start 2 instances of the same server");
		}
		const _port = port || 3000;

		const handler = this.buildHandler();

		this._server = Bun.serve({
			port: _port,

			routes: {
				"/_api": handler,
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

		console.log(`[ZYNAPSE] Listening on ${_port}`);
	}

	async stop() {
		if (this._server === undefined) {
			console.log("[ZYNAPSE] Nothing to stop");
			return;
		}
		await this._server.stop();
		console.log("[ZYNAPSE] Server stopped");
		return;
	}
}
