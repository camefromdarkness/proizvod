import { useState } from "react";
import type { Chat, User } from "../api";
import ChatList from "./ChatList";
import CreateChatForm from "./CreateChatForm";

interface ChatsPanelProps {
  chats: Chat[];
  friends: User[];
  currentUserId: string;
  activeChatId: string;
  onlineUsers: Set<string>;           // === НОВОЕ ===
  onSelectChat: (chatId: string) => void;
  onRefresh: () => void;
  onCreateChat: (input: { title: string; member_ids: string[] }) => Promise<void>;
}

export default function ChatsPanel({
  chats,
  friends,
  currentUserId,
  activeChatId,
  onlineUsers,                         // === НОВОЕ ===
  onSelectChat,
  onRefresh,
  onCreateChat,
}: ChatsPanelProps) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <section className="side-panel">
      <header className="panel-header">
        <button className="icon-btn" type="button" aria-label="Меню">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 18h18v-2H3v2Zm0-5h18v-2H3v2Zm0-7v2h18V6H3Z" />
          </svg>
        </button>
        <h2>Чаты</h2>
        <div className="panel-header-actions">
          <button className="icon-btn" onClick={onRefresh} type="button" title="Обновить">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z" />
            </svg>
          </button>
          <button
            className={`icon-btn ${showCreate ? "active" : ""}`}
            onClick={() => setShowCreate((value) => !value)}
            type="button"
            title="Новая группа"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" />
            </svg>
          </button>
        </div>
      </header>

      {showCreate && (
        <div className="panel-overlay-form">
          <CreateChatForm
            users={friends}
            onCreate={async (input) => {
              await onCreateChat(input);
              setShowCreate(false);
            }}
          />
        </div>
      )}

      <ChatList
        chats={chats}
        activeChatId={activeChatId}
        currentUserId={currentUserId}
        onlineUsers={onlineUsers}        // === НОВОЕ ===
        onSelectChat={onSelectChat}
      />
    </section>
  );
}
