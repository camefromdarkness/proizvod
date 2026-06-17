import { useState } from "react";
import type { FormEvent } from "react";
import type { User } from "../api";
import Avatar from "./Avatar";

interface CreateChatFormProps {
  users: User[];
  onCreate: (input: { title: string; member_ids: string[] }) => Promise<void>;
}

export default function CreateChatForm({ users, onCreate }: CreateChatFormProps) {
  const [title, setTitle] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      await onCreate({ title, member_ids: selectedMembers });
      setTitle("");
      setSelectedMembers([]);
    } finally {
      setCreating(false);
    }
  }

  return (
    <form className="create-chat" onSubmit={handleSubmit}>
      <h3>Новая группа</h3>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Название группы"
        required
      />
      <p className="create-chat-hint">Выберите участников</p>
      <div className="user-list">
        {users.length === 0 && <p className="panel-empty">Добавьте друзей в контактах.</p>}
        {users.map((candidate) => (
          <label className="user-row" key={candidate.id}>
            <input
              type="checkbox"
              checked={selectedMembers.includes(candidate.id)}
              onChange={(event) => {
                setSelectedMembers((current) =>
                  event.target.checked
                    ? [...current, candidate.id]
                    : current.filter((id) => id !== candidate.id)
                );
              }}
            />
            <Avatar size="xs" user={candidate} />
            <span className="user-row-text">
              {candidate.display_name}
              <small>@{candidate.username}</small>
            </span>
          </label>
        ))}
      </div>
      <button className="primary" disabled={creating || !title.trim()} type="submit">
        {creating ? "Создание…" : "Создать"}
      </button>
    </form>
  );
}
