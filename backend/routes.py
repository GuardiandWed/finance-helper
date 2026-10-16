import calendar
import secrets
from fastapi import APIRouter, HTTPException, Query, Header, Depends
from datetime import datetime, timezone
from bson import ObjectId
from typing import List, Optional
from backend.database import get_db
from backend.config import settings
from backend.schemas import (
    AuthRequest, AuthResponse,
    CategoryCreate, CategoryResponse,
    TransactionCreate, TransactionResponse,
    StatsSummaryResponse, CategoryStat,
    PlannedPurchaseCreate, PlannedPurchaseResponse, ConvertPlanToExpenseRequest
)


# Защита API по PIN-коду: токен передаётся в заголовке X-Pin-Token
def verify_access(x_pin_token: Optional[str] = Header(None)):
    expected = settings.ACCESS_PIN.encode()
    given = (x_pin_token or "").encode()
    if not secrets.compare_digest(given, expected):
        raise HTTPException(status_code=401, detail="PIN required")

# Публичные эндпоинты (без PIN): проверка PIN и health для Keep-Alive
router = APIRouter(prefix="/api", dependencies=[Depends(verify_access)])
public_router = APIRouter(prefix="/api")

@public_router.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

# ----------------- AUTH -----------------
@public_router.post("/auth/verify", response_model=AuthResponse)
async def verify_pin(req: AuthRequest):
    if secrets.compare_digest(req.pin.strip().encode(), settings.ACCESS_PIN.encode()):
        return AuthResponse(success=True, token=settings.ACCESS_PIN, message="Доступ разрешен")
    return AuthResponse(success=False, message="Неверный PIN-код")

# ----------------- CATEGORIES -----------------
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

@router.delete("/admin/categories/{cat_id}")
async def delete_category(cat_id: str):
    db = get_db()
    try:
        obj_id = ObjectId(cat_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Неверный ID")
    res = await db.categories.delete_one({"_id": obj_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    return {"status": "ok"}

# ----------------- TRANSACTIONS -----------------
def get_period_dates(year: Optional[int], month: Optional[int], half: int = 0):
    now = datetime.now(timezone.utc)
    y = year or now.year
    m = month or now.month
    days_in_month = calendar.monthrange(y, m)[1]

    if half == 1:
        start_date = datetime(y, m, 1, 0, 0, 0, tzinfo=timezone.utc)
        end_date = datetime(y, m, 16, 0, 0, 0, tzinfo=timezone.utc)
        period_days = 15
        label = f"1-я половина (1-15)"
    elif half == 2:
        start_date = datetime(y, m, 16, 0, 0, 0, tzinfo=timezone.utc)
        if m == 12:
            end_date = datetime(y + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        else:
            end_date = datetime(y, m + 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        period_days = days_in_month - 15
        label = f"2-я половина (16-{days_in_month})"
    else:
        start_date = datetime(y, m, 1, 0, 0, 0, tzinfo=timezone.utc)
        if m == 12:
            end_date = datetime(y + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        else:
            end_date = datetime(y, m + 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        period_days = days_in_month
        label = f"Весь месяц (1-{days_in_month})"

    return start_date, end_date, period_days, label, y, m

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
async def get_transactions(
    limit: int = 100,
    year: Optional[int] = None,
    month: Optional[int] = None,
    half: int = Query(0, description="0=весь месяц, 1=1-15, 2=16-конец"),
    type: Optional[str] = None
):
    db = get_db()
    start_date, end_date, _, _, _, _ = get_period_dates(year, month, half)
    query = {"date": {"$gte": start_date, "$lt": end_date}}
    if type:
        query["type"] = type

    cursor = db.transactions.find(query).sort("date", -1).limit(limit)
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

# ----------------- STATS WITH RUNWAY & HALVES -----------------
@router.get("/stats", response_model=StatsSummaryResponse)
async def get_stats(
    year: Optional[int] = None,
    month: Optional[int] = None,
    half: int = Query(0, description="0=весь месяц, 1=1-15, 2=16-конец")
):
    db = get_db()
    start_date, end_date, period_days, period_label, y, m = get_period_dates(year, month, half)
    now = datetime.now(timezone.utc)

    # Дней прошло в данном периоде
    if now < start_date:
        days_elapsed = 0
    elif now >= end_date:
        days_elapsed = period_days
    else:
        if half == 2:
            days_elapsed = max(1, now.day - 15)
        else:
            days_elapsed = max(1, now.day)

    # Агрегация сумм расходов и доходов за период
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

    # Расчет среднего чека в день
    daily_avg = round(total_expense / days_elapsed, 2) if days_elapsed > 0 else 0.0

    # Общий накопительный баланс по всей базе (для расчета Runway - сколько дней до 0)
    all_time_pipeline = [
        {
            "$group": {
                "_id": "$type",
                "total": {"$sum": "$amount"}
            }
        }
    ]
    all_time_cursor = db.transactions.aggregate(all_time_pipeline)
    all_income = 0.0
    all_expense = 0.0
    async for it in all_time_cursor:
        if it["_id"] == "income":
            all_income += float(it["total"])
        elif it["_id"] == "expense":
            all_expense += float(it["total"])
    current_cash_balance = all_income - all_expense

    # Runway: сколько дней до исчерпания средств
    runway_days = None
    if current_cash_balance > 0 and daily_avg > 0:
        runway_days = int(current_cash_balance / daily_avg)
    elif current_cash_balance <= 0:
        runway_days = 0

    # Сумма открытых запланированных покупок
    planned_cursor = db.planned_purchases.find({"is_completed": False})
    planned_total = 0.0
    async for p in planned_cursor:
        planned_total += float(p.get("estimated_amount", 0))

    # Категории
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
        categories_breakdown.sort(key=lambda x: x.total, reverse=True)

    net_savings = round(total_income - total_expense, 2)

    return StatsSummaryResponse(
        year=y,
        month=m,
        half_period=half,
        period_label=period_label,
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        net_savings=net_savings,
        daily_average=daily_avg,
        days_in_period=period_days,
        days_elapsed=days_elapsed,
        runway_days=runway_days,
        planned_total=round(planned_total, 2),
        categories_breakdown=categories_breakdown
    )

# ----------------- PLANNED PURCHASES -----------------
@router.get("/planned-purchases", response_model=List[PlannedPurchaseResponse])
async def get_planned_purchases(status: Optional[str] = None):
    db = get_db()
    query = {}
    if status == "pending":
        query["is_completed"] = False
    elif status == "completed":
        query["is_completed"] = True
    
    cursor = db.planned_purchases.find(query).sort([("is_completed", 1), ("created_at", -1)])
    items = []
    async for doc in cursor:
        items.append(PlannedPurchaseResponse(
            id=str(doc["_id"]),
            title=doc["title"],
            estimated_amount=round(float(doc["estimated_amount"]), 2),
            category_name=doc.get("category_name", "Другое"),
            category_icon=doc.get("category_icon", "🛒"),
            priority=doc.get("priority", "medium"),
            target_month=doc.get("target_month"),
            comment=doc.get("comment", ""),
            is_completed=doc.get("is_completed", False),
            completed_at=doc.get("completed_at"),
            created_at=doc.get("created_at", datetime.now(timezone.utc))
        ))
    return items

@router.post("/planned-purchases", response_model=PlannedPurchaseResponse)
async def create_planned_purchase(item: PlannedPurchaseCreate):
    db = get_db()
    doc = item.model_dump()
    doc["is_completed"] = False
    doc["completed_at"] = None
    doc["created_at"] = datetime.now(timezone.utc)
    result = await db.planned_purchases.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return PlannedPurchaseResponse(**doc)

@router.post("/planned-purchases/{item_id}/convert-to-expense")
async def convert_plan_to_expense(item_id: str, req: ConvertPlanToExpenseRequest):
    db = get_db()
    try:
        obj_id = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Неверный ID")
    
    plan = await db.planned_purchases.find_one({"_id": obj_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Запланированная покупка не найдена")

    amount = req.actual_amount if (req.actual_amount and req.actual_amount > 0) else plan["estimated_amount"]
    comment = req.comment if req.comment else (plan.get("comment") or f"Куплено по плану: {plan['title']}")

    # 1. Создаем транзакцию расхода
    tx_doc = {
        "type": "expense",
        "amount": round(float(amount), 2),
        "category_name": plan.get("category_name", "Другое"),
        "category_icon": plan.get("category_icon", "🛒"),
        "comment": comment,
        "date": datetime.now(timezone.utc)
    }
    tx_res = await db.transactions.insert_one(tx_doc)

    # 2. Помечаем план как завершенный
    await db.planned_purchases.update_one(
        {"_id": obj_id},
        {"$set": {"is_completed": True, "completed_at": datetime.now(timezone.utc)}}
    )

    return {"status": "ok", "transaction_id": str(tx_res.inserted_id)}

@router.delete("/planned-purchases/{item_id}")
async def delete_planned_purchase(item_id: str):
    db = get_db()
    try:
        obj_id = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Неверный ID")
    res = await db.planned_purchases.delete_one({"_id": obj_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return {"status": "ok"}

# ----------------- ADMIN PANEL -----------------
@router.get("/admin/summary")
async def get_admin_summary():
    db = get_db()
    tx_count = await db.transactions.count_documents({})
    plans_count = await db.planned_purchases.count_documents({"is_completed": False})
    cats_count = await db.categories.count_documents({})
    return {
        "transactions_count": tx_count,
        "pending_plans_count": plans_count,
        "categories_count": cats_count,
        "server_time": datetime.now(timezone.utc).isoformat(),
        "keep_alive_enabled": settings.KEEP_ALIVE_ENABLED
    }

@router.get("/admin/export")
async def export_all_data():
    db = get_db()
    txs = []
    async for doc in db.transactions.find():
        doc["_id"] = str(doc["_id"])
        if isinstance(doc.get("date"), datetime):
            doc["date"] = doc["date"].isoformat()
        txs.append(doc)

    plans = []
    async for doc in db.planned_purchases.find():
        doc["_id"] = str(doc["_id"])
        if isinstance(doc.get("created_at"), datetime):
            doc["created_at"] = doc["created_at"].isoformat()
        if isinstance(doc.get("completed_at"), datetime):
            doc["completed_at"] = doc["completed_at"].isoformat()
        plans.append(doc)

    return {"transactions": txs, "planned_purchases": plans}
