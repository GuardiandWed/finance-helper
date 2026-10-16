import asyncio
import logging
import aiohttp
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.config import settings
from backend.database import init_db
from backend.routes import router as api_router, public_router
from backend.bot import start_bot, bot

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

bot_task = None
keep_alive_task = None

async def keep_alive_worker():
    """Фоновый пингер своего же URL, предотвращающий засыпание Render Free Tier"""
    if not settings.KEEP_ALIVE_ENABLED:
        return
    
    # Ждем 30 секунд после старта сервера
    await asyncio.sleep(30)
    logger.info(f"Запущен Keep-Alive Pinger для: {settings.WEBAPP_URL}")
    
    health_url = f"{settings.WEBAPP_URL.rstrip('/')}/api/health"
    interval_seconds = settings.KEEP_ALIVE_INTERVAL_MINUTES * 60

    while True:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(health_url, timeout=15) as resp:
                    if resp.status == 200:
                        logger.info("Keep-Alive ping успешен: сервер бодрствует ✅")
                    else:
                        logger.warning(f"Keep-Alive ping статус: {resp.status}")
        except Exception as e:
            logger.warning(f"Keep-Alive ping ошибка (возможно, локальный запуск): {e}")

        await asyncio.sleep(interval_seconds)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Инициализация MongoDB...")
    try:
        await init_db()
        logger.info("MongoDB успешно подключена.")
    except Exception as e:
        logger.error(f"Ошибка подключения к MongoDB: {e}")

    # Запуск бота в фоне
    global bot_task, keep_alive_task
    logger.info("Запуск Telegram бота в фоне...")
    if settings.BOT_ENABLED:
        bot_task = asyncio.create_task(start_bot())

    # Запуск Keep-Alive пингера
    logger.info("Запуск задачи поддержания активности сервера (Anti-Sleep)...")
    keep_alive_task = asyncio.create_task(keep_alive_worker())

    yield

    # Shutdown
    if bot_task:
        bot_task.cancel()
        try:
            await bot_task
        except asyncio.CancelledError:
            pass
    if keep_alive_task:
        keep_alive_task.cancel()
        try:
            await keep_alive_task
        except asyncio.CancelledError:
            pass
    await bot.session.close()
    logger.info("Сервис остановлен.")

app = FastAPI(title="Family Finance Helper", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API
app.include_router(public_router)
app.include_router(api_router)

@app.middleware("http")
async def no_cache(request, call_next):
    resp = await call_next(request)
    p = request.url.path
    if p == "/" or p.startswith("/static") or p.startswith("/api"):
        resp.headers["Cache-Control"] = "no-store, must-revalidate"
    return resp

# Статика фронтенда
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")

@app.get("/")
async def serve_index():
    return FileResponse("frontend/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.HOST, port=settings.PORT, reload=True)
