import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { OutgoingMessage, UploadResult } from "../api";
import { fileURL } from "../utils/files";

interface ChatInputProps {
  disabled?: boolean;
  onSend: (payload: OutgoingMessage) => Promise<void>;
  onUpload: (file: File) => Promise<UploadResult>;
}

export default function ChatInput({ disabled, onSend, onUpload }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachment, setAttachment] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const body = value.trim();
    if ((!body && !attachment) || sending || disabled) return;

    setSending(true);
    try {
      await onSend({
        body,
        attachment_url: attachment?.url,
        attachment_name: attachment?.name,
        attachment_type: attachment?.type,
      });
      setValue("");
      setAttachment(null);
    } finally {
      setSending(false);
    }
  }

  async function handleFileSelect(file: File | undefined) {
    if (!file || uploading || disabled) return;
    setUploading(true);
    try {
      const uploaded = await onUpload(file);
      setAttachment(uploaded);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const canSend = Boolean(value.trim() || attachment) && !uploading && !sending && !disabled;

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <input
        ref={fileInputRef}
        accept="image/*,.pdf,.txt,.zip,.doc,.docx"
        className="hidden-input"
        onChange={(event) => handleFileSelect(event.target.files?.[0])}
        type="file"
      />
      <button
        className="icon-btn composer-attach"
        disabled={disabled || uploading}
        onClick={() => fileInputRef.current?.click()}
        type="button"
        aria-label="Вложение"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5Z" />
        </svg>
      </button>

      <div className="composer-field">
        {attachment && (
          <div className="composer-preview">
            {attachment.type === "image" ? (
              <img alt={attachment.name} src={fileURL(attachment.url)} />
            ) : (
              <span>{attachment.name}</span>
            )}
            <button
              className="composer-preview-remove"
              onClick={() => setAttachment(null)}
              type="button"
              aria-label="Убрать вложение"
            >
              ×
            </button>
          </div>
        )}
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={uploading ? "Загрузка файла…" : "Сообщение"}
          disabled={disabled || uploading}
        />
      </div>

      <button
        className="composer-send"
        disabled={!canSend}
        type="submit"
        aria-label="Отправить"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </form>
  );
}
