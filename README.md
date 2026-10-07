# 💶 Family Finance Helper (Telegram Mini App)

Совместный семейный бюджет для Telegram.
- **Валюта:** Евро (€)
- **Модель:** Единый общий кошелек
- **Стек:** Python (FastAPI + Aiogram 3 + Motor), MongoDB, HTML5 + Tailwind + Chart.js + Telegram WebApp SDK.

---

## 🚀 Быстрый запуск

### 1. Настройка окружения
В файле `.env` укажите вашу строку подключения к MongoDB:
```env
BOT_TOKEN=8206201271:AAEZzrwuLn3wlpnKcJ4r2OezBeqhcWJGFxU
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
MONGO_DB_NAME=finance_helper
WEBAPP_URL=https://your-domain.com
```

### 2. Установка зависимостей
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Запуск сервиса
```bash
python -m backend.main
```
Сервер запустит FastAPI и Telegram-бота одновременно!

---

## 🌐 Бесплатный деплой 24/7 (Без включенного ноутбука)

### Вариант 1: Render.com (Рекомендуемый, 100% бесплатно)
1. Загрузите этот репозиторий на GitHub.
2. Зайдите на [Render.com](https://render.com) -> **New Web Service**.
3. Выберите репозиторий.
4. Укажите:
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. В разделе **Environment Variables** добавьте:
   - `BOT_TOKEN`
   - `MONGO_URI`
   - `WEBAPP_URL` (URL который выдаст Render, например `https://finance-helper.onrender.com`)
6. Нажмите **Deploy** — готово!

---

## 🤖 Привязка к BotFather
1. Откройте в Telegram `@BotFather`.
2. Введите `/mybots` -> выберите вашего бота.
3. Перейдите в **Bot Settings** -> **Menu Button** -> **Configure menu button**.
4. Отправьте ссылку на ваше приложение (например `https://finance-helper.onrender.com`).
5. Теперь кнопка в боте будет открывать Mini App прямо на смартфоне!
