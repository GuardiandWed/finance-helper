import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    BOT_TOKEN: str = "8206201271:AAEZzrwuLn3wlpnKcJ4r2OezBeqhcWJGFxU"
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "finance_helper"
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    WEBAPP_URL: str = "https://finance-helper-pt0m.onrender.com"
    ACCESS_PIN: str = "220626"
    KEEP_ALIVE_ENABLED: bool = True
    BOT_ENABLED: bool = True
    KEEP_ALIVE_INTERVAL_MINUTES: int = 10

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
