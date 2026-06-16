import type { Message } from "../api/index";

interface Props {
  messages: Message[];
  currentUsername?: string;
}

export default function ChatMessages({ messages, currentUsername }: Props) {
  return (
    <div className="messages">
      {messages.map((msg, i) => {
        const isMe = currentUsername && msg.sender === currentUsername;
        return (
          <div key={i} className={`message ${isMe ? "me" : ""}`}>
            {msg.sender && <div className="message-sender">{msg.sender}</div>}
            <div className="message-body">{msg.body}</div>
          </div>
        );
      })}
    </div>
  );
}