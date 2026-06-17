import { useState } from "react";
import type { FormEvent } from "react";
import { login, register } from "../api";
import type { AuthResponse } from "../api";

type AuthMode = "login" | "register";

interface AuthPanelProps {
  error: string;
  onError: (error: unknown) => void;
  onAuthenticated: (response: AuthResponse) => void;
}

export default function AuthPanel({ error, onError, onAuthenticated }: AuthPanelProps) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [form, setForm] = useState({
    username: "",
    display_name: "",
    password: "",
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const response =
        authMode === "login" ? await login(form) : await register(form);
      onAuthenticated(response);
    } catch (err) {
      onError(err);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div>
          <p className="eyebrow">Messenger</p>
          <h1>{authMode === "login" ? "Вход" : "Регистрация"}</h1>
        </div>
        <form className="stack" onSubmit={handleSubmit}>
          <label>
            Логин
            <input
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              minLength={3}
              required
            />
          </label>
          {authMode === "register" && (
            <label>
              Имя профиля
              <input
                value={form.display_name}
                onChange={(event) =>
                  setForm({ ...form, display_name: event.target.value })
                }
                required
              />
            </label>
          )}
          <label>
            Пароль
            <input
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              type="password"
              minLength={6}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit">
            {authMode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>
        <button
          className="link-button"
          type="button"
          onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
        >
          {authMode === "login" ? "Нужна регистрация" : "Уже есть аккаунт"}
        </button>
      </section>
    </main>
  );
}
