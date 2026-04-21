from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from urllib.parse import unquote
import uvicorn
import json
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

clients = {}


# ===== ВАЖНО: WebSocket маршрут ДО статики =====
@app.websocket("/ws/{username}")
async def websocket_handler(websocket: WebSocket, username: str):
    username = unquote(username)
    await websocket.accept()
    clients[username] = websocket
    print(f"✅ {username} connected")

    await broadcast_users()

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            target_ws = clients.get(message.get("target"))
            if target_ws:
                await target_ws.send_text(json.dumps({
                    "type": message["type"],
                    "from": username,
                    "data": message.get("data")
                }))
    except Exception as e:
        print(f"❌ {username} disconnected: {e}")
    finally:
        if username in clients:
            del clients[username]
        await broadcast_users()


async def broadcast_users():
    user_list = list(clients.keys())
    message = json.dumps({"type": "users", "users": user_list})
    for client in clients.values():
        try:
            await client.send_text(message)
        except:
            pass


# ===== Корневой маршрут =====
@app.get("/")
async def root():
    # Пробуем отдать index.html из static, если есть
    if os.path.exists("static/index.html"):
        with open("static/index.html", "r") as f:
            return HTMLResponse(f.read())
    return HTMLResponse("<h1>P2P Chat Server Running</h1><p>WebSocket: /ws/username</p>")


# ===== Статика - ТОЛЬКО ПОСЛЕ всех маршрутов! =====
if os.path.exists("static"):
    from fastapi.staticfiles import StaticFiles

    app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)