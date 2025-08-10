from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

class BalanceOut(BaseModel):
    currency: str
    available_balance: Optional[float] = None

class BotStatusOut(BaseModel):
    id: int
    last_trade: Optional[str] = None
    active: Optional[bool] = False

class TradeOut(BaseModel):
    id: int
    symbol: Optional[str]
    side: Optional[str]
    amount: Optional[float]
    price: Optional[float]
    timestamp: Optional[datetime]

class PricePoint(BaseModel):
    timestamp: datetime
    price: float

class PriceSeries(BaseModel):
    symbol: str
    points: List[PricePoint]

class TradingStateOut(BaseModel):
    symbol: str
    initial_price: Optional[float] = None
    total_trades: Optional[int] = None
    total_profit: Optional[float] = None

class ManualCommandIn(BaseModel):
    symbol: str
    action: str
    amount: Optional[float] = None
