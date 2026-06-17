import { useEffect, useMemo, useRef, useState } from "react";
import {
  addFriend,
  connectChat,
  createChat,
  createDirectChat,
  deleteMessage,
  editMessage,
  fetchOnlineUsers,
  getChats,
  getFriends,
  getMessages,
  removeFriend,
  searchUsers,
  updateProfile,
  uploadFile,
} from "./api";
import type { AuthResponse, Chat, ChatEvent, Message, OutgoingMessage, User } from "./api";
import AuthPanel from "./components/AuthPanel";
import ChatsPanel from "./components/ChatsPanel";
import Conversation from "./components/Conversation";
import FriendsPanel from "./components/FriendsPanel";
import ProfilePanel from "./components/ProfilePanel";
import Sidebar from "./components/Sidebar";
import type { AppTab } from "./components/Sidebar";
import { useTheme } from "./hooks/useTheme";
import "./App.css";

type SocketStatus = "open" | "closed" | "error";

const storedToken = localStorage.getItem("messenger_token") ?? "";
const storedUser = localStorage.getItem("messenger_user");

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [token, setToken] = useState(storedToken);
  const [user, setUser] = useState<User | null>(
    storedUser ? (JSON.parse(storedUser) as User) : null
  );
  const [activeTab, setActiveTab] = useState<AppTab>("chats");
  const [chats, setChats] = useState<Chat[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("closed");

  // === НОВОЕ: множество онлайн-юзеров ===
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(() => new Set());

  const connection = useRef<{ send: (payload: OutgoingMessage) => void; close: () => void } | null>(
    null
  );

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [chats, activeChatId]
  );

  useEffect(() => {
    if (!token || !user) return;
    refreshChats(token).catch(showError);
    getFriends(token).then(setFriends).catch(showError);
    searchUsers(token).then(setUsers).catch(showError);

    // === НОВОЕ: подгружаем список онлайн-юзеров при старте сессии ===
    fetchOnlineUsers(token)
      .then((ids) => setOnlineUsers(new Set(ids)))
      .catch(() => {
        // не критично — обновится через WS-события
      });
  }, [token, user]);

  useEffect(() => {
    if (!token || !activeChatId) return;
    connection.current?.close();
    setMessages([]);
    getMessages(token, activeChatId).then(setMessages).catch(showError);
    connection.current = connectChat(token, activeChatId, handleChatEvent, setSocketStatus);
    return () => connection.current?.close();
  }, [token, activeChatId]);

  async function refreshChats(authToken = token) {
    const nextChats = await getChats(authToken);
    setChats(nextChats);
    setActiveChatId((current) => current || nextChats[0]?.id || "");
  }

  function handleChatEvent(event: ChatEvent) {
    if (event.event === "message") {
      handleIncomingMessage(event.message);
      return;
    }
    if (event.event === "message_updated") {
      setMessages((current) =>
        current.map((item) => (item.id === event.message.id ? event.message : item))
      );
      refreshChats().catch(showError);
      return;
    }
    if (event.event === "message_deleted") {
      setMessages((current) =>
        current.map((item) =>
          item.id === event.message_id
            ? {
                ...item,
                body: "",
                deleted_at: new Date().toISOString(),
                attachment_url: undefined,
                attachment_name: undefined,
                attachment_type: undefined,
              }
            : item
        )
      );
      refreshChats().catch(showError);
      return;
    }

    // === НОВОЕ: обработка presence-событий ===
    if (event.event === "presence" && typeof event.user_id === "string") {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (event.online) {
          next.add(event.user_id);
        } else {
          next.delete(event.user_id);
        }
        return next;
      });
      return;
    }

    if (event.event === "error") {
      setError(event.message);
    }
  }

  function handleIncomingMessage(message: Message) {
    setMessages((current) =>
      current.some((item) => item.id === message.id) ? current : [...current, message]
    );
    refreshChats().catch(showError);
  }

  function showError(err: unknown) {
    setError(err instanceof Error ? err.message : "Что-то пошло не так");
  }

  function handleAuthenticated(response: AuthResponse) {
    setError("");
    setToken(response.token);
    setUser(response.user);
    localStorage.setItem("messenger_token", response.token);
    localStorage.setItem("messenger_user", JSON.stringify(response.user));

    // === НОВОЕ: подгружаем онлайн-сразу после логина ===
    fetchOnlineUsers(response.token)
      .then((ids) => setOnlineUsers(new Set(ids)))
      .catch(() => {
        /* noop */
      });
  }

  async function handleProfileSave(profile: {
    display_name: string;
    bio: string;
    avatar_url?: string;
  }) {
    setError("");
    const response = await updateProfile(token, profile);
    setUser(response.user);
    localStorage.setItem("messenger_user", JSON.stringify(response.user));
    searchUsers(token).then(setUsers).catch(showError);
    getFriends(token).then(setFriends).catch(showError);
    refreshChats().catch(showError);
  }

  async function handleChatCreate(input: { title: string; member_ids: string[] }) {
    setError("");
    const chat = await createChat(token, input);
    setChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    setActiveTab("chats");
  }

  async function handleDirectChat(userId: string) {
    setError("");
    const chat = await createDirectChat(token, userId);
    setChats((current) => {
      const exists = current.some((item) => item.id === chat.id);
      return exists ? current : [chat, ...current];
    });
    setActiveChatId(chat.id);
    setActiveTab("chats");
  }

  async function handleAddFriend(friendId: string) {
    setError("");
    const nextFriends = await addFriend(token, friendId);
    setFriends(nextFriends);
  }

  async function handleRemoveFriend(friendId: string) {
    setError("");
    await removeFriend(token, friendId);
    setFriends((current) => current.filter((friend) => friend.id !== friendId));
  }

  async function sendMessage(payload: OutgoingMessage) {
    connection.current?.send(payload);
  }

  async function handleEditMessage(message: Message) {
    if (!activeChatId) return;
    setError("");
    const updated = await editMessage(token, activeChatId, message.id, message.body);
    setMessages((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    );
  }

  async function handleDeleteMessage(message: Message) {
    if (!activeChatId) return;
    setError("");
    await deleteMessage(token, activeChatId, message.id);
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id
          ? {
              ...item,
              body: "",
              deleted_at: new Date().toISOString(),
              attachment_url: undefined,
              attachment_name: undefined,
              attachment_type: undefined,
            }
          : item
      )
    );
  }

  function logout() {
    localStorage.removeItem("messenger_token");
    localStorage.removeItem("messenger_user");
    connection.current?.close();
    setToken("");
    setUser(null);
    setChats([]);
    setFriends([]);
    setMessages([]);
    setActiveChatId("");
    setActiveTab("chats");
    // === НОВОЕ: чистим онлайн-статусы ===
    setOnlineUsers(new Set());
  }

  if (!token || !user) {
    return (
      <AuthPanel
        error={error}
        onError={showError}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const showConversation = activeTab === "chats" && Boolean(activeChatId);

  return (
    <main className="messenger">
      <Sidebar
        user={user}
        activeTab={activeTab}
        onLogout={logout}
        onTabChange={setActiveTab}
      />

      {activeTab === "chats" && (
        <ChatsPanel
          chats={chats}
          friends={friends}
          currentUserId={user.id}
          activeChatId={activeChatId}
          onlineUsers={onlineUsers}        // === НОВОЕ ===
          onSelectChat={setActiveChatId}
          onRefresh={() => refreshChats().catch(showError)}
          onCreateChat={handleChatCreate}
        />
      )}

      {activeTab === "friends" && (
        <FriendsPanel
          friends={friends}
          users={users}
        //onlineUsers={onlineUsers}        // === НОВОЕ (бонус, если захочешь показывать и тут) ===
          onAddFriend={handleAddFriend}
          onRemoveFriend={handleRemoveFriend}
          onMessageFriend={(friendId) => handleDirectChat(friendId).catch(showError)}
        />
      )}

      {activeTab === "profile" && (
        <ProfilePanel
          user={user}
          token={token}
          theme={theme}
          onThemeToggle={toggleTheme}
          onSave={(profile) => handleProfileSave(profile).catch(showError)}
        />
      )}

      {showConversation ? (
        <Conversation
          chat={activeChat}
          currentUser={user}
          messages={messages}
          socketStatus={socketStatus}
          error={error}
          onlineUsers={onlineUsers}        // === НОВОЕ ===
          onSendMessage={sendMessage}
          onUploadFile={(file) => uploadFile(token, file)}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
        />
      ) : (
        <section className="conversation conversation-empty">
          <div className="empty-state">
            <div className="empty-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3C7.03 3 3 6.58 3 11c0 1.61.52 3.1 1.41 4.34L3 21l5.84-1.28A8.9 8.9 0 0 0 12 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" />
              </svg>
            </div>
            <h1>Messenger</h1>
            <p>
              {activeTab === "friends"
                ? "Нажмите «Написать» у контакта, чтобы открыть личный чат."
                : activeTab === "profile"
                  ? "Настройте профиль, аватар и тему оформления."
                  : "Выберите чат слева или начните переписку с контактом."}
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
