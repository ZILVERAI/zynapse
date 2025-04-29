import { z } from "zod";

export type ProcedureType = "MUTATION" | "QUERY";

/**
 * Represents a single procedure.
 */
export interface Procedure {
	// The name of the procdedure, must be unique and URI safe.
	name: string;

	// A description of what the procedure is supposed to do
	description: string;

	// The method to be used for the procedure
	method: ProcedureType;

	// If the method requires an input.
	input?: z.Schema;

	// The output of the endpoint
	output: z.Schema;
}

// The next function used in the middleware when it is able to proceed.
export type NextFunction = Function;

export interface ResponseError {
	Error(): string;
}

/**
 * Router, a container for multiple procedures. It can have a middleware which will run before each procedure.
 */
export interface IService {
	procedures: Array<Procedure>;
	middlewareDescription?: string; // A description of what should be the middleware responsability.
	name: string;
}

class Service implements IService {
	middlewareDescription?: string | undefined;
	name: string = "";
	procedures: Procedure[] = [];
	constructor(name: string, middleware?: string) {
		this.name = name;
		this.middlewareDescription = middleware;
		this.procedures = [];
	}

	addProcedure(procedure: Procedure) {
		this.procedures.push(procedure);
		return this;
	}
}

class APISchema {
	services: { [key: string]: Service } = {};
	constructor() {}

	registerService(service: Service) {
		if (service.name in this.services) {
			console.warn("The specified service already existed previously.");
		}
		this.services[service.name] = service;
	}
}

const s = new APISchema();

const usersService = new Service("users")
	.addProcedure({
		method: "QUERY",
		name: "GetUserById",
		description: "Get the user object by using its id.",
		input: z.object({
			id: z.string().uuid(),
		}),
		output: z.object({
			name: z.string(),
			email: z.string(),
		}),
	})
	.addProcedure({
		method: "MUTATION",
		name: "ChangeUsername",
		description: "Change a specific user's name using its id",
		input: z.object({
			id: z.string().uuid(),
			newName: z.string().min(1).max(255),
		}),
		output: z.boolean(),
	});

s.registerService(usersService);
