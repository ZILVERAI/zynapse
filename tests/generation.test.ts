import { expect, test } from "bun:test";
import { z } from "zod";
import ztj from "zod-to-json-schema";
import jtz from "json-schema-to-zod";

const schema = z.object({
	x: z.string().uuid("asd"),
	y: z.date(),
	z: z.string().base64("xdd"),
});

test("Try zod to json schema", () => {
	const jsonSchema = ztj(schema, {
		errorMessages: true,
		markdownDescription: true,
	});
	console.log(jsonSchema);
	if (jsonSchema) {
		// @ts-ignore
		const zodObj = jtz(jsonSchema, {
			withJsdocs: true,
		});
		console.log(zodObj);
	}
});
