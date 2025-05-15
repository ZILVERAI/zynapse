import type { isAssertEntry } from "typescript";
import { APISchema, Service } from ".";
import type { Procedure } from ".";
import { zodToTs, printNode, createTypeAlias } from "zod-to-ts";
import * as prettier from "prettier";
import ztj from "zod-to-json-schema";
import jtz from "json-schema-to-zod";

const buffer: string = `
import * as React from "react"
import {
  useQuery,
  useMutation,

} from "@tanstack/react-query";\n\n
`;

function getOutputAlias(proc: Procedure, parentService: Service) {
	const outputTypeIdentifier = `${parentService.name}${proc.name}OutputType`;
	const { node } = zodToTs(proc.output, outputTypeIdentifier);
	const alias = createTypeAlias(node, outputTypeIdentifier);
	const stringifiedAlias = printNode(alias);
	return { outputTypeIdentifier, stringifiedAlias };
}

async function mutationProcedureCodeGen(
	proc: Procedure,
	parentService: Service,
) {
	const { outputTypeIdentifier, stringifiedAlias } = getOutputAlias(
		proc,
		parentService,
	);

	const inputAliasIdentifier = `${parentService.name}${proc.name}InputSchema`;
	const schema = ztj(proc.input, {
		errorMessages: true,
		markdownDescription: true,
	});
	const zodCode = jtz(schema, {
		withJsdocs: true,
		name: inputAliasIdentifier,
	});

	let buff: string = `export ${stringifiedAlias}\nexport ${zodCode}\nexport function use${parentService.name}${proc.name}Mutation`;

	buff += `(extraOptions?: Omit<UseMutationOptions<${outputTypeIdentifier}, unknown, z.infer<typeof ${inputAliasIdentifier}>, unknown>, "mutationFn">) {
/*${proc.description}*/
return useMutation({
...extraOptions,
	mutationFn: async (args: z.infer<typeof ${inputAliasIdentifier}>) => {
		const validationResult = await ${inputAliasIdentifier}.safeParseAsync(args)
		if (validationResult.error) {
			console.error("Error on validating mutation input ", validationResult.error)
			throw new Error(validationResult.error.message)
		}

		
		const response = await fetch("/_api",{
			method: "POST",
			body: JSON.stringify({
					service: '${parentService.name}',
					procedure: '${proc.name}',
					data: validationResult.data
				}),
		})

		if (!response.ok) {
			throw new Error("Mutation error")
		}

		const rawResponse = await response.json()

		return rawResponse as ${outputTypeIdentifier}
	}
})
		
	}`;

	return await prettier.format(buff, { parser: "babel-ts" });
}

async function queryProcedureCodeGen(proc: Procedure, parentService: Service) {
	// Extract the output typeAlias

	const { outputTypeIdentifier, stringifiedAlias } = getOutputAlias(
		proc,
		parentService,
	);

	const inputIdentifier = `${parentService.name}${proc.name}QueryInputSchema`;
	const schema = ztj(proc.input, {
		errorMessages: true,
		markdownDescription: true,
	});
	const jsonSchema = jtz(schema, {
		withJsdocs: true,
		name: inputIdentifier,
	});

	let buff: string = `export ${jsonSchema}\nexport ${stringifiedAlias}\n\nexport function use${parentService.name}${proc.name}Query`;

	const extraOptionsType = `Omit<UseQueryOptions<${outputTypeIdentifier}, unknown, ${outputTypeIdentifier}, Array<string>>, "queryKey" | "queryFn">`;

	buff += `(args: z.infer<typeof ${inputIdentifier}>, extraOptions?: ${extraOptionsType})`;
	// Actual logic of the buffer here
	buff += "{\n";
	buff += `/*${proc.description}*/\n`;

	// Form the keys array
	const queryKeys: Array<string> = [parentService.name, proc.name];
	// TODO: Dynamic keys not supported yet
	// if (proc.input !== undefined) {
	// 	queryKeys.push(`JSON.stringify(args)`); // Include the arguments being passed as key for cache (need a better soution)
	// }

	// Request body including/not including data

	// Append them in the body
	// TODO: Currenty we don't support dynamic query keys because of this JSON stringify, please fix.
	buff += `\treturn useQuery({queryKey: ${JSON.stringify(queryKeys)}, 
		queryFn: async () => {
			const validationResult = await ${inputIdentifier}.safeParseAsync(args)
			if (validationResult.error) {
				console.error("Error on input validation of ${proc.name}", validationResult.error)
				throw new Error(validationResult.error.message)
			}


		
			const response = await fetch('/_api', {
				method: "POST",
				body: JSON.stringify({
					service: '${parentService.name}',
					procedure: '${proc.name}',
					data: validationResult.data
				}),
				})

				if (!response.ok) {
					throw new Error("Non ok response")
				}

				const rawResponse = await response.json()
				return rawResponse["data"] as ${outputTypeIdentifier}
			},
			...extraOptions
		}
	)`;

	buff += "}";

	return await prettier.format(buff, { parser: "babel-ts" });
}

async function GenerateServiceCode(service: Service) {
	const serviceBuffers: Array<string> = [];
	for (const [pName, proc] of Object.entries(service.procedures)) {
		let procedureCode: string = "";
		if (proc.method === "MUTATION") {
			procedureCode = await mutationProcedureCodeGen(proc, service);
		} else if (proc.method === "QUERY") {
			procedureCode = await queryProcedureCodeGen(proc, service);
		} else {
			console.error("UNKOWN METHOD!");
			throw new Error("unk method");
		}

		serviceBuffers.push(procedureCode);
	}

	return serviceBuffers;
}

function schemaHasMethod(schema: APISchema, method: Procedure["method"]) {
	for (const [key, val] of Object.entries(schema.services)) {
		for (const [, proc] of Object.entries(val.procedures)) {
			if ((proc as Procedure).method === method) {
				return true;
			}
		}
	}
	return false;
}

export async function GenerateCode(schema: APISchema) {
	let finalBuffer: string = ``;
	if (schemaHasMethod(schema, "MUTATION")) {
		finalBuffer += `import {useMutation, UseMutationOptions} from "@tanstack/react-query";\n`;
	}
	if (schemaHasMethod(schema, "QUERY")) {
		finalBuffer += `import {useQuery, UseQueryOptions} from "@tanstack/react-query";\n`;
	}
	finalBuffer += 'import {z} from "zod"\n\n';

	for (const [key, val] of Object.entries(schema.services)) {
		const buffers = await GenerateServiceCode(val);
		finalBuffer += `// ---- Service Name: ${val.name} ----\n`;
		finalBuffer += buffers.join("\n");
		finalBuffer += "//----";
	}

	return await prettier.format(finalBuffer, { parser: "babel-ts" });
}
