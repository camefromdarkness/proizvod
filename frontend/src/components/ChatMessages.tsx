import type { Message } from "../api/index";

interface Props {
  messages: Message[];
}

export default function ChatMessages({ messages }: Props) {
  return (
    <div className="messages">
      {messages.map((msg, i) => (
        <div key={i} className="message">{msg.body}</div>
      ))}
    </div>
  );
}