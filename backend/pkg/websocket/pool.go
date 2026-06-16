package websocket

import (
	"fmt"
	"log"
	"time"
)

type Pool struct {
	Register   chan *Client
	Unregister chan *Client
	Rooms      map[string]*Room
	Broadcast  chan Message
}

func NewPool() *Pool {
	return &Pool{
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Rooms:      make(map[string]*Room),
		Broadcast:  make(chan Message),
	}
}

func (pool *Pool) Start() {
	roomCounter := 0
	ticker := time.NewTicker(30 * time.Second) // Проверяем каждые 30 сек
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// Удаляем пустые комнаты (они больше не понадобятся)
			for roomID, room := range pool.Rooms {
				if room.IsEmpty() {
					delete(pool.Rooms, roomID)
					log.Println("Удалена пустая комната:", roomID)
				}
			}

		case client := <-pool.Register:
			log.Printf("🟢 Регистрация клиента: %s\n", client.ID[:8])
			log.Printf("   Активные комнаты: %d\n", len(pool.Rooms))

			// Ищем незаполненную комнату
			var room *Room
			for roomID, r := range pool.Rooms {
				log.Printf("   Проверка комнаты %s: Client1=%v, Client2=%v, Full=%v\n",
					roomID, r.Client1 != nil, r.Client2 != nil, r.IsFull())
				if !r.IsFull() {
					room = r
					log.Printf("   ✓ Найдена незаполненная комната: %s\n", r.ID)
					break
				}
			}

			// Если нет свободной комнаты - создаём новую
			if room == nil {
				roomCounter++
				roomID := fmt.Sprintf("room_%d", roomCounter)
				room = NewRoom(roomID)
				pool.Rooms[roomID] = room
				log.Printf("   ✗ Создана новая комната: %s\n", roomID)
			}

			// Добавляем клиента в комнату
			if err := room.AddClient(client); err != nil {
				log.Printf("   ✗ Ошибка при добавлении клиента: %v\n", err)
			} else {
				log.Printf("   ✓ Клиент добавлен в комнату %s. Client1=%v, Client2=%v\n",
					room.ID, room.Client1 != nil, room.Client2 != nil)
			}

			// Логируем состояние всех комнат
			log.Println("=== Состояние комнат после добавления ===")
			for roomID, room := range pool.Rooms {
				c1Name := "пусто"
				c2Name := "пусто"
				if room.Client1 != nil {
					c1Name = room.Client1.Username
					if c1Name == "" {
						c1Name = fmt.Sprintf("(ID:%s)", room.Client1.ID[:8])
					}
				}
				if room.Client2 != nil {
					c2Name = room.Client2.Username
					if c2Name == "" {
						c2Name = fmt.Sprintf("(ID:%s)", room.Client2.ID[:8])
					}
				}
				log.Printf("  %s: Client1=%s, Client2=%s\n", roomID, c1Name, c2Name)
			}
			log.Println("===========================================")

		case client := <-pool.Unregister:
			log.Printf("🔴 Удаление клиента: %s (username='%s')\n", client.ID[:8], client.Username)

			if client.Room != nil {
				log.Printf("   Был в комнате: %s\n", client.Room.ID)
				client.Room.RemoveClient(client)

				// Если комната пустая - удаляем её (не ждём тайм-аут)
				if client.Room.IsEmpty() {
					delete(pool.Rooms, client.Room.ID)
					log.Printf("   Комната %s удалена (пустая)\n", client.Room.ID)
				} else {
					log.Printf("   В комнате остался 1 клиент\n")
				}
			}

		case message := <-pool.Broadcast:
			if message.Client != nil {
				if message.Client.Room != nil {
					log.Printf("Sending message from client %s to room %s\n", message.Client.ID[:8], message.Client.Room.ID)
					message.Client.Room.Broadcast(message)
				} else {
					log.Printf("Client %s has no room for message\n", message.Client.ID[:8])
				}
				continue
			}
			// Сообщение должно содержать информацию о комнате или клиенте
			// Отправляем через комнату клиента
			log.Printf("Получено сообщение от sender='%s', body='%s'\n", message.Sender, message.Body)

			// Логируем состояние всех комнат перед поиском
			log.Println("=== Состояние комнат (поиск для отправки) ===")
			for roomID, room := range pool.Rooms {
				c1Name := "пусто"
				c2Name := "пусто"
				if room.Client1 != nil {
					c1Name = room.Client1.Username
					if c1Name == "" {
						c1Name = fmt.Sprintf("(ID:%s)", room.Client1.ID[:8])
					}
				}
				if room.Client2 != nil {
					c2Name = room.Client2.Username
					if c2Name == "" {
						c2Name = fmt.Sprintf("(ID:%s)", room.Client2.ID[:8])
					}
				}
				log.Printf("  %s: Client1=%s, Client2=%s\n", roomID, c1Name, c2Name)
			}
			log.Println("===========================================")

			if message.Sender != "" {
				// Ищем клиента и его комнату по username
				found := false
				for roomID, room := range pool.Rooms {
					if (room.Client1 != nil && room.Client1.Username == message.Sender) ||
						(room.Client2 != nil && room.Client2.Username == message.Sender) {
						log.Printf("Найдена комната %s для отправителя %s, отправляем сообщение\n", roomID, message.Sender)
						room.Broadcast(message)
						found = true
						break
					}
				}
				if !found {
					log.Printf("ОШИБКА: Не найдена комната для отправителя %s\n", message.Sender)
				}
			} else {
				log.Println("ОШИБКА: Sender пусто в сообщении")
			}
		}
	}
}
