import { useEffect, useRef, useCallback, useState } from "react";

export enum WebSocketConnectionStatus {
	CONNECTING = "CONNECTING",
	CONNECTED = "CONNECTED",
	DISCONNECTED = "DISCONNECTED",
	ERROR = "ERROR",
}

export interface UseWebSocketOptions {
	/**
	 * Callback fired when a message is received
	 */
	onMessage?: (event: MessageEvent) => void;

	/**
	 * Callback fired when connection opens
	 */
	onOpen?: (event: Event) => void;

	/**
	 * Callback fired when connection closes
	 */
	onClose?: (event: CloseEvent) => void;

	/**
	 * Callback fired on error
	 */
	onError?: (event: Event) => void;

	/**
	 * Enable automatic reconnection
	 * @default true
	 */
	reconnect?: boolean;

	/**
	 * Maximum number of reconnection attempts
	 * @default Infinity
	 */
	maxReconnectAttempts?: number;

	/**
	 * Initial reconnection delay in milliseconds
	 * @default 1000
	 */
	reconnectInterval?: number;

	/**
	 * Maximum reconnection delay in milliseconds
	 * @default 30000
	 */
	maxReconnectInterval?: number;

	/**
	 * Multiplier for exponential backoff
	 * @default 1.5
	 */
	reconnectBackoffMultiplier?: number;

	/**
	 * WebSocket protocols
	 */
	protocols?: string | string[];

	/**
	 * Should connect immediately on mount
	 * @default true
	 */
	connectOnMount?: boolean;
}

export interface UseWebSocketReturn<TInput = any, TOutput = any> {
	/**
	 * Send a message through the WebSocket (client to server)
	 */
	sendMessage: (message: TInput) => void;

	/**
	 * Send a raw string message
	 */
	sendRawMessage: (message: string) => void;

	/**
	 * The last received message (raw MessageEvent)
	 */
	lastRawMessage: MessageEvent | null;

	/**
	 * The last received message parsed as JSON (server to client)
	 */
	lastMessage: TOutput | null;

	messages: Array<TOutput>;

	/**
	 * Current connection status
	 */
	connectionStatus: WebSocketConnectionStatus;

	/**
	 * Manually connect to the WebSocket
	 */
	connect: () => void;

	/**
	 * Manually disconnect from the WebSocket
	 */
	disconnect: () => void;

	/**
	 * Check if currently connected
	 */
	isConnected: boolean;

	/**
	 * Number of reconnection attempts made
	 */
	reconnectAttempts: number;
}

/**
 * Advanced WebSocket hook with reconnection logic and type safety
 *
 * @example
 * ```ts
 * interface ClientMessage {
 *   type: 'subscribe';
 *   channel: string;
 * }
 *
 * interface ServerMessage {
 *   type: 'update';
 *   data: any;
 * }
 *
 * const { sendMessage, lastParsedMessage, connectionStatus, isConnected } =
 *   useWebSocket<ClientMessage, ServerMessage>(
 *     'wss://api.example.com',
 *     {
 *       onMessage: (event) => console.log('Received:', event.data),
 *       reconnect: true,
 *       maxReconnectAttempts: 10,
 *     }
 *   );
 * ```
 */
export function useWebSocket<TInput = any, TOutput = any>(
	url: string | null,
	options: UseWebSocketOptions = {},
): UseWebSocketReturn<TInput, TOutput> {
	const {
		onMessage,
		onOpen,
		onClose,
		onError,
		reconnect = true,
		maxReconnectAttempts = Infinity,
		reconnectInterval = 1000,
		maxReconnectInterval = 30000,
		reconnectBackoffMultiplier = 1.5,
		protocols,
		connectOnMount = true,
	} = options;

	// Use refs to store values that shouldn't trigger re-renders
	const webSocketRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	const reconnectAttemptsRef = useRef(0);
	const currentReconnectIntervalRef = useRef(reconnectInterval);
	const shouldReconnectRef = useRef(reconnect);
	const isManualDisconnectRef = useRef(false);
	const cleanupDelayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const isMountedRef = useRef(false);

	const [messages, setMessages] = useState<Array<TOutput>>([]);

	// Store callbacks in refs to avoid recreating WebSocket on callback changes
	const onMessageRef = useRef(onMessage);
	const onOpenRef = useRef(onOpen);
	const onCloseRef = useRef(onClose);
	const onErrorRef = useRef(onError);

	// Update refs when callbacks change
	useEffect(() => {
		onMessageRef.current = onMessage;
	}, [onMessage]);

	useEffect(() => {
		onOpenRef.current = onOpen;
	}, [onOpen]);

	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	useEffect(() => {
		onErrorRef.current = onError;
	}, [onError]);

	useEffect(() => {
		shouldReconnectRef.current = reconnect;
	}, [reconnect]);

	// State for values that should trigger re-renders
	const [lastRawMessage, setLastMessage] = useState<MessageEvent | null>(null);
	const [lastMessage, setLastParsedMessage] = useState<TOutput | null>(null);
	const [connectionStatus, setConnectionStatus] =
		useState<WebSocketConnectionStatus>(WebSocketConnectionStatus.DISCONNECTED);
	const [reconnectAttempts, setReconnectAttempts] = useState(0);

	// Clear all timers
	const clearTimers = useCallback(() => {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}

		if (cleanupDelayTimeoutRef.current) {
			clearTimeout(cleanupDelayTimeoutRef.current);
			cleanupDelayTimeoutRef.current = null;
		}
	}, []);

	// Cleanup WebSocket
	const cleanup = useCallback(() => {
		clearTimers();

		if (webSocketRef.current) {
			const ws = webSocketRef.current;
			webSocketRef.current = null;

			// Remove all event listeners before closing
			ws.onopen = null;
			ws.onclose = null;
			ws.onerror = null;
			ws.onmessage = null;

			if (
				ws.readyState === WebSocket.OPEN ||
				ws.readyState === WebSocket.CONNECTING
			) {
				ws.close(1000, "Component unmounting or reconnecting");
			}
		}
	}, [clearTimers]);

	// Connect to WebSocket
	const connect = useCallback(() => {
		if (!url) return;

		// Cancel any pending delayed cleanup
		if (cleanupDelayTimeoutRef.current) {
			clearTimeout(cleanupDelayTimeoutRef.current);
			cleanupDelayTimeoutRef.current = null;
		}

		// Prevent multiple simultaneous connections
		if (
			webSocketRef.current?.readyState === WebSocket.CONNECTING ||
			webSocketRef.current?.readyState === WebSocket.OPEN
		) {
			return;
		}

		cleanup();
		isManualDisconnectRef.current = false;
		setConnectionStatus(WebSocketConnectionStatus.CONNECTING);

		try {
			const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);

			webSocketRef.current = ws;

			ws.onopen = (event) => {
				setConnectionStatus(WebSocketConnectionStatus.CONNECTED);
				reconnectAttemptsRef.current = 0;
				currentReconnectIntervalRef.current = reconnectInterval;
				setReconnectAttempts(0);

				onOpenRef.current?.(event);
			};

			ws.onclose = (event) => {
				setConnectionStatus(WebSocketConnectionStatus.DISCONNECTED);
				clearTimers();
				onCloseRef.current?.(event);

				// Attempt reconnection if enabled and not manually disconnected
				if (
					shouldReconnectRef.current &&
					!isManualDisconnectRef.current &&
					reconnectAttemptsRef.current < maxReconnectAttempts
				) {
					reconnectAttemptsRef.current += 1;
					setReconnectAttempts(reconnectAttemptsRef.current);

					const delay = Math.min(
						currentReconnectIntervalRef.current,
						maxReconnectInterval,
					);

					reconnectTimeoutRef.current = setTimeout(() => {
						currentReconnectIntervalRef.current *= reconnectBackoffMultiplier;
						connect();
					}, delay);
				}
			};

			ws.onerror = (event) => {
				setConnectionStatus(WebSocketConnectionStatus.ERROR);
				onErrorRef.current?.(event);
			};

			ws.onmessage = (event) => {
				setLastMessage(event);

				// Attempt to parse JSON data for typed message
				try {
					const parsed =
						typeof event.data === "string"
							? JSON.parse(event.data)
							: event.data;
					setLastParsedMessage(parsed as TOutput);
					setMessages((prev) => [...prev, parsed]);
				} catch (error) {
					// If parsing fails, set parsed message to null
					setLastParsedMessage(null);
				}

				onMessageRef.current?.(event);
			};
		} catch (error) {
			setConnectionStatus(WebSocketConnectionStatus.ERROR);
			console.error("WebSocket connection error:", error);
		}
	}, [
		url,
		protocols,
		reconnectInterval,
		maxReconnectInterval,
		maxReconnectAttempts,
		reconnectBackoffMultiplier,
		cleanup,
		clearTimers,
	]);

	// Disconnect from WebSocket
	const disconnect = useCallback(() => {
		isManualDisconnectRef.current = true;
		cleanup();
		setConnectionStatus(WebSocketConnectionStatus.DISCONNECTED);
		reconnectAttemptsRef.current = 0;
		setReconnectAttempts(0);
		currentReconnectIntervalRef.current = reconnectInterval;
	}, [cleanup, reconnectInterval]);

	// Send typed message
	const sendMessage = useCallback((message: TInput) => {
		if (webSocketRef.current?.readyState === WebSocket.OPEN) {
			const messageStr =
				typeof message === "string" ? message : JSON.stringify(message);
			webSocketRef.current.send(messageStr);
		} else {
			console.warn("WebSocket is not connected. Message not sent:", message);
		}
	}, []);

	// Send raw string message
	const sendRawMessage = useCallback((message: string) => {
		if (webSocketRef.current?.readyState === WebSocket.OPEN) {
			webSocketRef.current.send(message);
		} else {
			console.warn("WebSocket is not connected. Message not sent:", message);
		}
	}, []);

	// Connect on mount if enabled
	useEffect(() => {
		isMountedRef.current = true;

		// Cancel any pending cleanup from previous unmount (Strict Mode case)
		if (cleanupDelayTimeoutRef.current) {
			clearTimeout(cleanupDelayTimeoutRef.current);
			cleanupDelayTimeoutRef.current = null;
		}

		// If connection exists and is open/connecting, reuse it
		if (
			webSocketRef.current &&
			(webSocketRef.current.readyState === WebSocket.OPEN ||
				webSocketRef.current.readyState === WebSocket.CONNECTING)
		) {
			// Connection already exists, just update status if needed
			if (webSocketRef.current.readyState === WebSocket.OPEN) {
				setConnectionStatus(WebSocketConnectionStatus.CONNECTED);
			} else {
				setConnectionStatus(WebSocketConnectionStatus.CONNECTING);
			}
		} else if (connectOnMount && url) {
			// No existing connection, create new one
			connect();
		}

		// Delayed cleanup on unmount to handle Strict Mode
		return () => {
			isMountedRef.current = false;

			// Delay cleanup by 100ms to handle Strict Mode remounting
			cleanupDelayTimeoutRef.current = setTimeout(() => {
				// Only cleanup if component hasn't remounted
				if (!isMountedRef.current) {
					isManualDisconnectRef.current = true;
					cleanup();
				}
			}, 100);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [url, connectOnMount]);

	return {
		sendMessage,
		sendRawMessage,
		messages,
		lastRawMessage,
		lastMessage,
		connectionStatus,
		connect,
		disconnect,
		isConnected: connectionStatus === WebSocketConnectionStatus.CONNECTED,
		reconnectAttempts,
	};
}
