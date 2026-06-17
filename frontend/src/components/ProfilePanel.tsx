import { useRef, useState } from "react";
import type { Theme } from "../hooks/useTheme";
import type { User } from "../api";
import { uploadFile } from "../api";
import Avatar from "./Avatar";
import ProfileForm from "./ProfileForm";

interface ProfilePanelProps {
  user: User;
  token: string;
  theme: Theme;
  onThemeToggle: () => void;
  onSave: (profile: { display_name: string; bio: string; avatar_url?: string }) => Promise<void>;
}

export default function ProfilePanel({
  user,
  token,
  theme,
  onThemeToggle,
  onSave,
}: ProfilePanelProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarChange(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadFile(token, file);
      await onSave({
        display_name: user.display_name,
        bio: user.bio,
        avatar_url: uploaded.url,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="side-panel">
      <header className="panel-header">
        <button className="icon-btn" type="button" aria-label="Меню">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 18h18v-2H3v2Zm0-5h18v-2H3v2Zm0-7v2h18V6H3Z" />
          </svg>
        </button>
        <h2>Настройки</h2>
      </header>

      <div className="profile-panel-body">
        <div className="profile-card">
          <button
            className="avatar-upload"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Avatar size="lg" user={user} />
            <span>{uploading ? "Загрузка…" : "Сменить фото"}</span>
          </button>
          <input
            ref={fileInputRef}
            accept="image/*"
            className="hidden-input"
            onChange={(event) => handleAvatarChange(event.target.files?.[0])}
            type="file"
          />
          <h3>{user.display_name}</h3>
          <p>@{user.username}</p>
        </div>

        <div className="settings-block">
          <div className="settings-row">
            <div>
              <strong>Тема</strong>
              <p>{theme === "dark" ? "Тёмная" : "Светлая"}</p>
            </div>
            <button className="pill-btn" onClick={onThemeToggle} type="button">
              Переключить
            </button>
          </div>
        </div>

        <ProfileForm user={user} onSave={onSave} />
      </div>
    </section>
  );
}
