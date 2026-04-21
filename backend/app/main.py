"""
Точка входа в приложение.
Запускает FastAPI сервер с WebSocket поддержкой.
"""

import uvicorn
from dotenv import load_dotenv
import os

# Загружаем переменные окружения
load_dotenv()

if __name__ == "__main__":
    uvicorn.run(
        "app.signaling_server:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("ENV") == "development",
        log_level=os.getenv("LOG_LEVEL", "info")
    )

