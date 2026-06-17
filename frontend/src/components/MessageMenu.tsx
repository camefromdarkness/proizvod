import { useEffect, useRef, useState } from "react";
import type { Message } from "../api";

interface MessageMenuProps {
  message: Message;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export default function MessageMenu({ message, canEdit, onEdit, onDelete }: MessageMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!canEdit || message.deleted_at) return null;

  return (
    <div className="message-menu" ref={rootRef}>
      <button
        className="message-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
        aria-label="Действия с сообщением"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2Zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2Z" />
        </svg>
      </button>
      {open && (
        <div className="message-menu-popover">
          <button
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            type="button"
          >
            Изменить
          </button>
          <button
            className="danger"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            type="button"
          >
            Удалить
          </button>
        </div>
      )}
    </div>
  );
}
