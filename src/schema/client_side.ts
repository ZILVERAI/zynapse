import type { isAssertEntry } from "typescript";
import { APISchema, Service } from ".";
import type { Procedure } from ".";
import { zodToTs, printNode, createTypeAlias } from "zod-to-ts";
import * as prettier from "prettier";

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

	let buff: string = `${stringifiedAlias}\n\nexport function use${parentService.name}${proc.name}Mutation`;

	const { node } = zodToTs(proc.input);
	const stringifiedInputType = printNode(node);

	buff += `() {
/*${proc.description}*/
return useMutation({
	mutationFn: async (args: ${stringifiedInputType}) => {
		const response = await fetch("/_api",{
			method: "POST",
			body: JSON.stringify({
					service: '${parentService.name}',
					proc: '${proc.name}',
					data: args
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

	let buff: string = `${stringifiedAlias}\n\nexport function use${parentService.name}${proc.name}Query`;
	if (proc.input !== undefined) {
		const { node } = zodToTs(proc.input);
		const stringifiedNode = printNode(node);

		buff += `(args: ${stringifiedNode})`;
	} else {
		buff += "()";
	}

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
	let bodyData: string = "";
	if (proc.input !== undefined) {
		bodyData += "data: args";
	}

	// Append them in the body
	// TODO: Currenty we don't support dynamic query keys because of this JSON stringify, please fix.
	buff += `\treturn useQuery({queryKey: ${JSON.stringify(queryKeys)}, 
		queryFn: async () => {
			const response = await fetch('/_api', {
				method: "POST",
				body: JSON.stringify({
					service: '${parentService.name}',
					proc: '${proc.name}',
					${bodyData}
				}),
				})

				if (!response.ok) {
					throw new Error("Non ok response")
				}

				const rawResponse = await response.json()
				return rawResponse["data"] as ${outputTypeIdentifier}
			}
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

export async function GenerateCode(schema: APISchema) {
	let finalBuffer: string = `${buffer}`;
	for (const [key, val] of Object.entries(schema.services)) {
		const buffers = await GenerateServiceCode(val);
		finalBuffer += `// ---- Service Name: ${val.name} ----\n`;
		finalBuffer += buffers.join("\n");
		finalBuffer += "//----";
	}

	return await prettier.format(finalBuffer, { parser: "babel-ts" });
}
