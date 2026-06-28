# Messenger Backend

Backend - Go-сервис для мессенджера. Он предоставляет REST API, WebSocket для сообщений в реальном времени, JWT-авторизацию, загрузку вложений и работу с PostgreSQL.

## Стек

- Go 1.25
- net/http
- Gorilla WebSocket
- pgx / pgxpool
- PostgreSQL
- JWT
- bcrypt
- UUID

## Основные файлы

```text
backend/
├── main.go              # API, WebSocket, авторизация, миграции, handlers
├── go.mod
├── go.sum
└── pkg/websocket/       # старый/экспериментальный пакет WebSocket
```

Сейчас фактическая логика приложения находится в `main.go`. Пакет `pkg/websocket` не подключен к основному серверу.

## Локальный запуск

1. Запустите PostgreSQL из корня проекта:

```bash
docker compose up -d
```

2. Запустите backend:

```bash
go run .
```

По умолчанию сервер стартует на `http://localhost:8080`.

## Переменные окружения

```env
DATABASE_URL=postgres://postgres:3575555@localhost:5432/messenger?sslmode=disable
JWT_SECRET=dev-secret-change-me
HTTP_ADDR=:8080
UPLOAD_DIR=uploads
```

Если переменные не заданы, используются значения по умолчанию из `main.go`.

## База данных

При старте backend:

1. проверяет подключение к PostgreSQL;
2. при необходимости создает базу `messenger`;
3. выполняет SQL-миграции из функции `migrate`.

Таблицы:

| Таблица | Назначение |
| --- | --- |
| `users` | пользователи, профиль, хэш пароля, аватар |
| `chats` | личные и групповые чаты |
| `chat_members` | участники чатов |
| `messages` | сообщения, вложения, дата редактирования и удаления |
| `friends` | контакты пользователя |

## REST API

| Метод | URL | Авторизация | Назначение |
| --- | --- | --- | --- |
| POST | `/api/register` | нет | регистрация |
| POST | `/api/login` | нет | вход |
| GET | `/api/me` | да | текущий пользователь |
| PATCH | `/api/profile` | да | обновление профиля |
| POST | `/api/upload` | да | загрузка файла |
| GET | `/api/users?q=` | да | поиск пользователей |
| GET | `/api/users/online` | да | пользователи онлайн |
| GET | `/api/friends` | да | список друзей |
| POST | `/api/friends` | да | добавить друга |
| DELETE | `/api/friends/{id}` | да | удалить друга |
| GET | `/api/chats` | да | список чатов пользователя |
| POST | `/api/chats` | да | создать групповой чат |
| POST | `/api/chats/direct` | да | создать или открыть личный чат |
| GET | `/api/chats/{id}/messages` | да | история сообщений |
| POST | `/api/chats/{id}/messages` | да | создать сообщение |
| PATCH | `/api/chats/{id}/messages/{messageId}` | да | редактировать свое сообщение |
| DELETE | `/api/chats/{id}/messages/{messageId}` | да | удалить свое сообщение |

## WebSocket

Подключение:

```text
GET /ws?chat_id={chatId}&token={jwt}
```

События от сервера:

```json
{ "event": "message", "message": {} }
{ "event": "message_updated", "message": {} }
{ "event": "message_deleted", "message_id": "..." }
{ "event": "presence", "user_id": "...", "online": true }
{ "event": "error", "message": "..." }
```

Сообщение от клиента:

```json
{
  "body": "Привет",
  "attachment_url": "/uploads/file.png",
  "attachment_name": "file.png",
  "attachment_type": "image"
}
```

## Проверка

```bash
go test ./...
go run .
```

Для ручной проверки нужны минимум два пользователя: так можно проверить друзей, личный чат, групповой чат, WebSocket-сообщения и онлайн-статус.

## Что улучшить

- удалить `chat.exe` из репозитория и добавить правило в `.gitignore`;
- вынести SQL-миграции из `main.go` в отдельную папку;
- добавить автоматические тесты handlers и работы с БД;
- ограничить CORS для production-домена;
- заменить `JWT_SECRET` по умолчанию на обязательную переменную в production;
- добавить Swagger/OpenAPI или отдельный файл с примерами API.
