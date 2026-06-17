import { useEffect, useMemo, useRef, useState } from "react";
import type { Message, User } from "../api";
import { fileURL } from "../utils/files";

interface ChatMessagesProps {
  messages: Message[];
  currentUser: User;
  onEditMessage: (message: Message) => Promise<void>;
  onDeleteMessage: (message: Message) => Promise<void>;
  searchOpen?: boolean;
  onSearchClose?: () => void;
}

export default function ChatMessages({
  messages,
  currentUser,
  onEditMessage,
  onDeleteMessage,
  searchOpen = false,
  onSearchClose,
}: ChatMessagesProps) {
  const [editingId, setEditingId] = useState("");
  const [editValue, setEditValue] = useState("");

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    message: Message;
  } | null>(null);

  // ===== Search state =====
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map());

  const visibleMessages = messages.filter((m) => !m.deleted_at);

  // ID сообщений, в которых есть совпадение
  const matchingMessageIds = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return visibleMessages
      .filter((m) => m.body?.toLowerCase().includes(query))
      .map((m) => m.id);
  }, [visibleMessages, searchQuery]);

  // При изменении запроса — начинаем с первого совпадения
  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery]);

  // При закрытии поиска — чистим состояние
  useEffect(() => {
    if (!searchOpen) {
      setSearchQuery("");
      setActiveMatchIndex(0);
    }
  }, [searchOpen]);

  // Скролл к активному совпадению
  useEffect(() => {
    if (!searchOpen || matchingMessageIds.length === 0) return;
    const id = matchingMessageIds[activeMatchIndex];
    if (!id) return;
    const el = messageRefs.current.get(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeMatchIndex, matchingMessageIds, searchOpen]);

  function goToNext() {
    if (matchingMessageIds.length === 0) return;
    setActiveMatchIndex((i) => (i + 1) % matchingMessageIds.length);
  }

  function goToPrev() {
    if (matchingMessageIds.length === 0) return;
    setActiveMatchIndex((i) =>
      (i - 1 + matchingMessageIds.length) % matchingMessageIds.length
    );
  }

  function closeSearch() {
    setSearchQuery("");
    setActiveMatchIndex(0);
    onSearchClose?.();
  }

  function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Подсветка всех вхождений запроса в тексте
  function highlightText(text: string): React.ReactNode {
    if (!searchQuery.trim() || !text) return text;
    const query = searchQuery;
    const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="search-highlight">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }

  // === Рендер вложений (исправлено: используем fileURL) ===
  function renderAttachment(message: Message) {
    const url = message.attachment_url;
    if (!url) return null;

    // fileURL добавляет API_URL к относительным путям вроде "/uploads/..."
    const fullUrl = fileURL(url);

    if (message.attachment_type === "image") {
      return (
        <a
          className="message-attachment message-attachment-image"
          href={fullUrl}
          target="_blank"
          rel="noreferrer"
        >
          <img
            src={fullUrl}
            alt={message.attachment_name ?? "image"}
            loading="lazy"
          />
        </a>
      );
    }

    return (
      <a
        className="message-attachment message-attachment-file"
        href={fullUrl}
        target="_blank"
        rel="noreferrer"
        download={message.attachment_name}
      >
        <span className="message-attachment-icon" aria-hidden="true">
          📎
        </span>
        <span className="message-attachment-name">
          {message.attachment_name ?? "файл"}
        </span>
      </a>
    );
  }

  function startEdit(message: Message) {
    setEditingId(message.id);
    setEditValue(message.body);
  }

  async function submitEdit(message: Message) {
    const body = editValue.trim();
    if (!body || body === message.body) {
      setEditingId("");
      return;
    }

    await onEditMessage({ ...message, body });
    setEditingId("");
  }

  function handleRightClick(e: React.MouseEvent, message: Message) {
    e.preventDefault();

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      message,
    });
  }

  useEffect(() => {
    function closeMenu() {
      setContextMenu(null);
    }

    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  // Панель поиска (рендерится и при пустом чате)
  const searchBar = searchOpen && (
    <div className="search-bar">
      <input
        autoFocus
        type="text"
        placeholder="Поиск сообщений..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) goToPrev();
            else goToNext();
          } else if (e.key === "Escape") {
            closeSearch();
          }
        }}
      />
      <span className="search-counter">
        {searchQuery.trim()
          ? matchingMessageIds.length > 0
            ? `${activeMatchIndex + 1} / ${matchingMessageIds.length}`
            : "0 / 0"
          : ""}
      </span>
      <button
        type="button"
        className="search-nav-btn"
        onClick={goToPrev}
        disabled={matchingMessageIds.length === 0}
        title="Предыдущее (Shift+Enter)"
      >
        ↑
      </button>
      <button
        type="button"
        className="search-nav-btn"
        onClick={goToNext}
        disabled={matchingMessageIds.length === 0}
        title="Следующее (Enter)"
      >
        ↓
      </button>
      <button
        type="button"
        className="search-close-btn"
        onClick={closeSearch}
        title="Закрыть (Esc)"
      >
        ✕
      </button>
    </div>
  );

  if (visibleMessages.length === 0) {
    return (
      <div className="messages messages-empty">
        {searchBar}
        <p>Нет сообщений. Напишите первым.</p>
      </div>
    );
  }

  return (
    <div className="messages">
      {searchBar}

      {visibleMessages.map((message) => {
        const isMine = message.sender_id === currentUser.id;
        const editing = editingId === message.id;
        const isMatch = matchingMessageIds.includes(message.id);
        const isActiveMatch =
          matchingMessageIds[activeMatchIndex] === message.id;

        return (
          <article
            key={message.id}
            ref={(el) => {
              if (el) messageRefs.current.set(message.id, el);
              else messageRefs.current.delete(message.id);
            }}
            className={`message ${isMine ? "mine" : "theirs"} ${
              isMatch ? "message-match" : ""
            } ${isActiveMatch ? "message-active-match" : ""}`}
            onContextMenu={(e) => handleRightClick(e, message)}
          >
            {!isMine && (
              <strong className="message-author">{message.sender_name}</strong>
            )}

            {editing ? (
              <form
                className="message-edit-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitEdit(message);
                }}
              >
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
                <div className="message-edit-actions">
                  <button className="pill-btn" type="submit">
                    Сохранить
                  </button>
                  <button
                    className="pill-btn danger"
                    type="button"
                    onClick={() => setEditingId("")}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <>
                {message.body && <p>{highlightText(message.body)}</p>}
                {renderAttachment(message)}
              </>
            )}

            <div className="message-meta">
              <time>
                {new Date(message.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          </article>
        );
      })}

      {/* ===== CONTEXT MENU ===== */}
      {contextMenu && (
        <div
          className="message-menu-popover"
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
          }}
        >
          {contextMenu.message.sender_id === currentUser.id && (
            <>
              <button
                onClick={() => {
                  startEdit(contextMenu.message);
                  setContextMenu(null);
                }}
              >
                Редактировать
              </button>

              <button
                className="danger"
                onClick={() => {
                  onDeleteMessage(contextMenu.message);
                  setContextMenu(null);
                }}
              >
                Удалить
              </button>
            </>
          )}

          <button onClick={() => setContextMenu(null)}>Закрыть</button>
        </div>
      )}
    </div>
  );
}
