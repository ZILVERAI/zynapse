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

	buff += `(extraOptions?: Omit<UseMutationOptions<${outputTypeIdentifier}, Error, z.infer<typeof ${inputAliasIdentifier}>, unknown>, "mutationFn">) {
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
					let backendErrorMessage = ""
					try {
						backendErrorMessage = await response.text()
					} catch {
						backendErrorMessage = "No Error message returned from backen"
					}
					throw new Error("Mutation: ${proc.name} Non ok response: " + backendErrorMessage)
				}


		const rawResponse = await response.json()

		return rawResponse["data"] as ${outputTypeIdentifier}
	}
})
		
	}`;

	return await prettier.format(buff, { parser: "babel-ts" });
}

async function subscriptionProcedureCodeGen(
	proc: Procedure,
	parentService: Service,
): Promise<string> {
	const { outputTypeIdentifier, stringifiedAlias } = getOutputAlias(
		proc,
		parentService,
	);

	const inputIdentifier = `${parentService.name}${proc.name}SubscriptionInputSchema`;
	const jsonSchema = ztj(proc.input, {
		errorMessages: true,
		markdownDescription: true,
	});
	const schema = jtz(jsonSchema, {
		withJsdocs: true,
		name: inputIdentifier,
	});

	let buff: string = `export ${schema}\nexport ${stringifiedAlias}\n\nexport function use${parentService.name}${proc.name}Subscription`;
	buff += `(args: z.infer<typeof ${inputIdentifier}>,extraOptions?: {
		onError?: (errorMessage: string) => void; // Callback that executes when there's an error
		onClose?: () => void; // Callback that executes when the connection has been closed by the server
	})`;
	buff += "{\n";
	buff += `/*${proc.description}*/\n`;

	// Initial setup of state.
	buff += `const sourceRef = useRef<EventSource>();\n`;
	buff += `const [messages, setMessages] = useState<Array<${outputTypeIdentifier}>>([]);\n`;
	buff += `const [isConnected, setIsConnected] = useState<boolean>(false);\n`;

	// Use effect main logic.
	buff += `useEffect(() => {
		if (
			sourceRef.current &&
			sourceRef.current?.readyState === sourceRef.current?.OPEN
		) {
			// The connection is already stablished.
		} else {
		const targetURL = new URL("/_api", window.location.origin);
		const fullPayload = {
			service: "${parentService.name}",
			procedure: "${proc.name}",
			data: args,
		};
		const stringifiedArguments = JSON.stringify(fullPayload);
		const encodedArguments = encodeURIComponent(stringifiedArguments);
		targetURL.searchParams.set("payload", encodedArguments);

		const source = new EventSource(targetURL);
		sourceRef.current = source;
			
		}

		const aborter = new AbortController();
		

		sourceRef.current.addEventListener(
			"open",
			() => {
				setIsConnected(true);
			},
			{
				signal: aborter.signal,
			},
		);

		sourceRef.current.addEventListener(
			"error",
			() => {
				if (extraOptions?.onError) {
					extraOptions.onError("Failed to connect.");
				}
				setIsConnected(false);
				console.warn("No errror handler has been set for the event source");
			},
			{
				signal: aborter.signal,
			},
		);

		sourceRef.current.addEventListener(
			"content",
			(ev) => {
				try {
				const data = JSON.parse(ev.data)
				setMessages((prev) => [...prev, data]);
				} catch {
					if (extraOptions?.onError) {
					extraOptions.onError("Failed to decode data")
					}
				}
			},
			{
				signal: aborter.signal,
			},
		);

		sourceRef.current.addEventListener(
			"close",
			() => {
				sourceRef.current?.close();
				if (extraOptions?.onClose) {
					extraOptions.onClose();
				}
			},
			{
				signal: aborter.signal,
			},
		);

		return () => {
			aborter.abort();
		};
	}, [extraOptions, args]);
	
	
	return {
		messages,
		isConnected,
	};
	}
	`;

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

	const extraOptionsType = `Omit<UseQueryOptions<${outputTypeIdentifier}, Error, ${outputTypeIdentifier}, Array<string>>, "queryKey" | "queryFn">`;

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
					let backendErrorMessage = ""
					try {
						backendErrorMessage = await response.text()
					} catch {
						backendErrorMessage = "No Error message returned from backen"
					}
					throw new Error("Query: ${proc.name} Non ok response: " + backendErrorMessage)
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
		} else if (proc.method === "SUBSCRIPTION") {
			procedureCode = await subscriptionProcedureCodeGen(proc, service);
		} else {
			console.error("UNKOWN METHOD!");
			throw new Error("unk method");
		}

		serviceBuffers.push(procedureCode);
	}

	return serviceBuffers;
}

function serviceHasMethod(service: Service, method: Procedure["method"]) {
	for (const [, proc] of Object.entries(service.procedures)) {
		if ((proc as Procedure).method === method) {
			return true;
		}
	}
	return false;
}

type ServiceCode = { filename: string; code: string };
async function getServiceCode(
	service: Service,
	code: string,
): Promise<ServiceCode> {
	const prettified = await prettier.format(code, { parser: "babel-ts" });
	return {
		filename: service.name.toLowerCase() + ".service.ts",
		code: code,
	};
}
type SchemaCodes = Array<ServiceCode>;

export async function GenerateCode(schema: APISchema): Promise<SchemaCodes> {
	const out: SchemaCodes = [];

	for (const [key, service] of Object.entries(schema.services)) {
		let finalBuffer: string = ``;
		if (serviceHasMethod(service, "MUTATION")) {
			finalBuffer += `import {useMutation, UseMutationOptions} from "@tanstack/react-query";\n`;
		}
		if (serviceHasMethod(service, "QUERY")) {
			finalBuffer += `import {useQuery, UseQueryOptions} from "@tanstack/react-query";\n`;
		}
		if (serviceHasMethod(service, "SUBSCRIPTION")) {
			finalBuffer += `import { useEffect, useRef, useState } from "react";\n`;
		}

		finalBuffer += 'import {z} from "zod"\n\n';
		const buffers = await GenerateServiceCode(service);
		finalBuffer += `// ---- Service Name: ${service.name} ----\n`;
		finalBuffer += buffers.join("\n");
		finalBuffer += "//----";
		out.push(await getServiceCode(service, finalBuffer));
	}

	return out;
}
