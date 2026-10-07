import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.config import settings
from backend.database import init_db
from backend.routes import router as api_router
from backend.bot import start_bot, bot

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

bot_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Инициализация MongoDB...")
    try:
        await init_db()
        logger.info("MongoDB успешно подключена.")
    except Exception as e:
        logger.error(f"Ошибка подключения к MongoDB: {e}")
        logger.warning("Приложение запустится, но базу нужно настроить в .env")

    # Запуск фонового поллинга Telegram бота
    global bot_task
    logger.info("Запуск Telegram бота в фоне...")
    bot_task = asyncio.create_task(start_bot())

    yield

    # Shutdown
    if bot_task:
        bot_task.cancel()
        try:
            await bot_task
        except asyncio.CancelledError:
            pass
    await bot.session.close()
    logger.info("Сервис остановлен.")

app = FastAPI(title="Family Finance Helper", lifespan=lifespan)

# CORS для вызова с любых доменов Mini App
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение API роутов
app.include_router(api_router)

# Раздача фронтенда
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")

@app.get("/")
async def serve_index():
    return FileResponse("frontend/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.HOST, port=settings.PORT, reload=True)
