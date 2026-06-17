import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "../api";

interface ProfileFormProps {
  user: User;
  onSave: (profile: { display_name: string; bio: string; avatar_url?: string }) => Promise<void>;
}

export default function ProfileForm({ user, onSave }: ProfileFormProps) {
  const [profile, setProfile] = useState({
    display_name: user.display_name,
    bio: user.bio,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProfile({ display_name: user.display_name, bio: user.bio });
  }, [user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...profile,
        avatar_url: user.avatar_url,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="profile-form" onSubmit={handleSubmit}>
      <label>
        Имя
        <input
          value={profile.display_name}
          onChange={(event) => setProfile({ ...profile, display_name: event.target.value })}
          placeholder="Имя профиля"
        />
      </label>
      <label>
        О себе
        <textarea
          value={profile.bio}
          onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
          placeholder="Расскажите о себе"
          rows={4}
        />
      </label>
      <button className="primary" disabled={saving} type="submit">
        {saving ? "Сохранение…" : "Сохранить"}
      </button>
    </form>
  );
}
