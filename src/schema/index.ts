import { z } from "zod";

type ProcedureType = "MUTATION" | "QUERY";

/**
 * Represents a single procedure.
 */
export interface Procedure<
	TInput extends z.Schema = z.AnyZodObject,
	TOuput extends z.Schema = z.AnyZodObject,
> {
	// The name of the procdedure, must be unique and URI safe.
	name: string;

	// A description of what the procedure is supposed to do
	description: string;

	// The method to be used for the procedure
	method: ProcedureType;

	// If the method requires an input.
	input: TInput;

	// The output of the endpoint
	output: TOuput;
}

/**
 * Router, a container for multiple procedures. It can have a middleware which will run before each procedure.
 */

type ServiceProcedures = { [procName: string]: Procedure<any, any> };
interface IService {
	procedures: ServiceProcedures;
	middlewareDescription?: string; // A description of what should be the middleware responsability.
	name: string;
}

export class Service<
	TProcedures extends ServiceProcedures = { [a: string]: Procedure },
> {
	middlewareDescription?: string | undefined;
	name: string = "";
	procedures: TProcedures;
	constructor(name: string, middleware?: string) {
		this.name = name;
		this.middlewareDescription = middleware;
		this.procedures = {} as TProcedures;
	}

	// Method to add a procedure - MUTATES the current instance
	addProcedure<
		M extends ProcedureType,
		N extends string,
		// Ensure Desc matches the Procedure interface (string | undefined if optional)
		Desc extends string, // Or string | undefined if description is optional
		I extends z.Schema,
		O extends z.Schema,
	>(procDefinition: {
		method: M;
		name: N;
		description: Desc; // Match interface (required or optional)
		input: I;
		output: O;
	}): Service<
		// The return *type* reflects the added procedure
		TProcedures & {
			// Using intersection type to add the new procedure signature
			[K in N]: Procedure<I, O> & { method: M; name: N; description: Desc };
		}
	> {
		// Create the procedure object explicitly matching the target type structure
		const newProcedure: Procedure<I, O> & {
			method: M;
			name: N;
			description: Desc;
		} = {
			// Spread the definition to copy properties, ensuring all are included
			...procDefinition,
			// Explicitly assign to ensure structure matches if needed, though spread is often sufficient
			// name: procDefinition.name,
			// description: procDefinition.description,
			// method: procDefinition.method,
			// input: procDefinition.input,
			// output: procDefinition.output,
		};

		// Mutate the internal procedures map.
		// Use a type assertion on `this.procedures` because we're adding a property
		// dynamically. Treat it as a general record for the assignment.
		(this.procedures as ServiceProcedures)[procDefinition.name] = newProcedure;

		// Return the *same instance* ('this') but CAST its type using 'as'.
		// This tells TypeScript to treat 'this' going forward *as if* it has the
		// new, more specific type that includes the added procedure.

		return this as unknown as Service<
			TProcedures & {
				[K in N]: Procedure<I, O> & { method: M; name: N; description: Desc };
			}
		>;
	}

	// Simple non-generic getProcedure
	getProcedure<PName extends keyof TProcedures>(
		name: PName,
	): TProcedures[PName] {
		// Access using the potentially broader type ServiceProcedures
		// Or just directly access: this.procedures[name as keyof TProcedures]
		return this.procedures[name];
	}
}

export class APISchema<
	TServices extends Record<string, Service<any>> = {
		[serviceName: string]: Service<any>;
	},
> {
	public services: TServices;

	constructor(services: TServices = {} as TServices) {
		this.services = services;
	}

	// Returns a *new* APISchema instance with the updated type signature
	registerService<
		SName extends string,
		SInstance extends Service<any>, // Capture the specific Service type being added
	>(
		service: SInstance & { name: SName }, // Ensure the service instance has the correct literal name type
	): APISchema<TServices & { [K in SName]: SInstance }> {
		// Return type includes the specific service

		if (service.name in this.services) {
			console.warn(
				`Service "${service.name}" is already registered and will be overwritten.`,
			);
		}

		const newServices = {
			...this.services,
			[service.name]: service, // Add the service with its specific type
		} as TServices & { [K in SName]: SInstance }; // Assert the combined type
		this.services = newServices;

		// Return a new APISchema instance holding the combined, typed services map
		return this as unknown as APISchema<
			TServices & { [K in SName]: SInstance }
		>;
	}
}
