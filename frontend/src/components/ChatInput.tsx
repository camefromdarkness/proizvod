import { useState } from "react";
import { sendMsg } from "../api";

export default function ChatInput() {
  const [value, setValue] = useState<string>("");

  const handleSend = (): void => {
    if (!value.trim()) return;
    sendMsg(value);
    setValue("");
  };

  return (
    <div className="input-area">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
        placeholder="Type a message..."
      />
      <button onClick={handleSend}>Send</button>
    </div>
  );
}