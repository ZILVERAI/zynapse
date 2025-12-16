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
	// @ts-ignore
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

async function bidirectionalProcedureCodeGen(
	proc: Procedure,
	parentService: Service,
): Promise<string> {
	const { outputTypeIdentifier, stringifiedAlias } = getOutputAlias(
		proc,
		parentService,
	);

	const inputIdentifier = `${parentService.name}${proc.name}BidirectionalInputSchema`;
	const jsonSchema = ztj(proc.input, {
		errorMessages: true,
		markdownDescription: true,
	});
	// @ts-ignore
	const schema = jtz(jsonSchema, {
		withJsdocs: true,
		name: inputIdentifier,
	});

	let buff: string = `export ${schema}\nexport ${stringifiedAlias}\n\nexport function use${parentService.name}${proc.name}Bidirectional`;
	buff += `(active?: boolean = true,extraOptions?: {
	onError?: (errorMessage: string) => void;
	onClose?: () => void;
})`;
	buff += "{\n";
	buff += `/*${proc.description}*/\n`;

	// Initial setup of state.
	buff += `const socketRef = useRef<WebSocket>();\n`;
	buff += `const [messages, setMessages] = useState<Array<${outputTypeIdentifier}>>([]);\n`;
	buff += `const [isConnected, setIsConnected] = useState<boolean>(false);\n`;

	// Avoid re-render on callback change.
	buff += `
const onErrorRef = useRef(extraOptions?.onError);
const onCloseRef = useRef(extraOptions?.onClose);

useEffect(() => {
    onErrorRef.current = extraOptions?.onError;
    onCloseRef.current = extraOptions?.onClose;
}, [extraOptions]);\n`;

	// Send function
	buff += `
const send = useCallback((data: z.infer<typeof ${inputIdentifier}>) => {
	if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
		socketRef.current.send(JSON.stringify(data));
	}
}, []);\n`;

	// Use effect main logic.
	buff += `useEffect(() => {
		if (socketRef.current) {
			return;
		}

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const targetURL = new URL(\`\${protocol}//\${window.location.host}/_api\`);
		const fullPayload = {
			service: "${parentService.name}",
			procedure: "${proc.name}",
		};
		const stringifiedArguments = JSON.stringify(fullPayload);
		const encodedArguments = encodeURIComponent(stringifiedArguments);
		targetURL.searchParams.set("payload", encodedArguments);

		const socket = new WebSocket(targetURL);
		socketRef.current = socket;

		socket.addEventListener("open", () => {
			setIsConnected(true);
		});

		socket.addEventListener("error", () => {
			if (onErrorRef.current) {
				onErrorRef.current("WebSocket connection error.");
			}
			setIsConnected(false);
		});

		socket.addEventListener("message", (ev) => {
			try {
				const data = JSON.parse(ev.data);
				setMessages((prev) => [...prev, data]);
			} catch {
				if (onErrorRef.current) {
					onErrorRef.current("Failed to decode data");
				}
			}
		});

		socket.addEventListener("close", () => {
			if (onCloseRef.current) {
				onCloseRef.current();
			}
			setIsConnected(false);
		});

		return () => {
			socket.close();
			socketRef.current = undefined;
			setIsConnected(false);
		};
	}, [active]);


return {
	messages,
	isConnected,
	send,
};
}
`;

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
	// @ts-ignore
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

	// Avoid re-render on callback change.
	buff += `
const onErrorRef = useRef(extraOptions?.onError);
const onCloseRef = useRef(extraOptions?.onClose);
  
useEffect(() => {
    onErrorRef.current = extraOptions?.onError;
    onCloseRef.current = extraOptions?.onClose;
}, [extraOptions]);\n`;

	// Use effect main logic.
	buff += `useEffect(() => {
		if (sourceRef.current) {
			return
		}

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
			

		source.addEventListener(
			"open",
			() => {
				setIsConnected(true);
			}
		);

		source.addEventListener(
			"error",
			() => {
				if (onErrorRef.current) {
					onErrorRef.current("Failed to connect.");
				}
				setIsConnected(false);
			}
		);

		source.addEventListener(
			"content",
			(ev) => {
				try {
				const data = JSON.parse(ev.data)
				setMessages((prev) => [...prev, data]);
				} catch {
					if (onErrorRef.current) {
					onErrorRef.current("Failed to decode data")
					}
				}
			}
		);

		source.addEventListener(
			"close",
			() => {
				source.close();
				if (onCloseRef.current) {
					onCloseRef.current()
				}
			}
		);

		return () => {
		source.close();
		sourceRef.current = undefined;
		setIsConnected(false)
		};
	}, [args]);
	
	
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
	// @ts-ignore
	const jsonSchema = jtz(schema, {
		withJsdocs: true,
		name: inputIdentifier,
	});

	let buff: string = `export ${jsonSchema}\nexport ${stringifiedAlias}\n\nexport function use${parentService.name}${proc.name}Query`;

	const extraOptionsType = `Omit<UseQueryOptions<${outputTypeIdentifier}, Error, ${outputTypeIdentifier}, Array<string | z.infer<typeof ${inputIdentifier}>>>, "queryKey" | "queryFn">`;

	buff += `(args: z.infer<typeof ${inputIdentifier}>, extraOptions?: ${extraOptionsType})`;
	// Actual logic of the buffer here
	buff += "{\n";
	buff += `/*${proc.description}*/\n`;

	// Form the keys array with args included
	const staticKeys = [parentService.name, proc.name];

	buff += `\treturn useQuery({queryKey: [${staticKeys.map((k) => `"${k}"`).join(", ")}, args], 
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
		} else if (proc.method === "BIDIRECTIONAL") {
			procedureCode = await bidirectionalProcedureCodeGen(proc, service);
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
		const hasSubscription = serviceHasMethod(service, "SUBSCRIPTION");
		const hasBidirectional = serviceHasMethod(service, "BIDIRECTIONAL");
		if (hasSubscription || hasBidirectional) {
			const reactImports = ["useEffect", "useRef", "useState"];
			if (hasBidirectional) {
				reactImports.unshift("useCallback");
			}
			finalBuffer += `import { ${reactImports.join(", ")} } from "react";\n`;
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
