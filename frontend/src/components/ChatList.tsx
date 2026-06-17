import { useMemo, useState } from "react";
import type { Chat } from "../api";
import Avatar from "./Avatar";
import { getChatAvatarUser, getChatTitle } from "../utils/chat";

interface ChatListProps {
  chats: Chat[];
  activeChatId: string;
  currentUserId: string;
  onlineUsers: Set<string>;           // === НОВОЕ ===
  onSelectChat: (chatId: string) => void;
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

export default function ChatList({
  chats,
  activeChatId,
  currentUserId,
  onlineUsers,                         // === НОВОЕ ===
  onSelectChat,
}: ChatListProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return chats;
    return chats.filter((chat) => {
      const title = getChatTitle(chat, currentUserId);
      const members = chat.members?.map((m) => m.display_name).join(" ") ?? "";
      return `${title} ${members} ${chat.last_body ?? ""}`.toLowerCase().includes(value);
    });
  }, [chats, currentUserId, query]);

  return (
    <div className="chat-list-body">
      <label className="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z" />
        </svg>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск"
        />
      </label>

      {filtered.length === 0 && (
        <p className="panel-empty">Нет чатов. Напишите контакту или создайте группу.</p>
      )}

      <div className="chat-items">
        {filtered.map((chat) => {
          // === НОВОЕ: определяем «собеседника» и его онлайн-статус ===
          const partner =
            !chat.is_group && chat.members
              ? chat.members.find((m) => m.id !== currentUserId) ?? null
              : null;
          const isOnline = partner ? onlineUsers.has(partner.id) : false;

          return (
            <button
              className={`chat-item ${chat.id === activeChatId ? "active" : ""}`}
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              type="button"
            >
              <div className="avatar-wrap">
                <Avatar size="md" user={getChatAvatarUser(chat, currentUserId)} />
                {partner && isOnline && (
                  <span className="online-dot" aria-label="в сети" />
                )}
              </div>
              <span className="chat-item-content">
                <span className="chat-item-top">
                  <strong>{getChatTitle(chat, currentUserId)}</strong>
                  <time>{formatTime(chat.last_at ?? chat.created_at)}</time>
                </span>
                <span className="chat-item-bottom">
                  <span>{chat.last_body || "Нет сообщений"}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
