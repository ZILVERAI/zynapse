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
	})
	.addProcedure({
		method: "SUBSCRIPTION",
		description: "Useful for getting all the posts of a given user",
		input: z.object({
			userId: z.number({
				message: "The user ID must be a number",
			}),
		}),
		name: "StreamedGetUserPosts",
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
	.setMiddleware(async (r, procedureName, ctx) => {
		// The middleware is capable of accessing the name of the procedure being called in the request.
		console.log(`Intercepted ${procedureName} call!`);
		// It is capable of accesing the request, being able to set cookies.
		r.cookies.set("asd", "asd", {});
		// An extra argument is being passed, the context argument, this is an accessible and modifiable Map object that the middleware can use to send information to the
		// downstream procedures!
		ctx.set("key", "value");
		ctx.set(
			"message",
			"All this information will be accessible on the downstream procedures!",
		);
		ctx.set("key", "newvalue"); // Since the object under the hood is a map, this operation would update the original value
	})
	.registerProcedureImplementation(
		"GetUserPosts",
		async (input, request, ctx) => {
			// By default the input is typesafe using the schema you defined before
			// The actual implementation of the procedure goes here!.
			console.log(`Getting the posts of the user ${input.userId}`);
			// Some work here...

			// And some cookies too!
			request.cookies.set("my", "cookie");

			// The capacity of being able to read the context is also possible!
			ctx.has("key"); // Result: true
			ctx.has("message"); // Result: true
			ctx.has("random"); // Result: false

			console.log("Value of key:", ctx.get("key")); // Result: 'newvalue'

			// The output is also type safe, making the wrong implementation will also raise an error internally
			return {
				posts: [
					{
						creationDate: new Date(),
						title: "Cool world",
					},
				],
			};
		},
	)
	.registerProcedureImplementation(
		"StreamedGetUserPosts",
		async function* (input, request, ctx) {
			// Streamed procedures can use the same parameters, the only thing that changes is the function signature that now it must be an
			// AsyncGenerator
			console.log(`Streaming the posts of the user ${input.userId}`);

			request.cookies.set("streamed", "true");

			yield {
				posts: [
					{
						creationDate: new Date(),
						title: "Cool streaming!",
					},
				],
			};
		},
	);

// The server intakes both the full API schema and the implementation we do.
const server = new Server(schema, {
	Posts: postsServiceImplementation.build(), // It is needed to run .build for every service in here too.
});

// And finally, it can be started:
server.start();
