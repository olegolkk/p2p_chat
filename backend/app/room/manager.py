"""
Менеджер комнат - управляет всеми активными комнатами.
"""

from typing import Dict, Optional
from fastapi import WebSocket
from app.room.models import Room


class RoomManager:
    """
    Глобальный менеджер комнат.
    Хранит все активные комнаты и управляет ими.
    """

    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def join_room(self, room_id: str, user_id: str, websocket: WebSocket) -> Room:
        """
        Добавляет пользователя в комнату.
        Если комната не существует - создаёт новую.
        """
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(room_id)

        room = self.rooms[room_id]
        room.add_user(user_id, websocket)

        return room

    def remove_room(self, room_id: str) -> None:
        """Удаляет комнату"""
        self.rooms.pop(room_id, None)

    def get_rooms_info(self) -> dict:
        """Возвращает информацию о всех комнатах"""
        return {
            "rooms": [
                {
                    "room_id": room_id,
                    "users_count": len(room.users),
                    "users": list(room.users.keys()),
                    "created_at": room.created_at.isoformat()
                }
                for room_id, room in self.rooms.items()
            ]
        }