import type { isAssertEntry } from "typescript";
import { APISchema, Service } from ".";
import type { Procedure } from ".";
import { zodToTs, printNode, createTypeAlias } from "zod-to-ts";
import * as prettier from "prettier";
import ztj from "zod-to-json-schema";
import jtz from "json-schema-to-zod";

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

	buff += `(extraOptions?: Omit<UseMutationOptions<${outputTypeIdentifier}, Error, z.infer<typeof ${inputAliasIdentifier}>, unknown>, "mutationFn">, headers?: Record<string, string>) {
/*${proc.description}*/
return useMutation({
...extraOptions,
	mutationFn: async (args: z.infer<typeof ${inputAliasIdentifier}>) => {
		const validationResult = await ${inputAliasIdentifier}.safeParseAsync(args)
		if (validationResult.error) {
			console.error("Error on validating mutation input ", validationResult.error)
			throw new Error(validationResult.error.message)
		}

		const targetURL = \`\${getApiBaseUrl()}/_api/${parentService.name}/${proc.name}\`;
		const response = await fetch(targetURL, {
			method: "POST",
			body: JSON.stringify(validationResult.data),
			headers: {
				"Content-Type": "application/json",
				...headers,
			},
		})

					if (!response.ok) {
				let backendErrorMessage = ""
				try {
					backendErrorMessage = await response.text()
				} catch {
					backendErrorMessage = "No Error message returned from backend"
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
	buff += `(options: UseWebSocketOptions = {}): UseWebSocketReturn<z.infer<typeof ${inputIdentifier}>, ${outputTypeIdentifier}>`;
	buff += "{\n";
	buff += `/*${proc.description}*/\n`;

	// Use effect main logic.
	buff += `
	const baseUrl = getApiBaseUrl();
	const protocol = baseUrl.startsWith("https") ? "wss:" : "ws:";
	const host = baseUrl.replace(/^https?:\\/\\//, "");
    const targetURL = \`\${protocol}//\${host}/_api/${parentService.name}/${proc.name}\`;
	return useWebSocket<z.infer<typeof ${inputIdentifier}>, ${outputTypeIdentifier}>(targetURL, options);
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
	buff += `const sourceRef = useRef<EventSource | null>(null);\n`;
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

		const baseUrl = getApiBaseUrl();
		const targetURL = new URL(\`\${baseUrl}/_api/${parentService.name}/${proc.name}\`);
		const stringifiedArguments = JSON.stringify(args);
		const encodedArguments = encodeURIComponent(stringifiedArguments);
		targetURL.searchParams.set("payload", encodedArguments);

		const source = new EventSource(targetURL.toString());
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
			(ev: MessageEvent) => {
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
		sourceRef.current = null;
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

	buff += `(args: z.infer<typeof ${inputIdentifier}>, extraOptions?: ${extraOptionsType}, headers?: Record<string, string>)`;
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

			const baseUrl = getApiBaseUrl();
			const targetURL = new URL(\`\${baseUrl}/_api/${parentService.name}/${proc.name}\`);
			const stringifiedArguments = JSON.stringify(validationResult.data);
			const encodedArguments = encodeURIComponent(stringifiedArguments);
			targetURL.searchParams.set("payload", encodedArguments);

			const response = await fetch(targetURL.toString(), {
				method: "GET",
				headers: headers,
				})

				if (!response.ok) {
					let backendErrorMessage = ""
					try {
						backendErrorMessage = await response.text()
					} catch {
						backendErrorMessage = "No Error message returned from backend"
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
		code: prettified,
	};
}
type SchemaCodes = Array<ServiceCode>;

export async function GenerateMobileCode(schema: APISchema): Promise<SchemaCodes> {
	const out: SchemaCodes = [];

	for (const [key, service] of Object.entries(schema.services)) {
		let finalBuffer: string = ``;

		// Config import for base URL
		finalBuffer += `import { getApiBaseUrl } from "./apiConfig";\n`;

		if (serviceHasMethod(service, "MUTATION")) {
			finalBuffer += `import {useMutation, UseMutationOptions} from "@tanstack/react-query";\n`;
		}
		if (serviceHasMethod(service, "QUERY")) {
			finalBuffer += `import {useQuery, UseQueryOptions} from "@tanstack/react-query";\n`;
		}
		const hasSubscription = serviceHasMethod(service, "SUBSCRIPTION");
		const hasBidirectional = serviceHasMethod(service, "BIDIRECTIONAL");
		if (hasSubscription) {
			const reactImports = ["useEffect", "useRef", "useState"];
			finalBuffer += `import { ${reactImports.join(", ")} } from "react";\n`;
			// React Native SSE polyfill
			finalBuffer += `import EventSource from "react-native-sse";\n`;
		}

		if (hasBidirectional) {
			// Import the websocket library
			finalBuffer += `import {useWebSocket, UseWebSocketReturn, UseWebSocketOptions} from "./useWebsocketMobile";\n`;
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

// Generate the apiConfig helper file content
export function generateApiConfigFile(): ServiceCode {
	const code = `
let apiBaseUrl: string = "";

/**
 * Set the base URL for all API requests.
 * Call this during app initialization with your backend URL.
 *
 * @example
 * // In your App.tsx or initialization file:
 * import { setApiBaseUrl } from "./generated/apiConfig";
 *
 * // For development
 * setApiBaseUrl("http://192.168.1.100:3000");
 *
 * // For production
 * setApiBaseUrl("https://api.yourapp.com");
 */
export function setApiBaseUrl(url: string): void {
	// Remove trailing slash if present
	apiBaseUrl = url.replace(/\\/$/, "");
}

/**
 * Get the current API base URL.
 * Throws an error if the base URL hasn't been configured.
 */
export function getApiBaseUrl(): string {
	if (!apiBaseUrl) {
		throw new Error(
			"API base URL not configured. Call setApiBaseUrl() during app initialization."
		);
	}
	return apiBaseUrl;
}
`;

	return {
		filename: "apiConfig.ts",
		code: code.trim(),
	};
}

// Generate the useWebsocketMobile hook content
export function generateWebSocketMobileHook(): ServiceCode {
	const code = `
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseWebSocketOptions {
	onOpen?: () => void;
	onClose?: () => void;
	onError?: (error: Event) => void;
	reconnect?: boolean;
	reconnectInterval?: number;
	reconnectAttempts?: number;
}

export interface UseWebSocketReturn<TInput, TOutput> {
	sendMessage: (message: TInput) => void;
	lastMessage: TOutput | null;
	messages: TOutput[];
	isConnected: boolean;
	reconnect: () => void;
}

export function useWebSocket<TInput, TOutput>(
	url: string,
	options: UseWebSocketOptions = {}
): UseWebSocketReturn<TInput, TOutput> {
	const {
		onOpen,
		onClose,
		onError,
		reconnect: shouldReconnect = true,
		reconnectInterval = 3000,
		reconnectAttempts = 5,
	} = options;

	const [isConnected, setIsConnected] = useState(false);
	const [lastMessage, setLastMessage] = useState<TOutput | null>(null);
	const [messages, setMessages] = useState<TOutput[]>([]);

	const wsRef = useRef<WebSocket | null>(null);
	const reconnectCountRef = useRef(0);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	const connect = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			return;
		}

		const ws = new WebSocket(url);
		wsRef.current = ws;

		ws.onopen = () => {
			setIsConnected(true);
			reconnectCountRef.current = 0;
			onOpen?.();
		};

		ws.onclose = () => {
			setIsConnected(false);
			onClose?.();

			if (shouldReconnect && reconnectCountRef.current < reconnectAttempts) {
				reconnectTimeoutRef.current = setTimeout(() => {
					reconnectCountRef.current++;
					connect();
				}, reconnectInterval);
			}
		};

		ws.onerror = (error) => {
			onError?.(error);
		};

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data) as TOutput;
				setLastMessage(data);
				setMessages((prev) => [...prev, data]);
			} catch (e) {
				console.error("Failed to parse WebSocket message:", e);
			}
		};
	}, [url, onOpen, onClose, onError, shouldReconnect, reconnectInterval, reconnectAttempts]);

	const sendMessage = useCallback((message: TInput) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(message));
		} else {
			console.warn("WebSocket is not connected. Message not sent.");
		}
	}, []);

	const manualReconnect = useCallback(() => {
		reconnectCountRef.current = 0;
		if (wsRef.current) {
			wsRef.current.close();
		}
		connect();
	}, [connect]);

	useEffect(() => {
		connect();

		return () => {
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
			}
			if (wsRef.current) {
				wsRef.current.close();
			}
		};
	}, [connect]);

	return {
		sendMessage,
		lastMessage,
		messages,
		isConnected,
		reconnect: manualReconnect,
	};
}
`;

	return {
		filename: "useWebsocketMobile.ts",
		code: code.trim(),
	};
}
