import { APISchema, Service, type Procedure } from "../schema";
import { z } from "zod";

export type ProcedureHandler<P extends Procedure<any, any>> = (
	args: z.infer<P["input"]>,
) => Promise<z.infer<P["output"]>>;

export type ServiceImplementationHandlers<ServiceT extends Service> = {
	[ProcName in keyof ServiceT["procedures"]]: ProcedureHandler<
		ServiceT["procedures"][ProcName]
	>;
};

export type FullImplementation<SchemaT extends APISchema> = {
	[ServiceName in keyof SchemaT["services"]]: ServiceImplementationHandlers<
		SchemaT["services"][ServiceName]
	>;
};

export type MiddlewareFunction = (req: Request, res: Response) => Promise<void>;

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

export class Server<SchemaT extends APISchema> {
	schema: SchemaT;
	implementation: FullImplementation<SchemaT>;
	constructor(schema: SchemaT, implementation: FullImplementation<SchemaT>) {
		this.schema = schema;
		this.implementation = implementation;
	}
}
