import { useEffect, useState } from "react";
import { connect } from "./api";
import type { Message } from "./api/index";
import ChatMessages from "./components/ChatMessages";
import ChatInput from "./components/ChatInput";
import "./App.css";

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [username, setUsername] = useState<string>("");
  const [tempName, setTempName] = useState<string>("");
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    if (!username) return;

    setIsConnected(false);
    return connect(
      (msg) => {
        setMessages((prev) => [...prev, msg]);
        // Если получили системное сообщение про второго пользователя
        if (msg.body.includes("Второй пользователь присоединился")) {
          setIsWaiting(false);
        } else if (msg.body.includes("Ожидание")) {
          setIsWaiting(true);
        }
      },
      () => setIsConnected(true)
    );
  }, [username]);

  const handleJoin = () => {
    if (!tempName.trim()) return;
    setUsername(tempName.trim());
  };

  if (!username) {
    return (
      <div className="app">
        <div className="username-overlay">
          <h2>Добро пожаловать в анонимный чат</h2>
          <p>Введите своё имя (опционально)</p>
          <input
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="Ваше имя (или просто нажмите Присоединиться)"
          />
          <button onClick={handleJoin}>Присоединиться</button>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="app">
        <div className="connecting">
          <h2>Подключение...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <h2>Анонимный чат</h2>
        <div className="status">
          {isWaiting ? (
            <span className="status-waiting">⏳ Ожидание второго пользователя...</span>
          ) : (
            <span className="status-ready">✅ Оба пользователя в чате</span>
          )}
        </div>
      </div>
      <ChatMessages messages={messages} currentUsername={username} />
      <ChatInput username={username} disabled={isWaiting} />
    </div>
  );
}
