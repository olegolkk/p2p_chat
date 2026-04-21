"""
Модели данных для управления комнатами
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict
from fastapi import WebSocket


@dataclass
class Room:
    """
    Комната чата.
    Хранит информацию о подключённых пользователях.
    """

    room_id: str
    created_at: datetime = field(default_factory=datetime.now)
    users: Dict[str, WebSocket] = field(default_factory=dict)

    def add_user(self, user_id: str, websocket: WebSocket) -> None:
        """Добавляет пользователя в комнату"""
        self.users[user_id] = websocket

    def remove_user(self, user_id: str) -> None:
        """Удаляет пользователя из комнаты"""
        self.users.pop(user_id, None)

    def get_other_users(self, user_id: str) -> list:
        """Возвращает список остальных пользователей"""
        return [uid for uid in self.users.keys() if uid != user_id]

    def is_empty(self) -> bool:
        """Проверяет, пуста ли комната"""
        return len(self.users) == 0

    async def send_to_user(self, from_user_id: str, to_user_id: str, message: dict) -> bool:
        """
        Отправляет сообщение конкретному пользователю.
        Возвращает True если успешно, False если пользователь не найден.
        """
        if to_user_id in self.users:
            try:
                await self.users[to_user_id].send_json({
                    "from_user_id": from_user_id,
                    **message
                })
                return True
            except Exception as e:
                return False
        return False

    async def broadcast(self, from_user_id: str, message: dict, exclude_self: bool = True) -> None:
        """
        Рассылает сообщение всем пользователям в комнате.
        """
        for user_id, ws in self.users.items():
            if exclude_self and user_id == from_user_id:
                continue
            try:
                await ws.send_json({
                    "from_user_id": from_user_id,
                    **message
                })
            except Exception as e:
                pass  # Игнорируем ошибки отправки