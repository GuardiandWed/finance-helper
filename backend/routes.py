from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone
from bson import ObjectId
from typing import List, Optional
from backend.database import get_db
from backend.schemas import (
    CategoryCreate, CategoryResponse,
    TransactionCreate, TransactionResponse,
    StatsSummaryResponse, CategoryStat
)

router = APIRouter(prefix="/api")

@router.get("/categories", response_model=List[CategoryResponse])
async def get_categories(type: Optional[str] = None):
    db = get_db()
    query = {}
    if type:
        query["type"] = type
    cursor = db.categories.find(query)
    categories = []
    async for doc in cursor:
        categories.append(CategoryResponse(
            id=str(doc["_id"]),
            name=doc["name"],
            type=doc["type"],
            icon=doc.get("icon", "💰"),
            color=doc.get("color", "#3B82F6")
        ))
    return categories

@router.post("/categories", response_model=CategoryResponse)
async def create_category(cat: CategoryCreate):
    db = get_db()
    # Проверка на дубликат имени
    existing = await db.categories.find_one({"name": cat.name, "type": cat.type})
    if existing:
        return CategoryResponse(
            id=str(existing["_id"]),
            name=existing["name"],
            type=existing["type"],
            icon=existing.get("icon", "💰"),
            color=existing.get("color", "#3B82F6")
        )
    result = await db.categories.insert_one(cat.model_dump())
    return CategoryResponse(
        id=str(result.inserted_id),
        name=cat.name,
        type=cat.type,
        icon=cat.icon,
        color=cat.color
    )

@router.post("/transactions", response_model=TransactionResponse)
async def create_transaction(item: TransactionCreate):
    db = get_db()
    tx_data = item.model_dump()
    if not tx_data.get("date"):
        tx_data["date"] = datetime.now(timezone.utc)
    result = await db.transactions.insert_one(tx_data)
    return TransactionResponse(
        id=str(result.inserted_id),
        type=tx_data["type"],
        amount=tx_data["amount"],
        category_name=tx_data["category_name"],
        category_icon=tx_data["category_icon"],
        comment=tx_data.get("comment", ""),
        date=tx_data["date"]
    )

@router.get("/transactions", response_model=List[TransactionResponse])
async def get_transactions(limit: int = 50):
    db = get_db()
    cursor = db.transactions.find().sort("date", -1).limit(limit)
    txs = []
    async for doc in cursor:
        txs.append(TransactionResponse(
            id=str(doc["_id"]),
            type=doc["type"],
            amount=round(float(doc["amount"]), 2),
            category_name=doc["category_name"],
            category_icon=doc.get("category_icon", "💰"),
            comment=doc.get("comment", ""),
            date=doc["date"]
        ))
    return txs

@router.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str):
    db = get_db()
    try:
        obj_id = ObjectId(tx_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Неверный ID")
    res = await db.transactions.delete_one({"_id": obj_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Транзакция не найдена")
    return {"status": "ok"}

@router.get("/stats", response_model=StatsSummaryResponse)
async def get_stats(year: Optional[int] = None, month: Optional[int] = None):
    db = get_db()
    now = datetime.now(timezone.utc)
    target_year = year or now.year
    target_month = month or now.month

    # Диапазон дат для месяца
    start_date = datetime(target_year, target_month, 1, 0, 0, 0, tzinfo=timezone.utc)
    if target_month == 12:
        end_date = datetime(target_year + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        end_date = datetime(target_year, target_month + 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    # Агрегация сумм расходов и доходов
    pipeline = [
        {"$match": {"date": {"$gte": start_date, "$lt": end_date}}},
        {
            "$group": {
                "_id": {
                    "type": "$type",
                    "category_name": "$category_name",
                    "category_icon": "$category_icon"
                },
                "total": {"$sum": "$amount"}
            }
        }
    ]
    cursor = db.transactions.aggregate(pipeline)
    
    total_income = 0.0
    total_expense = 0.0
    expense_categories = {}

    async for item in cursor:
        tx_type = item["_id"]["type"]
        cat_name = item["_id"]["category_name"]
        cat_icon = item["_id"].get("category_icon", "💰")
        amt = float(item["total"])

        if tx_type == "income":
            total_income += amt
        elif tx_type == "expense":
            total_expense += amt
            expense_categories[cat_name] = {
                "icon": cat_icon,
                "total": amt
            }

    # Расчет процентов по категориям расходов
    categories_breakdown = []
    if total_expense > 0:
        for name, data in expense_categories.items():
            percentage = round((data["total"] / total_expense) * 100, 1)
            categories_breakdown.append(CategoryStat(
                category_name=name,
                category_icon=data["icon"],
                total=round(data["total"], 2),
                percentage=percentage
            ))
        # Сортировка по убыванию трат
        categories_breakdown.sort(key=lambda x: x.total, reverse=True)

    return StatsSummaryResponse(
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        net_savings=round(total_income - total_expense, 2),
        categories_breakdown=categories_breakdown
    )
