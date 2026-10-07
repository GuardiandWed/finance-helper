import asyncio
import logging
from aiogram import Bot, Dispatcher, types, Router
from aiogram.filters import CommandStart, Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, MenuButtonWebApp
from backend.config import settings

logger = logging.getLogger(__name__)

bot = Bot(token=settings.BOT_TOKEN)
router = Router()

@router.message(CommandStart())
async def start_handler(message: types.Message):
    try:
        await bot.set_chat_menu_button(
            chat_id=message.chat.id,
            menu_button=MenuButtonWebApp(
                text="Бюджет 💶",
                web_app=WebAppInfo(url=settings.WEBAPP_URL)
            )
        )
    except Exception as e:
        logger.error(f"Не удалось установить menu_button: {e}")

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✨ Открыть Бюджет (EUR)",
                    web_app=WebAppInfo(url=settings.WEBAPP_URL)
                )
            ]
        ]
    )

    welcome_text = (
        "👋 **Привет!**\n\n"
        "Это ваш общий семейный помощник по финансам 💶.\n\n"
        "Здесь всё просто:\n"
        "• Совершили покупку — открыли приложение и внесли трату в 2 клика.\n"
        "• Получили деньги — внесли доход.\n"
        "• Следите за статистикой, категориями и балансом за текущий месяц.\n\n"
        "Нажмите кнопку ниже или кнопку меню слева внизу, чтобы открыть приложение!"
    )
    await message.answer(welcome_text, reply_markup=kb, parse_mode="Markdown")

@router.message(Command("help"))
async def help_handler(message: types.Message):
    await message.answer(
        "💡 **Как пользоваться?**\n"
        "1. Нажмите кнопку **«Открыть Бюджет»**.\n"
        "2. Нажмите **«− Трата»** или **«+ Доход»**.\n"
        "3. Введите сумму в евро (€) и выберите категорию.\n"
        "4. Все данные синхронизируются мгновенно!",
        parse_mode="Markdown"
    )

async def start_bot():
    try:
        logger.info("Запуск Telegram бота...")
        dp = Dispatcher()
        dp.include_router(router)
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    except Exception as e:
        logger.error(f"Ошибка при работе бота: {e}")
