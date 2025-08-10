import os, json
from functools import lru_cache
from typing import Dict, Optional
from pydantic import BaseModel, Field, PositiveInt, validator

class TelegramCfg(BaseModel):
    enabled: bool = False
    bot_token: str = ""
    chat_id: Optional[int] = None

class DatabaseCfg(BaseModel):
    host: str
    port: PositiveInt = 5432
    name: str
    user: str
    password: str

    def as_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.user}:{self.password}"
            f"@{self.host}:{self.port}/{self.name}"
        )

class PrecisionCfg(BaseModel):
    price: int = 2
    amount: int = 6

class MinOrderSizesCfg(BaseModel):
    buy: float
    sell: float

class CoinCfg(BaseModel):
    enabled: bool = True
    buy_percentage: float
    sell_percentage: float
    rebuy_discount: float
    volatility_window: PositiveInt
    trend_window: PositiveInt
    macd_short_window: PositiveInt
    macd_long_window: PositiveInt
    macd_signal_window: PositiveInt
    rsi_period: PositiveInt
    trail_percent: float = 1
    min_order_sizes: MinOrderSizesCfg
    precision: PrecisionCfg

class AppCfg(BaseModel):
    name: str = ""
    privateKey: str = ""                 # keep in Secret in k8s
    trade_percentage: float = 100
    buy_percentage: float = 10
    sell_percentage: float = 100
    buy_offset_percent: float = -0.2
    sell_offset_percent: float = 0.2
    stop_loss_percentage: float = -50
    trail_percent: float = 1
    telegram: TelegramCfg = TelegramCfg()
    database: DatabaseCfg
    coins: Dict[str, CoinCfg] = Field(default_factory=dict)

    @validator("coins")
    def at_least_one_coin(cls, v):
        if not v:
            raise ValueError("coins must define at least one symbol")
        return v

@lru_cache(maxsize=1)
def get_config() -> AppCfg:
    path = os.getenv("CONFIG_PATH", "/config/config.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Optional ENV overrides so ops can swap creds without touching the file
    db = data.setdefault("database", {})
    for k, env in {
        "host": "DB_HOST",
        "port": "DB_PORT",
        "name": "DB_NAME",
        "user": "DB_USER",
        "password": "DB_PASSWORD",
    }.items():
        if os.getenv(env):
            db[k] = os.getenv(env) if k != "port" else int(os.getenv(env))

    return AppCfg(**data)
