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

const testService = new Service("");

const testSchema = new APISchema({
	Users: usersService,
});

test("A basic implementation works", async () => {
	const impl = new ServiceImplementationBuilder(testSchema.services.Users)
		.registerProcedureImplementation("GetUserById", async (inp) => {
			return true;
		})
		.registerProcedureImplementation("ChangeUsername", async (np) => {
			return true;
		})
		.registerProcedureImplementation(
			"StreamName",
			async (ip, req, ctx, conn) => {
				for (const letter of ip.name.split("")) {
					conn.write({
						letter,
					});
				}
			},
		)
		.registerProcedureImplementation("Messages", async (req, conn, ctx) => {
			conn.addOnMessageListener({
				name: "Test",
				callback: async (conn, msg) => {
					console.log("Got a message!: ", msg);
					conn.sendMessage({
						success: true,
					});
				},
			});
		})
		.setMiddleware(async (r) => {
			// Test middleware
		});

	const server = new Server(testSchema, {
		Users: impl.build(),
	});

	server.start(1234);

	const p = {
		service: "Users",
		procedure: "Messages",
		data: { msg: "" },
	};
	const urlObj = new URL("ws://localhost:1234/_api");
	urlObj.searchParams.set("payload", JSON.stringify(p));
	const ws = new WebSocket(urlObj);
	const messages: Array<any> = [];
	ws.addEventListener("message", (ev) => {
		messages.push(ev.data);
	});

	await new Promise<void>((resolve, reject) => {
		ws.addEventListener("open", () => {
			ws.send(JSON.stringify({ msg: "hello" }));
			// resolve();
			setTimeout(() => {
				resolve();
			}, 500);
		});
		ws.addEventListener("error", (e) => {
			reject(new Error("WebSocket error"));
		});
	});

	ws.close();
	server.stop();
	expect(messages.length).toBe(1);
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
		.registerProcedureImplementation(
			"StreamName",
			async function (inp, req, ctx, conn) {
				conn.write({
					letter: "dummy",
				});
			},
		);

	expect(impl.build).toThrowError();
});
