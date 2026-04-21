"""
Signaling Server - отвечает за:
1. Приём WebSocket соединений
2. Обмен SDP предложениями (offer/answer)
3. Пересылку ICE кандидатов
4. Управление комнатами
"""

import json
import logging
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.room.manager import RoomManager
from app.utils.logger import setup_logging

# Настройка логирования
setup_logging()
logger = logging.getLogger(__name__)

# Создаём FastAPI приложение
app = FastAPI(
    title="P2P Encrypted Chat",
    description="Signaling Server for P2P WebRTC Chat",
    version="1.0.0"
)

# Разрешаем CORS для всех источников (в development)
# В production нужно ограничить конкретными доменами
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Глобальный менеджер комнат
room_manager = RoomManager()


@app.get("/health")
async def health_check():
    """Проверка работоспособности сервера"""
    return {
        "status": "healthy",
        "rooms_count": len(room_manager.rooms)
    }


@app.get("/rooms")
async def list_rooms():
    """Список всех активных комнат"""
    return room_manager.get_rooms_info()


@app.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    """
    WebSocket эндпоинт для клиентов.

    Принимает:
    - room_id: идентификатор комнаты
    - user_id: идентификатор пользователя

    Обрабатывает:
    - offer/answer SDP сообщения
    - ICE кандидаты
    - Уведомления о входе/выходе пользователей
    """

    await websocket.accept()
    logger.info(f"Пользователь {user_id} подключился к комнате {room_id}")

    # Добавляем пользователя в комнату
    room = room_manager.join_room(room_id, user_id, websocket)

    # Отправляем новому пользователю список существующих пользователей
    await websocket.send_json({
        "type": "room_state",
        "users": room.get_other_users(user_id)
    })

    # Уведомляем остальных о новом пользователе
    await room.broadcast(user_id, {
        "type": "user_joined",
        "user_id": user_id
    })

    try:
        while True:
            # Ждём сообщения от клиента
            data = await websocket.receive_text()
            message = json.loads(data)

            message_type = message.get("type")
            target_user = message.get("to_user_id")

            logger.debug(f"Получено {message_type} от {user_id} -> {target_user}")

            if target_user:
                # Личное сообщение (offer/answer/ice-candidate)
                await room.send_to_user(user_id, target_user, {
                    "type": message_type,
                    "data": message.get("data")
                })
            else:
                # Широковещательное сообщение
                await room.broadcast(user_id, {
                    "type": message_type,
                    "data": message.get("data")
                })

    except WebSocketDisconnect:
        logger.info(f"Пользователь {user_id} отключился")

        # Удаляем пользователя из комнаты
        room.remove_user(user_id)

        # Уведомляем остальных
        await room.broadcast(user_id, {
            "type": "user_left",
            "user_id": user_id
        })

        # Если комната пуста - удаляем её
        if room.is_empty():
            room_manager.remove_room(room_id)

import os, uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)