const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
const WS_URL = API_URL.replace(/^http/, "ws");

export interface User {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url?: string;
  created_at: string;
}

export interface Chat {
  id: string;
  title: string;
  is_group: boolean;
  created_by: string;
  created_at: string;
  members?: User[];
  last_body?: string;
  last_at?: string;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_username: string;
  sender_name: string;
  body: string;
  attachment_url?: string;
  attachment_name?: string;
  attachment_type?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface UploadResult {
  url: string;
  name: string;
  type: string;
  mime: string;
}

export type ChatEvent =
  | { event: "message"; message: Message }
  | { event: "message_updated"; message: Message }
  | { event: "message_deleted"; message_id: string }
  | { event: "error"; message: string }
  | { event: "presence"; user_id: string; online: boolean };


export type OutgoingMessage = {
  body: string;
  attachment_url?: string;
  attachment_name?: string;
  attachment_type?: string;
};

export async function register(input: {
  username: string;
  display_name: string;
  password: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function login(input: {
  username: string;
  password: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProfile(
  token: string,
  input: { display_name: string; bio: string; avatar_url?: string }
): Promise<{ user: User }> {
  return request<{ user: User }>("/api/profile", {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export async function uploadFile(token: string, file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_URL}/api/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? "Upload failed");
  }
  return data as UploadResult;
}

export async function searchUsers(token: string, q = ""): Promise<User[]> {
  const response = await request<{ users: User[] }>(
    `/api/users?q=${encodeURIComponent(q)}`,
    { token }
  );
  return response.users;
}

export async function getFriends(token: string): Promise<User[]> {
  const response = await request<{ friends: User[] }>("/api/friends", { token });
  return response.friends;
}

export async function addFriend(token: string, friendId: string): Promise<User[]> {
  const response = await request<{ friends: User[] }>("/api/friends", {
    method: "POST",
    token,
    body: JSON.stringify({ friend_id: friendId }),
  });
  return response.friends;
}

export async function removeFriend(token: string, friendId: string): Promise<void> {
  await request<void>(`/api/friends/${friendId}`, {
    method: "DELETE",
    token,
  });
}

export async function getChats(token: string): Promise<Chat[]> {
  const response = await request<{ chats: Chat[] }>("/api/chats", { token });
  return response.chats;
}

export async function createChat(
  token: string,
  input: { title: string; member_ids: string[] }
): Promise<Chat> {
  const response = await request<{ chat: Chat }>("/api/chats", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
  return response.chat;
}

export async function createDirectChat(token: string, userId: string): Promise<Chat> {
  const response = await request<{ chat: Chat }>("/api/chats/direct", {
    method: "POST",
    token,
    body: JSON.stringify({ user_id: userId }),
  });
  return response.chat;
}

export async function getMessages(token: string, chatId: string): Promise<Message[]> {
  const response = await request<{ messages: Message[] }>(
    `/api/chats/${chatId}/messages`,
    { token }
  );
  return response.messages;
}

export async function sendMessage(
  token: string,
  chatId: string,
  payload: OutgoingMessage
): Promise<Message> {
  const response = await request<{ message: Message }>(`/api/chats/${chatId}/messages`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
  return response.message;
}

export async function editMessage(
  token: string,
  chatId: string,
  messageId: string,
  body: string
): Promise<Message> {
  const response = await request<{ message: Message }>(
    `/api/chats/${chatId}/messages/${messageId}`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify({ body }),
    }
  );
  return response.message;
}

export async function deleteMessage(
  token: string,
  chatId: string,
  messageId: string
): Promise<void> {
  await request<void>(`/api/chats/${chatId}/messages/${messageId}`, {
    method: "DELETE",
    token,
  });
}

export function connectChat(
  token: string,
  chatId: string,
  onEvent: (event: ChatEvent) => void,
  onStatus?: (status: "open" | "closed" | "error") => void
): { send: (payload: OutgoingMessage) => void; close: () => void } {
  const socket = new WebSocket(
    `${WS_URL}/ws?chat_id=${encodeURIComponent(chatId)}&token=${encodeURIComponent(token)}`
  );

  socket.onopen = () => onStatus?.("open");
  socket.onclose = () => onStatus?.("closed");
  socket.onerror = () => onStatus?.("error");
  socket.onmessage = (event) => {
    onEvent(JSON.parse(event.data) as ChatEvent);
  };

  return {
    send(payload: OutgoingMessage) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    },
    close() {
      socket.close();
    },
  };
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 204) {
    return undefined as T;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data as T;
}

export interface OnlineUsersResponse {
  online: string[];
}

export interface OnlineUsersResponse {
  online: string[];
}

export async function fetchOnlineUsers(token: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/api/users/online`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data: OnlineUsersResponse = await res.json();
  return data.online ?? [];
}
