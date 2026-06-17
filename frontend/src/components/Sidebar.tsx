import type { ReactNode } from "react";
import type { User } from "../api";
import Avatar from "./Avatar";

export type AppTab = "chats" | "friends" | "profile";

interface SidebarProps {
  user: User;
  activeTab: AppTab;
  onLogout: () => void;
  onTabChange: (tab: AppTab) => void;
}

function IconChats() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3C7.03 3 3 6.58 3 11c0 1.61.52 3.1 1.41 4.34L3 21l5.84-1.28A8.9 8.9 0 0 0 12 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" />
    </svg>
  );
}

function IconFriends() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3ZM8 11c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.07 7.07 0 0 0-1.63-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.56-1.64.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.3.59.22l2.39-.96c.5.38 1.05.7 1.64.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.64-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5ZM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5Z" />
    </svg>
  );
}

export default function Sidebar({
  user,
  activeTab,
  onLogout,
  onTabChange,
}: SidebarProps) {
  const tabs: { id: AppTab; label: string; icon: ReactNode }[] = [
    { id: "chats", label: "Чаты", icon: <IconChats /> },
    { id: "friends", label: "Контакты", icon: <IconFriends /> },
    { id: "profile", label: "Настройки", icon: <IconSettings /> },
  ];

  return (
    <nav className="nav-sidebar" aria-label="Навигация">
      <button
        className="nav-avatar-btn"
        onClick={() => onTabChange("profile")}
        title={user.display_name}
        type="button"
      >
        <Avatar size="sm" user={user} />
      </button>

      <div className="nav-items">
        {tabs.map((tab) => (
          <button
            className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            title={tab.label}
            type="button"
          >
            {tab.icon}
          </button>
        ))}
      </div>

      <button className="nav-item nav-logout" onClick={onLogout} title="Выйти" type="button">
        <IconLogout />
      </button>
    </nav>
  );
}
