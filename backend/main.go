package main

import (
	"chat/pkg/websocket"
	"fmt"
	"net/http"

	"github.com/google/uuid"
)

func serveWs(pool *websocket.Pool, w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Upgrade(w, r)
	if err != nil {
		fmt.Fprintf(w, "%+v\n", err)
		return
	}
	clientID := uuid.New().String()
	client := &websocket.Client{ID: clientID, Conn: conn, Pool: pool}
	pool.Register <- client
	client.Read()
}

func main() {
	pool := websocket.NewPool()
	go pool.Start()

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(pool, w, r)
	})
	http.ListenAndServe(":8080", nil)
}
