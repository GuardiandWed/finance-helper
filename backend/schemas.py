from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

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
    total_income: float
    total_expense: float
    net_savings: float
    categories_breakdown: List[CategoryStat]
