import { z } from "zod";
import { APISchema, Service } from "../src/schema";
import { GenerateCode } from "../src/schema/client_side";
import { expect, test } from "bun:test";

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
		description: "Streams back the given name, letter by letter",
		input: z.object({
			name: z.string(),
		}),
		output: z.object({
			letter: z.string(),
		}),
	})
	.addProcedure({
		method: "BIDIRECTIONAL",
		name: "Messages",
		description: "A bidirectional messages service",
		input: z.object({
			msg: z.string(),
		}),
		output: z.object({
			success: z.boolean(),
		}),
	});

const testSchema = new APISchema({
	Users: usersService,
});

test("Basic Schema", () => {
	expect(Object.keys(testSchema.services).length).toBe(1);

	expect(Object.keys(usersService.procedures).length).toBe(4);
});

test("Test code gen", async () => {
	const buffer = await GenerateCode(testSchema);
	console.log(buffer);
});
