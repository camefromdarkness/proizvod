package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type app struct {
	db        *pgxpool.Pool
	jwtSecret []byte
	hub       *hub
	uploadDir string
}

type contextKey string

const userContextKey contextKey = "user"

type userClaims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

type user struct {
	ID          string    `json:"id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	Bio         string    `json:"bio"`
	AvatarURL   string    `json:"avatar_url,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type chat struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	IsGroup   bool      `json:"is_group"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	Members   []user    `json:"members,omitempty"`
	LastBody  string    `json:"last_body,omitempty"`
	LastAt    time.Time `json:"last_at,omitempty"`
}

type message struct {
	ID             string     `json:"id"`
	ChatID         string     `json:"chat_id"`
	SenderID       string     `json:"sender_id"`
	SenderUsername string     `json:"sender_username"`
	SenderName     string     `json:"sender_name"`
	Body           string     `json:"body"`
	AttachmentURL  string     `json:"attachment_url"`  // было: ,omitempty
	AttachmentName string     `json:"attachment_name"` // было: ,omitempty
	AttachmentType string     `json:"attachment_type"` // было: ,omitempty
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty"`
}

type wsClient struct {
	userID string
	chatID string
	conn   *websocket.Conn
}

// ============================================================
// HUB — расширенный: поддержка userID-индекса и онлайн-статуса
// ============================================================
type hub struct {
	mu          sync.RWMutex
	clients     map[string]map[*wsClient]bool // chatID -> clients
	userClients map[string]map[*wsClient]bool // userID -> clients (по всем чатам)
	onlineSet   map[string]bool               // userID -> online (true, если есть хотя бы 1 сокет)
}

func newHub() *hub {
	return &hub{
		clients:     make(map[string]map[*wsClient]bool),
		userClients: make(map[string]map[*wsClient]bool),
		onlineSet:   make(map[string]bool),
	}
}

func (h *hub) add(client *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// chatID-индекс
	if h.clients[client.chatID] == nil {
		h.clients[client.chatID] = make(map[*wsClient]bool)
	}
	h.clients[client.chatID][client] = true

	// userID-индекс
	if h.userClients[client.userID] == nil {
		h.userClients[client.userID] = make(map[*wsClient]bool)
	}
	h.userClients[client.userID][client] = true

	// юзер онлайн (хотя бы один сокет открыт)
	h.onlineSet[client.userID] = true
}

func (h *hub) remove(client *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// chatID-индекс
	if h.clients[client.chatID] != nil {
		delete(h.clients[client.chatID], client)
		if len(h.clients[client.chatID]) == 0 {
			delete(h.clients, client.chatID)
		}
	}

	// userID-индекс
	if h.userClients[client.userID] != nil {
		delete(h.userClients[client.userID], client)
		if len(h.userClients[client.userID]) == 0 {
			delete(h.userClients, client.userID)
			delete(h.onlineSet, client.userID) // последний сокет закрылся
		}
	}
}

func (h *hub) broadcast(chatID string, payload any) {
	h.mu.RLock()
	recipients := make([]*wsClient, 0, len(h.clients[chatID]))
	for client := range h.clients[chatID] {
		recipients = append(recipients, client)
	}
	h.mu.RUnlock()

	for _, client := range recipients {
		if err := client.conn.WriteJSON(payload); err != nil {
			client.conn.Close()
			h.remove(client)
		}
	}
}

func (h *hub) isOnline(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.onlineSet[userID]
}

func (h *hub) hasOpenSockets(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.userClients[userID]
	return ok
}

func (h *hub) onlineUserIDs() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	ids := make([]string, 0, len(h.onlineSet))
	for id := range h.onlineSet {
		ids = append(ids, id)
	}
	return ids
}

// ============================================================

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func main() {
	ctx := context.Background()
	databaseURL := env("DATABASE_URL", "postgres://postgres:3575555@localhost:5432/messenger?sslmode=disable")
	if err := ensureDatabase(ctx, databaseURL); err != nil {
		log.Fatal(err)
	}
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		log.Fatalf("postgres connection failed: %v", err)
	}
	if err := migrate(ctx, db); err != nil {
		log.Fatal(err)
	}

	uploadDir := env("UPLOAD_DIR", "uploads")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		log.Fatal(err)
	}

	application := &app{
		db:        db,
		jwtSecret: []byte(env("JWT_SECRET", "dev-secret-change-me")),
		hub:       newHub(),
		uploadDir: uploadDir,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/register", application.withCORS(application.register))
	mux.HandleFunc("/api/login", application.withCORS(application.login))
	mux.HandleFunc("/api/me", application.withCORS(application.auth(application.me)))
	mux.HandleFunc("/api/profile", application.withCORS(application.auth(application.updateProfile)))
	mux.HandleFunc("/api/upload", application.withCORS(application.auth(application.uploadFile)))
	mux.HandleFunc("/api/users", application.withCORS(application.auth(application.searchUsers)))
	mux.HandleFunc("/api/users/online", application.withCORS(application.auth(application.onlineUsers)))
	mux.HandleFunc("/api/friends", application.withCORS(application.auth(application.friends)))
	mux.HandleFunc("/api/friends/", application.withCORS(application.auth(application.friendRoutes)))
	mux.HandleFunc("/api/chats/direct", application.withCORS(application.auth(application.createDirectChat)))
	mux.HandleFunc("/api/chats", application.withCORS(application.auth(application.chats)))
	mux.HandleFunc("/api/chats/", application.withCORS(application.auth(application.chatRoutes)))
	mux.Handle("/uploads/", application.withCORSHandler(http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir)))))
	mux.HandleFunc("/ws", application.serveWS)

	addr := env("HTTP_ADDR", ":8080")
	log.Printf("messenger backend listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func ensureDatabase(ctx context.Context, databaseURL string) error {
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return err
	}
	dbName := strings.TrimPrefix(parsed.Path, "/")
	if dbName == "" || dbName == "postgres" {
		return nil
	}
	if !regexp.MustCompile(`^[a-zA-Z0-9_]+$`).MatchString(dbName) {
		return errors.New("database name may contain only letters, digits and underscore")
	}

	parsed.Path = "/postgres"
	maintenanceDB, err := pgxpool.New(ctx, parsed.String())
	if err != nil {
		return err
	}
	defer maintenanceDB.Close()

	var exists bool
	if err := maintenanceDB.QueryRow(ctx, `select exists(select 1 from pg_database where datname = $1)`, dbName).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	_, err = maintenanceDB.Exec(ctx, `create database "`+dbName+`"`)
	return err
}

func migrate(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
create table if not exists users (
	id uuid primary key,
	username text not null unique,
	display_name text not null,
	bio text not null default '',
	password_hash text not null,
	created_at timestamptz not null default now()
);

create table if not exists chats (
	id uuid primary key,
	title text not null,
	is_group boolean not null default true,
	created_by uuid not null references users(id) on delete cascade,
	created_at timestamptz not null default now()
);

create table if not exists chat_members (
	chat_id uuid not null references chats(id) on delete cascade,
	user_id uuid not null references users(id) on delete cascade,
	joined_at timestamptz not null default now(),
	primary key (chat_id, user_id)
);

create table if not exists messages (
	id uuid primary key,
	chat_id uuid not null references chats(id) on delete cascade,
	sender_id uuid not null references users(id) on delete cascade,
	body text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	deleted_at timestamptz
);

create table if not exists friends (
	user_id uuid not null references users(id) on delete cascade,
	friend_id uuid not null references users(id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (user_id, friend_id),
	check (user_id <> friend_id)
);

alter table messages add column if not exists updated_at timestamptz not null default now();
alter table messages add column if not exists deleted_at timestamptz;
alter table users add column if not exists avatar_url text not null default '';
alter table messages add column if not exists attachment_url text not null default '';
alter table messages add column if not exists attachment_name text not null default '';
alter table messages add column if not exists attachment_type text not null default '';
create index if not exists messages_chat_created_idx on messages(chat_id, created_at);
create index if not exists chat_members_user_idx on chat_members(user_id);
create index if not exists friends_friend_idx on friends(friend_id);
`)
	return err
}

func (a *app) register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var req struct {
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		Password    string `json:"password"`
		Bio         string `json:"bio"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	req.Bio = strings.TrimSpace(req.Bio)
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}
	if len(req.Username) < 3 || len(req.Password) < 6 {
		errorJSON(w, http.StatusBadRequest, "username must be at least 3 chars and password at least 6 chars")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to hash password")
		return
	}
	u := user{ID: uuid.NewString(), Username: req.Username, DisplayName: req.DisplayName, Bio: req.Bio}
	err = a.db.QueryRow(r.Context(), `
insert into users (id, username, display_name, bio, password_hash)
values ($1, $2, $3, $4, $5)
returning created_at`, u.ID, u.Username, u.DisplayName, u.Bio, string(hash)).Scan(&u.CreatedAt)
	if isUniqueViolation(err) {
		errorJSON(w, http.StatusConflict, "username already exists")
		return
	}
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to create user")
		return
	}
	a.authResponse(w, u)
}

func (a *app) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	var u user
	var passwordHash string
	err := a.db.QueryRow(r.Context(), `
select id, username, display_name, bio, avatar_url, created_at, password_hash
from users where username = $1`, strings.ToLower(strings.TrimSpace(req.Username))).
		Scan(&u.ID, &u.Username, &u.DisplayName, &u.Bio, &u.AvatarURL, &u.CreatedAt, &passwordHash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)) != nil {
		errorJSON(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	a.authResponse(w, u)
}

func (a *app) authResponse(w http.ResponseWriter, u user) {
	token, err := a.issueToken(u)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to issue token")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": u})
}

func (a *app) me(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"user": currentUser(r)})
}

func (a *app) updateProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		methodNotAllowed(w)
		return
	}
	var req struct {
		DisplayName string `json:"display_name"`
		Bio         string `json:"bio"`
		AvatarURL   string `json:"avatar_url"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	u := currentUser(r)
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	req.Bio = strings.TrimSpace(req.Bio)
	req.AvatarURL = strings.TrimSpace(req.AvatarURL)
	if req.DisplayName == "" {
		errorJSON(w, http.StatusBadRequest, "display name is required")
		return
	}
	err := a.db.QueryRow(r.Context(), `
update users set display_name = $1, bio = $2, avatar_url = $3 where id = $4
returning id, username, display_name, bio, avatar_url, created_at`, req.DisplayName, req.Bio, req.AvatarURL, u.ID).
		Scan(&u.ID, &u.Username, &u.DisplayName, &u.Bio, &u.AvatarURL, &u.CreatedAt)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to update profile")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (a *app) searchUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	q := "%" + strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q"))) + "%"
	rows, err := a.db.Query(r.Context(), `
select id, username, display_name, bio, avatar_url, created_at
from users
where id <> $1 and (lower(username) like $2 or lower(display_name) like $2)
order by username
limit 30`, currentUser(r).ID, q)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to load users")
		return
	}
	defer rows.Close()
	users := []user{}
	for rows.Next() {
		var u user
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Bio, &u.AvatarURL, &u.CreatedAt); err != nil {
			errorJSON(w, http.StatusInternalServerError, "failed to read users")
			return
		}
		users = append(users, u)
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

// === НОВОЕ: эндпоинт списка онлайн-юзеров ===
func (a *app) onlineUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"online": a.hub.onlineUserIDs()})
}

func (a *app) uploadFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 15<<20)
	if err := r.ParseMultipartForm(15 << 20); err != nil {
		errorJSON(w, http.StatusBadRequest, "file is too large")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
		".pdf": true, ".txt": true, ".zip": true, ".doc": true, ".docx": true,
	}
	if !allowed[ext] {
		errorJSON(w, http.StatusBadRequest, "unsupported file type")
		return
	}

	filename := uuid.NewString() + ext
	target := filepath.Join(a.uploadDir, filename)
	out, err := os.Create(target)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	contentType := mime.TypeByExtension(ext)
	attachmentType := "file"
	if strings.HasPrefix(contentType, "image/") {
		attachmentType = "image"
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"url":  "/uploads/" + filename,
		"name": header.Filename,
		"type": attachmentType,
		"mime": contentType,
	})
}

func (a *app) friends(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.listFriends(w, r)
	case http.MethodPost:
		a.addFriend(w, r)
	default:
		methodNotAllowed(w)
	}
}

func (a *app) listFriends(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
select u.id, u.username, u.display_name, u.bio, u.avatar_url, u.created_at
from users u
join friends f on f.friend_id = u.id
where f.user_id = $1
order by u.display_name`, currentUser(r).ID)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to load friends")
		return
	}
	defer rows.Close()
	friends := []user{}
	for rows.Next() {
		var u user
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Bio, &u.AvatarURL, &u.CreatedAt); err != nil {
			errorJSON(w, http.StatusInternalServerError, "failed to read friends")
			return
		}
		friends = append(friends, u)
	}
	writeJSON(w, http.StatusOK, map[string]any{"friends": friends})
}

func (a *app) addFriend(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FriendID string `json:"friend_id"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	me := currentUser(r)
	friendID := strings.TrimSpace(req.FriendID)
	if friendID == "" || friendID == me.ID {
		errorJSON(w, http.StatusBadRequest, "friend id is required")
		return
	}
	tag, err := a.db.Exec(r.Context(), `
insert into friends (user_id, friend_id)
select $1, id from users where id = $2
on conflict do nothing`, me.ID, friendID)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to add friend")
		return
	}
	if tag.RowsAffected() == 0 {
		errorJSON(w, http.StatusBadRequest, "user not found or already in friends")
		return
	}
	a.listFriends(w, r)
}

func (a *app) friendRoutes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}
	friendID := strings.TrimPrefix(r.URL.Path, "/api/friends/")
	if friendID == "" {
		http.NotFound(w, r)
		return
	}
	_, err := a.db.Exec(r.Context(), `delete from friends where user_id = $1 and friend_id = $2`, currentUser(r).ID, friendID)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to remove friend")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) chats(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.listChats(w, r)
	case http.MethodPost:
		a.createChat(w, r)
	default:
		methodNotAllowed(w)
	}
}

func (a *app) listChats(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
select c.id, c.title, c.is_group, c.created_by, c.created_at,
       coalesce(last_msg.body, '') as last_body,
       coalesce(last_msg.created_at, '0001-01-01'::timestamptz) as last_at
from chats c
join chat_members cm on cm.chat_id = c.id and cm.user_id = $1
left join lateral (
	select body, created_at from messages
	where chat_id = c.id and deleted_at is null
	order by created_at desc
	limit 1
) last_msg on true
order by coalesce(last_msg.created_at, c.created_at) desc`, currentUser(r).ID)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to load chats")
		return
	}
	defer rows.Close()
	chats := []chat{}
	for rows.Next() {
		var c chat
		if err := rows.Scan(&c.ID, &c.Title, &c.IsGroup, &c.CreatedBy, &c.CreatedAt, &c.LastBody, &c.LastAt); err != nil {
			errorJSON(w, http.StatusInternalServerError, "failed to read chats")
			return
		}
		c.Members = a.chatMembers(r.Context(), c.ID)
		chats = append(chats, c)
	}
	writeJSON(w, http.StatusOK, map[string]any{"chats": chats})
}

func (a *app) createChat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title     string   `json:"title"`
		MemberIDs []string `json:"member_ids"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	creator := currentUser(r)
	req.Title = strings.TrimSpace(req.Title)
	memberSet := map[string]bool{creator.ID: true}
	for _, id := range req.MemberIDs {
		id = strings.TrimSpace(id)
		if id != "" {
			memberSet[id] = true
		}
	}
	if req.Title == "" || len(memberSet) < 2 {
		errorJSON(w, http.StatusBadRequest, "chat title and at least one invited user are required")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to create chat")
		return
	}
	defer tx.Rollback(r.Context())

	c := chat{ID: uuid.NewString(), Title: req.Title, IsGroup: true, CreatedBy: creator.ID}
	err = tx.QueryRow(r.Context(), `
insert into chats (id, title, is_group, created_by)
values ($1, $2, true, $3)
returning created_at`, c.ID, c.Title, c.CreatedBy).Scan(&c.CreatedAt)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to create chat")
		return
	}
	for memberID := range memberSet {
		tag, err := tx.Exec(r.Context(), `
insert into chat_members (chat_id, user_id)
select $1, id from users where id = $2
on conflict do nothing`, c.ID, memberID)
		if err != nil || tag.RowsAffected() == 0 {
			errorJSON(w, http.StatusBadRequest, "one of members does not exist")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to create chat")
		return
	}
	c.Members = a.chatMembers(r.Context(), c.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"chat": c})
}

func (a *app) createDirectChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var req struct {
		UserID string `json:"user_id"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	me := currentUser(r)
	otherID := strings.TrimSpace(req.UserID)
	if otherID == "" || otherID == me.ID {
		errorJSON(w, http.StatusBadRequest, "user id is required")
		return
	}

	var existingID string
	err := a.db.QueryRow(r.Context(), `
select c.id
from chats c
where c.is_group = false
  and exists(select 1 from chat_members where chat_id = c.id and user_id = $1)
  and exists(select 1 from chat_members where chat_id = c.id and user_id = $2)
limit 1`, me.ID, otherID).Scan(&existingID)
	if err == nil {
		c, ok := a.loadChat(r.Context(), existingID)
		if !ok {
			errorJSON(w, http.StatusInternalServerError, "failed to load chat")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"chat": c})
		return
	}

	var other user
	err = a.db.QueryRow(r.Context(), `
select id, username, display_name, bio, avatar_url, created_at
from users where id = $1`, otherID).
		Scan(&other.ID, &other.Username, &other.DisplayName, &other.Bio, &other.AvatarURL, &other.CreatedAt)
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "user not found")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to create chat")
		return
	}
	defer tx.Rollback(r.Context())

	c := chat{ID: uuid.NewString(), Title: other.DisplayName, IsGroup: false, CreatedBy: me.ID}
	err = tx.QueryRow(r.Context(), `
insert into chats (id, title, is_group, created_by)
values ($1, $2, false, $3)
returning created_at`, c.ID, c.Title, c.CreatedBy).Scan(&c.CreatedAt)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to create chat")
		return
	}
	for _, memberID := range []string{me.ID, otherID} {
		if _, err := tx.Exec(r.Context(), `
insert into chat_members (chat_id, user_id) values ($1, $2)`, c.ID, memberID); err != nil {
			errorJSON(w, http.StatusInternalServerError, "failed to create chat")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to create chat")
		return
	}
	c.Members = a.chatMembers(r.Context(), c.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"chat": c})
}

func (a *app) loadChat(ctx context.Context, chatID string) (chat, bool) {
	var c chat
	err := a.db.QueryRow(ctx, `
select id, title, is_group, created_by, created_at
from chats where id = $1`, chatID).
		Scan(&c.ID, &c.Title, &c.IsGroup, &c.CreatedBy, &c.CreatedAt)
	if err != nil {
		return chat{}, false
	}
	c.Members = a.chatMembers(ctx, chatID)
	return c, true
}

// === НОВОЕ: список чатов юзера (для рассылки presence) ===
func (a *app) userChats(userID string) []string {
	rows, err := a.db.Query(context.Background(),
		`select chat_id from chat_members where user_id = $1`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// === НОВОЕ: рассылка события presence по всем чатам юзера ===
func (a *app) broadcastPresence(userID string, online bool) {
	for _, chatID := range a.userChats(userID) {
		a.hub.broadcast(chatID, map[string]any{
			"event":   "presence",
			"user_id": userID,
			"online":  online,
		})
	}
}

func (a *app) chatRoutes(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/chats/"), "/")
	if len(parts) < 2 || parts[1] != "messages" {
		http.NotFound(w, r)
		return
	}
	chatID := parts[0]
	if !a.isMember(r.Context(), chatID, currentUser(r).ID) {
		errorJSON(w, http.StatusForbidden, "you are not a member of this chat")
		return
	}

	if len(parts) == 2 {
		switch r.Method {
		case http.MethodGet:
			a.listMessages(w, r, chatID)
		case http.MethodPost:
			msg, ok := a.createMessage(w, r, chatID)
			if ok {
				a.hub.broadcast(chatID, map[string]any{"event": "message", "message": msg})
			}
		default:
			methodNotAllowed(w)
		}
		return
	}

	if len(parts) == 3 {
		messageID := parts[2]
		switch r.Method {
		case http.MethodPatch:
			msg, ok := a.updateMessage(w, r, chatID, messageID)
			if ok {
				a.hub.broadcast(chatID, map[string]any{"event": "message_updated", "message": msg})
			}
		case http.MethodDelete:
			if a.deleteMessage(w, r, chatID, messageID) {
				a.hub.broadcast(chatID, map[string]any{"event": "message_deleted", "message_id": messageID})
			}
		default:
			methodNotAllowed(w)
		}
		return
	}

	http.NotFound(w, r)
}

func (a *app) listMessages(w http.ResponseWriter, r *http.Request, chatID string) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := a.db.Query(r.Context(), `
select m.id, m.chat_id, m.sender_id, u.username, u.display_name, m.body,
       m.attachment_url, m.attachment_name, m.attachment_type,
       m.created_at, m.updated_at, m.deleted_at
from messages m
join users u on u.id = m.sender_id
where m.chat_id = $1
order by m.created_at desc
limit $2`, chatID, limit)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to load messages")
		return
	}
	defer rows.Close()
	reversed := []message{}
	for rows.Next() {
		var msg message
		if err := rows.Scan(
			&msg.ID, &msg.ChatID, &msg.SenderID, &msg.SenderUsername, &msg.SenderName, &msg.Body,
			&msg.AttachmentURL, &msg.AttachmentName, &msg.AttachmentType,
			&msg.CreatedAt, &msg.UpdatedAt, &msg.DeletedAt,
		); err != nil {
			errorJSON(w, http.StatusInternalServerError, "failed to read messages")
			return
		}
		reversed = append(reversed, msg)
	}
	messages := make([]message, 0, len(reversed))
	for i := len(reversed) - 1; i >= 0; i-- {
		messages = append(messages, reversed[i])
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": messages})
}

func (a *app) createMessage(w http.ResponseWriter, r *http.Request, chatID string) (message, bool) {
	var req struct {
		Body           string `json:"body"`
		AttachmentURL  string `json:"attachment_url"`
		AttachmentName string `json:"attachment_name"`
		AttachmentType string `json:"attachment_type"`
	}
	if !decodeJSON(w, r, &req) {
		return message{}, false
	}
	msg, err := a.insertMessage(r.Context(), chatID, currentUser(r).ID, messageInput{
		Body:           req.Body,
		AttachmentURL:  req.AttachmentURL,
		AttachmentName: req.AttachmentName,
		AttachmentType: req.AttachmentType,
	})
	if err != nil {
		errorJSON(w, http.StatusBadRequest, err.Error())
		return message{}, false
	}
	writeJSON(w, http.StatusCreated, map[string]any{"message": msg})
	return msg, true
}

func (a *app) updateMessage(w http.ResponseWriter, r *http.Request, chatID, messageID string) (message, bool) {
	var req struct {
		Body string `json:"body"`
	}
	if !decodeJSON(w, r, &req) {
		return message{}, false
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		errorJSON(w, http.StatusBadRequest, "message body is required")
		return message{}, false
	}
	msg := message{}
	err := a.db.QueryRow(r.Context(), `
update messages m
set body = $1, updated_at = now()
from users u
where m.sender_id = u.id
  and m.id = $2
  and m.chat_id = $3
  and m.sender_id = $4
  and m.deleted_at is null
returning m.id, m.chat_id, m.sender_id, u.username, u.display_name, m.body,
          m.attachment_url, m.attachment_name, m.attachment_type,
          m.created_at, m.updated_at, m.deleted_at`,
		body, messageID, chatID, currentUser(r).ID).
		Scan(
			&msg.ID, &msg.ChatID, &msg.SenderID, &msg.SenderUsername, &msg.SenderName, &msg.Body,
			&msg.AttachmentURL, &msg.AttachmentName, &msg.AttachmentType,
			&msg.CreatedAt, &msg.UpdatedAt, &msg.DeletedAt,
		)
	if err != nil {
		errorJSON(w, http.StatusForbidden, "message not found or cannot be edited")
		return message{}, false
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": msg})
	return msg, true
}

func (a *app) deleteMessage(w http.ResponseWriter, r *http.Request, chatID, messageID string) bool {
	tag, err := a.db.Exec(r.Context(), `
update messages
set body = '', updated_at = now(), deleted_at = now()
where id = $1 and chat_id = $2 and sender_id = $3 and deleted_at is null`,
		messageID, chatID, currentUser(r).ID)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to delete message")
		return false
	}
	if tag.RowsAffected() == 0 {
		errorJSON(w, http.StatusForbidden, "message not found or cannot be deleted")
		return false
	}
	w.WriteHeader(http.StatusNoContent)
	return true
}

// === ИЗМЕНЁННЫЙ serveWS: добавлена логика presence ===
func (a *app) serveWS(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	chatID := r.URL.Query().Get("chat_id")
	token := r.URL.Query().Get("token")
	claims, err := a.parseToken(token)
	if err != nil {
		errorJSON(w, http.StatusUnauthorized, "invalid token")
		return
	}
	if !a.isMember(r.Context(), chatID, claims.UserID) {
		errorJSON(w, http.StatusForbidden, "you are not a member of this chat")
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client := &wsClient{userID: claims.UserID, chatID: chatID, conn: conn}

	// Был ли юзер оффлайн ДО этого подключения
	wasOffline := !a.hub.isOnline(claims.UserID)
	a.hub.add(client)

	// Только что появился в сети — шлём всем его чатам
	if wasOffline {
		a.broadcastPresence(claims.UserID, true)
	}

	defer func() {
		// Проверяем — останется ли онлайн ПОСЛЕ закрытия
		a.hub.remove(client)
		conn.Close()

		if !a.hub.hasOpenSockets(claims.UserID) {
			a.broadcastPresence(claims.UserID, false)
		}
	}()

	for {
		var req struct {
			Body           string `json:"body"`
			AttachmentURL  string `json:"attachment_url"`
			AttachmentName string `json:"attachment_name"`
			AttachmentType string `json:"attachment_type"`
		}
		if err := conn.ReadJSON(&req); err != nil {
			return
		}
		msg, err := a.insertMessage(r.Context(), chatID, claims.UserID, messageInput{
			Body:           req.Body,
			AttachmentURL:  req.AttachmentURL,
			AttachmentName: req.AttachmentName,
			AttachmentType: req.AttachmentType,
		})
		if err != nil {
			conn.WriteJSON(map[string]any{"event": "error", "message": err.Error()})
			continue
		}
		a.hub.broadcast(chatID, map[string]any{"event": "message", "message": msg})
	}
}

type messageInput struct {
	Body           string
	AttachmentURL  string
	AttachmentName string
	AttachmentType string
}

func (a *app) insertMessage(ctx context.Context, chatID, senderID string, input messageInput) (message, error) {
	body := strings.TrimSpace(input.Body)
	attachmentURL := strings.TrimSpace(input.AttachmentURL)
	attachmentName := strings.TrimSpace(input.AttachmentName)
	attachmentType := strings.TrimSpace(input.AttachmentType)
	if body == "" && attachmentURL == "" {
		return message{}, errors.New("message body or attachment is required")
	}
	msg := message{
		ID:             uuid.NewString(),
		ChatID:         chatID,
		SenderID:       senderID,
		Body:           body,
		AttachmentURL:  attachmentURL,
		AttachmentName: attachmentName,
		AttachmentType: attachmentType,
	}
	err := a.db.QueryRow(ctx, `
insert into messages (id, chat_id, sender_id, body, attachment_url, attachment_name, attachment_type)
values ($1, $2, $3, $4, $5, $6, $7)
returning created_at, updated_at`, msg.ID, msg.ChatID, msg.SenderID, msg.Body, msg.AttachmentURL, msg.AttachmentName, msg.AttachmentType).
		Scan(&msg.CreatedAt, &msg.UpdatedAt)
	if err != nil {
		return message{}, errors.New("failed to save message")
	}
	err = a.db.QueryRow(ctx, `select username, display_name from users where id = $1`, senderID).
		Scan(&msg.SenderUsername, &msg.SenderName)
	if err != nil {
		return message{}, errors.New("failed to load sender")
	}
	return msg, nil
}

func (a *app) chatMembers(ctx context.Context, chatID string) []user {
	rows, err := a.db.Query(ctx, `
select u.id, u.username, u.display_name, u.bio, u.avatar_url, u.created_at
from users u
join chat_members cm on cm.user_id = u.id
where cm.chat_id = $1
order by u.display_name`, chatID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	members := []user{}
	for rows.Next() {
		var u user
		if rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Bio, &u.AvatarURL, &u.CreatedAt) == nil {
			members = append(members, u)
		}
	}
	return members
}

func (a *app) isMember(ctx context.Context, chatID, userID string) bool {
	var exists bool
	err := a.db.QueryRow(ctx, `select exists(select 1 from chat_members where chat_id = $1 and user_id = $2)`, chatID, userID).Scan(&exists)
	return err == nil && exists
}

func (a *app) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		header := r.Header.Get("Authorization")
		token := strings.TrimPrefix(header, "Bearer ")
		claims, err := a.parseToken(token)
		if err != nil {
			errorJSON(w, http.StatusUnauthorized, "invalid token")
			return
		}
		var u user
		err = a.db.QueryRow(r.Context(), `
select id, username, display_name, bio, avatar_url, created_at
from users where id = $1`, claims.UserID).Scan(&u.ID, &u.Username, &u.DisplayName, &u.Bio, &u.AvatarURL, &u.CreatedAt)
		if err != nil {
			errorJSON(w, http.StatusUnauthorized, "user not found")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userContextKey, u)))
	}
}

func (a *app) withCORSHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *app) withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func (a *app) issueToken(u user) (string, error) {
	claims := userClaims{
		UserID:   u.ID,
		Username: u.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   u.ID,
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.jwtSecret)
}

func (a *app) parseToken(raw string) (*userClaims, error) {
	if raw == "" {
		return nil, errors.New("missing token")
	}
	token, err := jwt.ParseWithClaims(raw, &userClaims{}, func(token *jwt.Token) (any, error) {
		return a.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*userClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func currentUser(r *http.Request) user {
	return r.Context().Value(userContextKey).(user)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid json")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}

func errorJSON(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func methodNotAllowed(w http.ResponseWriter) {
	errorJSON(w, http.StatusMethodNotAllowed, "method not allowed")
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func env(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}
