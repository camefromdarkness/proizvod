import { useState } from "react";
import { sendMsg } from "../api";

interface Props {
  username: string;
  disabled?: boolean;
}

export default function ChatInput({ username, disabled = false }: Props) {
  const [value, setValue] = useState<string>("");

  const handleSend = (): void => {
    if (!value.trim() || disabled) return;
    sendMsg(value, username);
    setValue("");
  };

  return (
    <div className="input-area">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
        placeholder={disabled ? "Ожидание второго пользователя..." : "Напишите сообщение..."}
        disabled={disabled}
      />
      <button onClick={handleSend} disabled={disabled}>Отправить</button>
    </div>
  );
}