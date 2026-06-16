let socket: WebSocket | null = null;

export interface Message {
  type: number;
  body: string;
  sender?: string;
}

export function connect(
  onMessage: (msg: Message) => void,
  onOpen?: () => void
): () => void {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    console.log("Already connected");
    return () => {};
  }

  socket = new WebSocket("ws://localhost:8080/ws");
  const currentSocket = socket;

  currentSocket.onopen = () => {
    console.log("Connected");
    onOpen?.();
  };
  currentSocket.onmessage = (event) => onMessage(JSON.parse(event.data) as Message);
  currentSocket.onclose = () => {
    console.log("Disconnected");
    if (socket === currentSocket) {
      socket = null;
    }
  };
  currentSocket.onerror = (err) => console.log("Error:", err);

  return () => {
    currentSocket.onopen = null;
    currentSocket.onmessage = null;
    currentSocket.onerror = null;

    if (
      currentSocket.readyState === WebSocket.OPEN ||
      currentSocket.readyState === WebSocket.CONNECTING
    ) {
      currentSocket.close();
    }

    if (socket === currentSocket) {
      socket = null;
    }
  };
}

export function sendMsg(body: string, sender?: string): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error("Socket not connected");
    return;
  }
  socket.send(JSON.stringify({ type: 1, body, sender }));
}
