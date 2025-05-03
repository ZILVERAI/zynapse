import { APISchema, Service } from "../src/schema";
import { z } from "zod";
import { Server, ServiceImplementationBuilder } from "../src/server";

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
	});

const testSchema = new APISchema({
	Users: usersService,
});

const impl = new ServiceImplementationBuilder(testSchema.services.Users)
	.registerProcedureImplementation("GetUserById", async (inp) => {
		return true;
	})
	.registerProcedureImplementation("ChangeUsername", async (np) => {
		return true;
	});

const server = new Server(testSchema, {
	Users: impl.build(),
});
