import { useMemo, useState } from "react";
import type { User } from "../api";
import Avatar from "./Avatar";

interface FriendsPanelProps {
  friends: User[];
  users: User[];
  onAddFriend: (friendId: string) => Promise<void>;
  onRemoveFriend: (friendId: string) => Promise<void>;
  onMessageFriend: (friendId: string) => Promise<void>;
}

export default function FriendsPanel({
  friends,
  users,
  onAddFriend,
  onRemoveFriend,
  onMessageFriend,
}: FriendsPanelProps) {
  const [query, setQuery] = useState("");
  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.id)), [friends]);
  const candidates = users.filter((user) => {
    const value = `${user.username} ${user.display_name}`.toLowerCase();
    return value.includes(query.toLowerCase());
  });

  return (
    <section className="side-panel">
      <header className="panel-header">
        <button className="icon-btn" type="button" aria-label="Меню">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 18h18v-2H3v2Zm0-5h18v-2H3v2Zm0-7v2h18V6H3Z" />
          </svg>
        </button>
        <h2>Контакты</h2>
        <span className="panel-badge">{friends.length}</span>
      </header>

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

        <div className="people-list">
          {candidates.map((candidate) => {
            const isFriend = friendIds.has(candidate.id);
            return (
              <article className="person-row" key={candidate.id}>
                <Avatar size="sm" user={candidate} />
                <div className="person-info">
                  <strong>{candidate.display_name}</strong>
                  <small>@{candidate.username}</small>
                </div>
                <div className="person-actions">
                  {isFriend && (
                    <button
                      className="pill-btn"
                      onClick={() => onMessageFriend(candidate.id)}
                      type="button"
                    >
                      Написать
                    </button>
                  )}
                  <button
                    className={isFriend ? "pill-btn danger" : "pill-btn"}
                    onClick={() =>
                      isFriend ? onRemoveFriend(candidate.id) : onAddFriend(candidate.id)
                    }
                    type="button"
                  >
                    {isFriend ? "Удалить" : "Добавить"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
