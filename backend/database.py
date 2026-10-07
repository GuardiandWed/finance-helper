from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings

client = None
db = None

DEFAULT_CATEGORIES = [
    # Расходы
    {"name": "Продукты", "type": "expense", "icon": "🛒", "color": "#10B981"},
    {"name": "Рестораны и кофе", "type": "expense", "icon": "☕", "color": "#F59E0B"},
    {"name": "Дом и быт", "type": "expense", "icon": "🏠", "color": "#3B82F6"},
    {"name": "Транспорт", "type": "expense", "icon": "🚗", "color": "#6366F1"},
    {"name": "Одежда", "type": "expense", "icon": "👗", "color": "#EC4899"},
    {"name": "Здоровье", "type": "expense", "icon": "💊", "color": "#EF4444"},
    {"name": "Развлечения", "type": "expense", "icon": "🎬", "color": "#8B5CF6"},
    {"name": "Другое", "type": "expense", "icon": "📦", "color": "#6B7280"},
    # Доходы
    {"name": "Зарплата", "type": "income", "icon": "💼", "color": "#10B981"},
    {"name": "Возврат долга", "type": "income", "icon": "🤝", "color": "#3B82F6"},
    {"name": "Подарки", "type": "income", "icon": "🎁", "color": "#EC4899"},
    {"name": "Другой доход", "type": "income", "icon": "📈", "color": "#F59E0B"}
]

async def init_db():
    global client, db
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]
    
    # Проверяем и создаем категории по умолчанию, если их нет
    count = await db.categories.count_documents({})
    if count == 0:
        await db.categories.insert_many(DEFAULT_CATEGORIES)
        print("Базовые категории успешно добавлены в MongoDB!")
        
    # Индексы для быстрой фильтрации по дате
    await db.transactions.create_index([("date", -1)])
    await db.transactions.create_index([("type", 1)])
    return db

def get_db():
    return db
