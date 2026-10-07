import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    BOT_TOKEN: str = "8206201271:AAEZzrwuLn3wlpnKcJ4r2OezBeqhcWJGFxU"
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "finance_helper"
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    WEBAPP_URL: str = "https://finance-helper-pt0m.onrender.com"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
