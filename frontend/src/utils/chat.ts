import type { Chat, User } from "../api";

export function getChatPeer(chat: Chat, currentUserId: string): User | null {
  if (chat.is_group) return null;
  return chat.members?.find((member) => member.id !== currentUserId) ?? null;
}

export function getChatTitle(chat: Chat, currentUserId: string): string {
  const peer = getChatPeer(chat, currentUserId);
  return peer?.display_name || chat.title;
}

export function getChatAvatarUser(chat: Chat, currentUserId: string): Pick<User, "id" | "display_name" | "avatar_url"> {
  const peer = getChatPeer(chat, currentUserId);
  if (peer) {
    return peer;
  }
  return { id: chat.id, display_name: chat.title };
}
