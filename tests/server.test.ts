import { APISchema, Service } from "../src/schema";
import { z } from "zod";
import { Server, ServiceImplementationBuilder } from "../src/server";
import { test, expect } from "bun:test";

const usersService = new Service("Users")
	.addProcedure({
		method: "QUERY",
		name: "GetUserById",
		description: "Get the user object by using its id.",
		input: z.object({
			id: z.string().uuid().optional(),
		}),
		output: z.boolean(),
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
	})
	.addProcedure({
		method: "SUBSCRIPTION",
		name: "StreamName",
		description: "Returns the given name, letter by letter",
		input: z.object({
			name: z.string(),
		}),
		output: z.object({
			letter: z.string().min(1),
		}),
	});

const testService = new Service("");

const testSchema = new APISchema({
	Users: usersService,
});

test("A basic implementation works", () => {
	const impl = new ServiceImplementationBuilder(testSchema.services.Users)
		.registerProcedureImplementation("GetUserById", async (inp) => {
			return true;
		})
		.registerProcedureImplementation("ChangeUsername", async (np) => {
			return true;
		})
		.registerProcedureImplementation("StreamName", async function* (ip) {
			for (const letter of ip.name.split("")) {
				yield {
					letter,
				};
			}
		})
		.setMiddleware(async (r) => {
			// Test middleware
		});

	const server = new Server(testSchema, {
		Users: impl.build(),
	});
});

test("An incomplete implementation fails", () => {
	const impl = new ServiceImplementationBuilder(
		testSchema.services.Users,
	).registerProcedureImplementation("GetUserById", async (inp) => {
		return true;
	});

	expect(impl.build).toThrowError();
});

test("A complete implementation with a typo fails", () => {
	const impl = new ServiceImplementationBuilder(testSchema.services.Users)
		//@ts-expect-error
		.registerProcedureImplementation("GetUserByID", async (inp) => {
			return true;
		})
		.registerProcedureImplementation("ChangeUsername", async (np) => {
			return true;
		})
		.registerProcedureImplementation("StreamName", async function* () {
			yield {
				letter: "t",
			};
		});

	expect(impl.build).toThrowError();
});
