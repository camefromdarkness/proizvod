import { useEffect, useState } from "react";
import { connect} from "./api";
import type { Message } from "./api/index";
import ChatMessages from "./components/ChatMessages";
import ChatInput from "./components/ChatInput";
import "./App.css";

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    connect((msg) => setMessages((prev) => [...prev, msg]));
  }, []);

  return (
    <div className="app">
      <h2>Chat</h2>
      <ChatMessages messages={messages} />
      <ChatInput />
    </div>
  );
}