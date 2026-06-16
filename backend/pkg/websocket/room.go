package websocket

import (
	"fmt"
	"log"
)

type Room struct {
	ID       string
	Client1  *Client
	Client2  *Client
	Messages chan Message
}

func NewRoom(id string) *Room {
	return &Room{
		ID:       id,
		Messages: make(chan Message, 10),
	}
}

func (r *Room) AddClient(client *Client) error {
	if r.Client1 == nil {
		r.Client1 = client
		client.Room = r
		// Отправляем сообщение что ждём второго
		if err := r.Client1.Conn.WriteJSON(Message{
			Type: 1,
			Body: "Ожидание второго пользователя...",
		}); err != nil {
			log.Println("Ошибка отправки сообщения Client1:", err)
			r.Client1 = nil // Откатываем добавление
			return err
		}
		return nil
	} else if r.Client2 == nil {
		r.Client2 = client
		client.Room = r
		// Отправляем сообщения обоим что оба в комнате
		if err := r.Client1.Conn.WriteJSON(Message{
			Type: 1,
			Body: "Второй пользователь присоединился!",
		}); err != nil {
			log.Println("Ошибка отправки сообщения Client1:", err)
			r.Client2 = nil // Откатываем добавление
			return err
		}
		if err := r.Client2.Conn.WriteJSON(Message{
			Type: 1,
			Body: "Вы присоединились к чату!",
		}); err != nil {
			log.Println("Ошибка отправки сообщения Client2:", err)
			r.Client2 = nil // Откатываем добавление
			return err
		}
		return nil
	}
	return fmt.Errorf("комната переполнена")
}

func (r *Room) RemoveClient(client *Client) {
	if r.Client1 == client {
		r.Client1 = nil
	} else if r.Client2 == client {
		r.Client2 = nil
	}

	// Если остался один клиент - отправляем уведомление
	if r.Client1 != nil && r.Client2 == nil {
		r.Client1.Conn.WriteJSON(Message{
			Type: 1,
			Body: "Пользователь отключился",
		})
	} else if r.Client2 != nil && r.Client1 == nil {
		r.Client2.Conn.WriteJSON(Message{
			Type: 1,
			Body: "Пользователь отключился",
		})
	}
}

func (r *Room) IsEmpty() bool {
	return r.Client1 == nil && r.Client2 == nil
}

func (r *Room) IsFull() bool {
	return r.Client1 != nil && r.Client2 != nil
}

func (r *Room) Broadcast(message Message) {
	if r.Client1 != nil {
		if err := r.Client1.Conn.WriteJSON(message); err != nil {
			log.Println("Ошибка отправки Client1:", err)
		} else {
			log.Printf("  ✓ Сообщение отправлено %s в комнате %s\n", r.Client1.Username, r.ID)
		}
	}
	if r.Client2 != nil {
		if err := r.Client2.Conn.WriteJSON(message); err != nil {
			log.Println("Ошибка отправки Client2:", err)
		} else {
			log.Printf("  ✓ Сообщение отправлено %s в комнате %s\n", r.Client2.Username, r.ID)
		}
	}
}
