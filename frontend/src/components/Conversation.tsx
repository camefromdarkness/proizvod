import { useEffect, useRef, useState } from "react";
import type { Chat, Message, OutgoingMessage, UploadResult, User } from "../api";
import Avatar from "./Avatar";
import ChatInput from "./ChatInput";
import ChatMessages from "./ChatMessages";
import { getChatAvatarUser, getChatTitle } from "../utils/chat";

type SocketStatus = "open" | "closed" | "error";

interface ConversationProps {
  chat: Chat | null;
  currentUser: User;
  messages: Message[];
  socketStatus: SocketStatus;
  error: string;
  onlineUsers: Set<string>;                                    // === НОВОЕ ===
  onSendMessage: (payload: OutgoingMessage) => Promise<void>;
  onUploadFile: (file: File) => Promise<UploadResult>;
  onEditMessage: (message: Message) => Promise<void>;
  onDeleteMessage: (message: Message) => Promise<void>;
}

export default function Conversation({
  chat,
  currentUser,
  messages,
  socketStatus,
  error,
  onlineUsers,                                                // === НОВОЕ ===
  onSendMessage,
  onUploadFile,
  onEditMessage,
  onDeleteMessage,
}: ConversationProps) {
  const messagesRef = useRef<HTMLDivElement>(null);

  // ===== Search state =====
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setSearchOpen(false);
  }, [chat?.id]);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, chat?.id]);

  if (!chat) {
    return (
      <section className="conversation conversation-empty">
        <div className="empty-state">
          <div className="empty-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 3C7.03 3 3 6.58 3 11c0 1.61.52 3.1 1.41 4.34L3 21l5.84-1.28A8.9 8.9 0 0 0 12 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" />
            </svg>
          </div>
          <h1>Выберите чат</h1>
          <p>Выберите диалог из списка слева или напишите контакту в личку.</p>
        </div>
      </section>
    );
  }

  const title = getChatTitle(chat, currentUser.id);
  const avatarUser = getChatAvatarUser(chat, currentUser.id);

  // === НОВОЕ: определяем «собеседника» и его реальный онлайн-статус ===
  const partner = !chat.is_group && chat.members
    ? chat.members.find((m) => m.id !== currentUser.id) ?? null
    : null;
  const isPartnerOnline = partner ? onlineUsers.has(partner.id) : false;

  // Подпись под именем для лички: «в сети» / «не в сети»
  // Для группы: «N участников»
  const partnerStatusText = chat.is_group
    ? `${chat.members?.length ?? 0} участников`
    : isPartnerOnline
    ? "в сети"
    : "не в сети";

  // Статус сокета — отдельная история (показываем только при проблемах)
  const socketHint =
    socketStatus === "open"
      ? null
      : socketStatus === "error"
      ? "ошибка соединения"
      : "подключение…";

  return (
    <section className="conversation">
      <header className="conversation-head">
        <button className="icon-btn mobile-back" type="button" aria-label="Назад">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z"
            />
          </svg>
        </button>

        {/* === НОВОЕ: аватар с зелёной точкой для лички === */}
        <div className="avatar-wrap">
          <Avatar size="sm" user={avatarUser} />
          {partner && isPartnerOnline && (
            <span className="online-dot" aria-label="в сети" />
          )}
        </div>

        <div className="conversation-head-info">
          <h1>{title}</h1>
          <p>
            <span
              className={
                chat.is_group
                  ? "online-status"
                  : isPartnerOnline
                  ? "online-status online"
                  : "online-status"
              }
            >
              <span className="dot" />
              {partnerStatusText}
            </span>
            {socketHint && (
              <span className="socket-hint"> • {socketHint}</span>
            )}
          </p>
        </div>

        <div className="conversation-head-actions">
          <button
            className={`icon-btn ${searchOpen ? "icon-btn-active" : ""}`}
            type="button"
            aria-label="Поиск"
            aria-pressed={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="messages-wrap" ref={messagesRef}>
        <ChatMessages
          messages={messages}
          currentUser={currentUser}
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
          searchOpen={searchOpen}
          onSearchClose={() => setSearchOpen(false)}
        />
      </div>

      <ChatInput
        disabled={socketStatus !== "open"}
        onSend={onSendMessage}
        onUpload={onUploadFile}
      />
      {error && <p className="toast">{error}</p>}
    </section>
  );
}
