const socket = new WebSocket("ws://localhost:8080/ws");

export interface Message {
  type: number;
  body: string;
}

export function connect(onMessage: (msg: Message) => void): void {
  socket.onopen = () => console.log("Connected");
  socket.onmessage = (event) => onMessage(JSON.parse(event.data) as Message);
  socket.onclose = () => console.log("Disconnected");
  socket.onerror = (err) => console.log("Error:", err);
}

export function sendMsg(body: string): void {
  socket.send(JSON.stringify({ type: 1, body }));
}