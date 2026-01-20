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
	options: UseWebSocketOptions = {},
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
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | number | null>(null);

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
	}, [
		url,
		onOpen,
		onClose,
		onError,
		shouldReconnect,
		reconnectInterval,
		reconnectAttempts,
	]);

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
