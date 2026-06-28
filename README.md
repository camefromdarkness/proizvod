# Messenger

Messenger - учебный fullstack-проект для обмена сообщениями в реальном времени. Пользователь может зарегистрироваться, войти в аккаунт, настроить профиль, добавлять контакты, создавать личные и групповые чаты, отправлять текстовые сообщения и вложения. Backend хранит данные в PostgreSQL, а новые сообщения и статусы присутствия доставляются через WebSocket.

> Перед сдачей замените плейсхолдеры `TODO` на реальные ссылки и данные.

## Стек

- Frontend: React, TypeScript, Vite, CSS.
- Backend: Go, net/http, Gorilla WebSocket, JWT, bcrypt, pgx.
- Database: PostgreSQL 16.
- Infrastructure: Docker Compose для локальной базы данных.

## Возможности

- регистрация и вход по JWT;
- редактирование профиля, био и аватара;
- поиск пользователей и управление списком друзей;
- создание личных диалогов и групповых чатов;
- отправка сообщений через WebSocket;
- редактирование и удаление своих сообщений;
- загрузка вложений: изображения, PDF, TXT, ZIP, DOC, DOCX;
- отображение онлайн-статуса пользователей;
- светлая и темная тема интерфейса.

## Структура проекта

```text
.
├── backend/              # Go API, WebSocket, миграции БД в коде
├── frontend/             # React + TypeScript клиент
└── docker-compose.yml    # PostgreSQL для локального запуска
```

## Быстрый запуск

Требования: Docker, Go, Node.js, npm.

1. Запустите PostgreSQL:

```bash
docker compose up -d
```

2. Запустите backend:

```bash
cd backend
go run .
```

Backend будет доступен на `http://localhost:8080`.

3. Запустите frontend в отдельном терминале:

```bash
cd frontend
npm install
npm run dev
```

Frontend будет доступен на адресе, который покажет Vite, обычно `http://localhost:5173`.

## Переменные окружения

Backend:

```env
DATABASE_URL=postgres://postgres:3575555@localhost:5432/messenger?sslmode=disable
JWT_SECRET=dev-secret-change-me
HTTP_ADDR=:8080
UPLOAD_DIR=uploads
```

Frontend:

```env
VITE_API_URL=http://localhost:8080
```

## API

Основные HTTP endpoints:

| Метод | URL | Назначение |
| --- | --- | --- |
| POST | `/api/register` | регистрация пользователя |
| POST | `/api/login` | вход и получение JWT |
| GET | `/api/me` | получение текущего пользователя |
| PATCH | `/api/profile` | обновление профиля |
| POST | `/api/upload` | загрузка вложения |
| GET | `/api/users?q=` | поиск пользователей |
| GET | `/api/users/online` | список пользователей онлайн |
| GET/POST | `/api/friends` | список друзей / добавление друга |
| DELETE | `/api/friends/{id}` | удаление друга |
| GET/POST | `/api/chats` | список чатов / создание группового чата |
| POST | `/api/chats/direct` | создание или открытие личного чата |
| GET/POST | `/api/chats/{id}/messages` | список сообщений / отправка сообщения |
| PATCH/DELETE | `/api/chats/{id}/messages/{messageId}` | редактирование / удаление сообщения |
| GET | `/ws?chat_id={id}&token={jwt}` | WebSocket-подключение к чату |

## Модель данных

Основные таблицы:

- `users` - учетные записи, профиль, хэш пароля, аватар.
- `chats` - личные и групповые чаты.
- `chat_members` - связь пользователей с чатами.
- `messages` - сообщения, вложения, timestamps редактирования и удаления.
- `friends` - список контактов пользователя.

Связи:

- `users 1:N chats` через `chats.created_by`;
- `users M:N chats` через `chat_members`;
- `chats 1:N messages`;
- `users 1:N messages`;
- `users M:N users` через `friends`.

## Ссылки для сдачи

- GitHub: TODO
- Деплой frontend: TODO
- Деплой backend/API: TODO
- Демонстрация работы: TODO
- Code Climate badge: TODO

Для оценки на 4/5 по гайду нужно добавить в README бейдж Code Climate с оценкой A или B.

## Тестовые данные

В проекте есть регистрация, поэтому проверяющим лучше дать заранее созданные аккаунты:

```text
login: TODO
password: TODO

login: TODO
password: TODO
```

Создайте минимум два аккаунта, чтобы можно было проверить личный чат, друзей, онлайн-статус и обмен сообщениями.

## Что еще доделать перед сдачей

- Опубликовать репозиторий на GitHub и вставить ссылку в этот README и отчет.
- Настроить деплой frontend и backend, проверить работу в режиме инкогнито.
- Добавить бейдж Code Climate в корневой README.
- Записать GIF/видео до 2 минут: регистрация/вход, добавление друга, создание чата, отправка сообщения и вложения.
- Создать тестовые аккаунты и указать логины/пароли в отчете.
- Удалить из репозитория бинарный файл `backend/chat.exe`, если он не нужен для запуска.
- Убрать дублирующий интерфейс `OnlineUsersResponse` в `frontend/src/api/index.ts`.
- Проверить кодировку русских комментариев/строк в редакторе и при необходимости привести файлы к UTF-8.
- При желании вынести SQL-миграции из `main.go` в отдельные файлы, чтобы архитектура выглядела аккуратнее.

## Документация по частям проекта

- [Frontend README](./frontend/README.md)
- [Backend README](./backend/README.md)
