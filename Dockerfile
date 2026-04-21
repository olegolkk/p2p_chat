FROM python:3.11-slim

WORKDIR /app

# Копируем сервер
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ .

# Копируем статические файлы (клиент)
COPY static/ ./static/

# Указываем порт
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]