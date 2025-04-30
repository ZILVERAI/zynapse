import { z } from "zod";
import { APISchema, Service } from "../src/schema";
import { expect, test } from "bun:test";

test("Basic Schema", () => {
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

	expect(Object.keys(s.services).length).toBe(1);

	expect(usersService.procedures.length).toBe(2);
});
