from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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

# Раздаём статические файлы (клиент)
if os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")

clients = {}


@app.websocket("/ws/{username}")
async def websocket_handler(websocket: WebSocket, username: str):
    await websocket.accept()
    clients[username] = websocket
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
    except:
        pass
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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)