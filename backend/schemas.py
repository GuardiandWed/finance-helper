from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class AuthRequest(BaseModel):
    pin: str

class AuthResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    message: Optional[str] = None

class CategoryBase(BaseModel):
    name: str
    type: str = Field(description="'expense' или 'income'")
    icon: str = "💰"
    color: Optional[str] = "#3B82F6"

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: str

class TransactionCreate(BaseModel):
    type: str = Field(description="'expense' или 'income'")
    amount: float = Field(gt=0, description="Сумма в EUR")
    category_name: str
    category_icon: str = "💰"
    comment: Optional[str] = ""
    date: Optional[datetime] = None

class TransactionResponse(BaseModel):
    id: str
    type: str
    amount: float
    category_name: str
    category_icon: str
    comment: Optional[str] = ""
    date: datetime

class CategoryStat(BaseModel):
    category_name: str
    category_icon: str
    total: float
    percentage: float

class StatsSummaryResponse(BaseModel):
    year: int
    month: int
    half_period: int  # 0 = весь месяц, 1 = 1-15, 2 = 16-конец
    period_label: str
    total_income: float
    total_expense: float
    net_savings: float
    daily_average: float
    days_in_period: int
    days_elapsed: int
    runway_days: Optional[int] = None  # Примерное количество дней до истраты всех денег
    planned_total: float = 0.0         # Сумма запланированных покупок
    categories_breakdown: List[CategoryStat]

# Планирование покупок (Planned Purchases / Wishlist)
class PlannedPurchaseCreate(BaseModel):
    title: str = Field(min_length=1, description="Название товара/услуги")
    estimated_amount: float = Field(gt=0, description="Ориентировочная сумма в EUR")
    category_name: str
    category_icon: str = "🛒"
    priority: str = Field(default="medium", description="'high', 'medium', 'low'")
    target_month: Optional[str] = None # 'YYYY-MM'
    comment: Optional[str] = ""

class PlannedPurchaseResponse(BaseModel):
    id: str
    title: str
    estimated_amount: float
    category_name: str
    category_icon: str
    priority: str
    target_month: Optional[str] = None
    comment: Optional[str] = ""
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    created_at: datetime

class ConvertPlanToExpenseRequest(BaseModel):
    actual_amount: Optional[float] = None
    comment: Optional[str] = None
