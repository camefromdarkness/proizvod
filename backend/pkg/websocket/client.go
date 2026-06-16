package websocket

import (
	"encoding/json"
	"log"

	"github.com/gorilla/websocket"
)

type Client struct {
	ID       string
	Username string
	Conn     *websocket.Conn
	Pool     *Pool
	Room     *Room
}

type Message struct {
	Type   int     `json:"type"`
	Body   string  `json:"body"`
	Sender string  `json:"sender,omitempty"`
	Client *Client `json:"-"`
}

func (c *Client) Read() {
	defer func() {
		c.Pool.Unregister <- c
		c.Conn.Close()
	}()

	for {
		messageType, p, err := c.Conn.ReadMessage()
		if err != nil {
			log.Println(err)
			return
		}

		var msg Message
		if err := json.Unmarshal(p, &msg); err != nil {
			// if message isn't JSON, treat raw payload as body
			msg = Message{Type: messageType, Body: string(p)}
		}
		// ensure Type reflects websocket frame type (text/binary)
		msg.Type = messageType
		// only set sender if not provided from client
		if msg.Sender == "" {
			msg.Sender = c.ID
		}
		msg.Client = c

		// Сохраняем username клиента с первого сообщения
		if c.Username == "" && msg.Sender != "" {
			c.Username = msg.Sender
			roomID := "без комнаты"
			if c.Room != nil {
				roomID = c.Room.ID
			}
			log.Printf("📝 Установлено имя для клиента %s: '%s' (в комнате: %s)\n", c.ID[:8], c.Username, roomID)
		}

		log.Printf("   → Сообщение от %s/%s: '%s'\n", c.ID[:8], c.Username, msg.Body)
		c.Pool.Broadcast <- msg
	}
}
