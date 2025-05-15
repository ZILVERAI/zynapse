import { APISchema, Service } from "../src/schema";
import { Server, ServiceImplementationBuilder } from "../src/server";
import { z } from "zod";

// First, declare the API schema with all its procedures and services

const postsService = new Service("Posts")
	.setMiddlewareDescription("Check the user auth cookie")
	.addProcedure({
		method: "QUERY",
		description: "Useful for getting all the posts of a given user",
		input: z.object({
			userId: z.number({
				message: "The user ID must be a number",
			}),
		}),
		name: "GetUserPosts",
		output: z.object({
			posts: z.array(
				z.object({
					title: z.string(),
					creationDate: z.date(),
				}),
			),
		}),
	});

const schema = new APISchema({
	Posts: postsService,
});

// Now, create the implementation of such schema.
const postsServiceImplementation = new ServiceImplementationBuilder(
	postsService,
	// All the handlers MUST always be an async function, it needs to return a promise
)
	.setMiddleware(async (r) => {
		r.cookies.set("asd", "asd", {});
	})
	.registerProcedureImplementation("GetUserPosts", async (input, request) => {
		// By default the input is typesafe using the schema you defined before
		// The actual implementation of the procedure goes here!.
		console.log(`Getting the posts of the user ${input.userId}`);
		// Some work here...

		// And some cookies too!
		request.cookies.set("my", "cookie");

		// The output is also type safe, making the wrong implementation will also raise an error internally
		return {
			posts: [
				{
					creationDate: new Date(),
					title: "Cool world",
				},
			],
		};
	});

// The server intakes both the full API schema and the implementation we do.
const server = new Server(schema, {
	Posts: postsServiceImplementation.build(), // It is needed to run .build for every service in here too.
});

// And finally, it can be started:
server.start();
