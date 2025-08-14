import os, asyncio, json
from typing import Optional, List
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, desc, and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from dotenv import load_dotenv

from .config import get_config
from .models import Balance, PriceHistory, TradingState, BotStatus, Trade, ManualCommand
from .db import get_session
from . import crud
from .schemas import (
    BalanceOut, BotStatusOut, TradeOut, PriceSeries, PricePoint, TradingStateOut, ManualCommandIn
)

load_dotenv()
app = FastAPI(title="CryptoBot Monitor")

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def D(x) -> Decimal:
    return Decimal(str(x))

async def _latest_price(session: AsyncSession, coin: str) -> Decimal | None:
    r = await session.execute(
        select(PriceHistory.price)
        .where(PriceHistory.symbol == coin)
        .order_by(desc(PriceHistory.timestamp))
        .limit(1)
    )
    v = r.scalar_one_or_none()
    return D(v) if v is not None else None

async def _price_at_or_after(session: AsyncSession, coin: str, since: datetime) -> Decimal | None:
    r = await session.execute(
        select(PriceHistory.price)
        .where(and_(PriceHistory.symbol == coin, PriceHistory.timestamp >= since))
        .order_by(PriceHistory.timestamp)
        .limit(1)
    )
    v = r.scalar_one_or_none()
    if v is not None:
        return D(v)
    r = await session.execute(
        select(PriceHistory.price)
        .where(and_(PriceHistory.symbol == coin, PriceHistory.timestamp < since))
        .order_by(desc(PriceHistory.timestamp))
        .limit(1)
    )
    v = r.scalar_one_or_none()
    return D(v) if v is not None else None

async def get_weighted_avg_buy_price(session: AsyncSession, symbol: str) -> float | None:
    """
    Weighted average BUY price since the last SELL for `symbol`.
    Returns None if there are no BUYs in scope.
    """
    # Subquery: last SELL timestamp for this symbol
    last_sell_ts_sq = (
        select(func.max(Trade.timestamp))
        .where(and_(Trade.symbol == symbol, Trade.side == "SELL"))
        .scalar_subquery()
    )

    # WAP = sum(amount * price) / sum(amount) over BUYs after last SELL
    numerator   = func.sum(Trade.amount * Trade.price)
    denominator = func.nullif(func.sum(Trade.amount), 0)

    q = (
        select(numerator / denominator)
        .where(
            and_(
                Trade.symbol == symbol,
                Trade.side == "BUY",
                or_(last_sell_ts_sq.is_(None), Trade.timestamp > last_sell_ts_sq),
            )
        )
    )

    val = (await session.execute(q)).scalar_one_or_none()
    return None if val is None else round(float(val), 8)

async def get_last_sell_price(session: AsyncSession, symbol: str) -> Decimal | None:
    r = await session.execute(
        select(Trade.price)
        .where(and_(Trade.symbol == symbol, Trade.side == "SELL"))
        .order_by(desc(Trade.timestamp))
        .limit(1)
    )
    v = r.scalar_one_or_none()
    return D(v) if v is not None else None

@app.get("/api/coins/badges")
async def coins_badges(session: AsyncSession = Depends(get_session), lookback_hours: int = 24):
    cfg = get_config()
    enabled = [sym.upper() for sym, c in cfg.coins.items() if c.enabled]

    # balances
    res = await session.execute(select(Balance))
    bal = {b.currency.upper(): D(b.available_balance or 0) for b in res.scalars().all()}

    # trading_state: we need both total_profit AND initial_price
    res = await session.execute(select(TradingState))
    state_rows = res.scalars().all()
    profit_map = {row.symbol.upper(): (D(row.total_profit) if row.total_profit is not None else D("0"))
                  for row in state_rows}
    initial_map = {row.symbol.upper(): (D(row.initial_price) if row.initial_price is not None else None)
                   for row in state_rows}

    now = datetime.utcnow()
    since = now - timedelta(hours=lookback_hours)

    rows = []
    for coin in enabled:
        if coin == "USDC":
            continue

        amount = bal.get(coin, D("0"))
        price_now = await _latest_price(session, coin)
        price_ref_window = await _price_at_or_after(session, coin, since)

        # portfolio value & eligibility FIRST (so we can use `eligible` below)
        position_usdc = (amount * price_now) if (price_now is not None) else None
        eligible = (position_usdc is not None and position_usdc >= D("1"))

        # DCA & INITIAL
        dca_avg = await get_weighted_avg_buy_price(session, coin)
        dca_avg_D = D(dca_avg) if dca_avg is not None else None
        init_price = initial_map.get(coin)  # from trading_state fetched earlier

        sell_pct = D(cfg.coins[coin].sell_percentage) if coin in cfg.coins else D(cfg.sell_percentage)
        buy_pct  = D(cfg.coins[coin].buy_percentage)  if coin in cfg.coins else D(cfg.buy_percentage)
        rebuy_disc = D(cfg.coins[coin].rebuy_discount) if coin in cfg.coins else D("0")

        # STRICT reference: held -> DCA only; unheld -> INITIAL only
        if eligible:
            ref_price = dca_avg_D
            ref_kind = "DCA" if dca_avg_D is not None else None
        else:
            ref_price = init_price
            ref_kind = "INITIAL" if init_price is not None else None

        current_pct_from_ref = None
        if price_now is not None and ref_price not in (None, D("0")):
            current_pct_from_ref = ((price_now / ref_price) - D("1")) * D("100")

        # SELL target: only when holding AND we have DCA
        sell_target = (dca_avg_D * (D("1") + sell_pct / D("100"))) if (eligible and dca_avg_D is not None) else None

        # BUY target: only when NOT holding; base on INITIAL (fallback to current price)
        base_for_buy = init_price if (not eligible) else None
        if base_for_buy is None and not eligible:
            base_for_buy = price_now
        buy_target = (base_for_buy * (D("1") + buy_pct / D("100"))) if base_for_buy is not None else None

        # Rebuy level:
        #  - If HOLDING: dip-add below DCA
        #  - If NOT holding: re-enter below LAST SELL (if it exists)
        last_sell_price = await get_last_sell_price(session, coin)  # may be None if never sold
        base_for_rebuy = dca_avg_D if eligible else last_sell_price
        rebuy_level = (
            base_for_rebuy * (D("1") - rebuy_disc / D("100"))
            if base_for_rebuy not in (None, D("0"))
            else None
        )

        # 24h change (unchanged)
        change_24h_pct = None
        if price_now is not None and price_ref_window not in (None, D("0")):
            change_24h_pct = ((price_now / price_ref_window) - D("1")) * D("100")

        rows.append({
            "coin": coin,
            "amount": str(amount),
            "price_usdc": str(price_now) if price_now is not None else None,
            "change_24h_pct": str(change_24h_pct.quantize(D('0.01'))) if change_24h_pct is not None else None,

            "dca_avg": str(dca_avg_D) if dca_avg_D is not None else None,
            "sell_pct": str(sell_pct),
            "sell_target": str(sell_target) if sell_target is not None else None,
            "buy_pct": str(buy_pct),
            "buy_target": str(buy_target) if buy_target is not None else None,
            "rebuy_discount": str(rebuy_disc),
            "rebuy_level": str(rebuy_level) if rebuy_level is not None else None,

            "position_usdc": str(position_usdc) if position_usdc is not None else None,
            "total_profit": str(profit_map.get(coin, D("0"))),

            "ref_kind": ref_kind,
            "current_pct_from_ref": str(current_pct_from_ref.quantize(D('0.01'))) if current_pct_from_ref is not None else None,

            "eligible": eligible
        })

    return {"coins": rows}

@app.get("/api/portfolio/summary")
async def portfolio_summary(session: AsyncSession = Depends(get_session)):
    cfg = get_config()
    enabled = [sym.upper() for sym, c in cfg.coins.items() if c.enabled]

    # Balances map
    res = await session.execute(select(Balance))
    bal = {b.currency.upper(): D(b.available_balance or 0) for b in res.scalars().all()}

    usdc_available = bal.get("USDC", D("0"))

    # Helper: latest price for COIN (already in USDC)
    async def latest_usdc_price(coin: str) -> Decimal | None:
        q = (
            select(PriceHistory.price)
            .where(PriceHistory.symbol == coin)
            .order_by(desc(PriceHistory.timestamp))
            .limit(1)
        )
        r = await session.execute(q)
        v = r.scalar_one_or_none()
        return D(v) if v is not None else None

    holdings_value = D("0")
    breakdown = []

    for coin in enabled:
        if coin == "USDC":
            continue
        amount = bal.get(coin, D("0"))
        price = await latest_usdc_price(coin)  # 1 COIN = price USDC
        value = amount * price if (price is not None) else None
        if value is not None:
            holdings_value += value

        breakdown.append({
            "coin": coin,
            "amount": str(amount),
            "price_usdc": str(price) if price is not None else None,
            "value_usdc": str(value) if value is not None else None
        })

    total = usdc_available + holdings_value
    q2 = lambda x: str(x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    return {
        "usdc_available": q2(usdc_available),
        "holdings_value_usdc": q2(holdings_value),
        "total_usdc": q2(total),
        "breakdown": breakdown
    }

@app.get("/api/status", response_model=BotStatusOut | None)
async def status(session: AsyncSession = Depends(get_session)):
    s = await crud.get_status(session)
    return None if not s else BotStatusOut(id=s.id, last_trade=s.last_trade, active=s.active)

@app.get("/api/balances", response_model=List[BalanceOut])
async def balances(session: AsyncSession = Depends(get_session)):
    items = await crud.get_balances(session)
    return [BalanceOut(currency=i.currency, available_balance=i.available_balance) for i in items]

def row_to_dict(t: Trade):
    return {
        "id": t.id,
        "symbol": t.symbol,
        "side": t.side,
        "amount": float(t.amount) if t.amount is not None else None,
        "price": float(t.price) if t.price is not None else None,
        "timestamp": t.timestamp.isoformat() if t.timestamp else None,
    }

@app.get("/api/trades")
async def api_trades(
    session: AsyncSession = Depends(get_session),
    limit: int = Query(20, ge=1, le=200),
    symbol: str | None = None,   # optional filter
):
    q = select(Trade)
    if symbol:
        q = q.where(Trade.symbol == symbol.upper())
    q = q.order_by(desc(Trade.timestamp)).limit(limit)

    res = await session.execute(q)
    trades = [row_to_dict(t) for t in res.scalars().all()]
    return {"trades": trades}

@app.get("/api/price_history", response_model=PriceSeries)
async def price_history(
    symbol: str,
    hours: int = Query(24, ge=1, le=168),
    session: AsyncSession = Depends(get_session),
):
    rows = await crud.get_price_history(session, symbol=symbol, hours=hours)
    return PriceSeries(
        symbol=symbol,
        points=[PricePoint(timestamp=r.timestamp, price=float(r.price or 0)) for r in rows]
    )

@app.get("/api/state", response_model=List[TradingStateOut])
async def state(symbol: Optional[str] = None, session: AsyncSession = Depends(get_session)):
    rows = await crud.get_state(session, symbol=symbol)
    return [TradingStateOut(
        symbol=r.symbol,
        initial_price=float(r.initial_price) if r.initial_price is not None else None,
        total_trades=r.total_trades,
        total_profit=float(r.total_profit) if r.total_profit is not None else None
    ) for r in rows]

@app.post("/api/manual_commands")
async def manual_commands(cmd: ManualCommandIn, session: AsyncSession = Depends(get_session)):
    from sqlalchemy import text

    symbol = cmd.symbol.upper().strip()
    action = cmd.action.upper().strip()

    if action == "CANCEL":
        # Mark all unexecuted manual commands for this symbol as executed
        await session.execute(text("""
            UPDATE manual_commands
            SET executed = true
            WHERE symbol = :symbol
              AND executed = false
        """), {"symbol": symbol})
        await session.commit()
        return {"ok": True, "message": f"Cancelled pending commands for {symbol}"}

    # Otherwise: BUY or SELL → insert new command
    res = await session.execute(text("""
        INSERT INTO manual_commands (symbol, action, executed)
        VALUES (:symbol, :action, false)
        RETURNING id
    """), {"symbol": symbol, "action": action})

    new_id = res.scalar_one()
    await session.commit()
    return {"ok": True, "id": new_id}

# --- WebSocket live feed (polling backend, simple + reliable) ---
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active:
            self.active.remove(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(json.dumps(message, default=str))
            except WebSocketDisconnect:
                dead.append(ws)
        for d in dead:
            self.disconnect(d)

manager = ConnectionManager()

@app.get("/api/config/info")
def config_info():
    cfg = get_config()
    return {
        "name": cfg.name,
        "db_host": cfg.database.host,
        "db_port": cfg.database.port,
        "coins": sorted([s for s, c in cfg.coins.items() if c.enabled]),
    }

@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # simple handshake: client can send {"subscribe": ["USDC-EUR","BTC-EUR"]}
        subs: list[str] = []
        try:
            init = await asyncio.wait_for(websocket.receive_text(), timeout=2.0)
            payload = json.loads(init)
            subs = payload.get("subscribe", [])
        except Exception:
            subs = []

        while True:
            # lightweight poll every 2s; you can replace with LISTEN/NOTIFY later
            await asyncio.sleep(2)
            # Only fetch minimal stuff for live update
            # (status + last 10 trades + balances; limit symbols if subscribed)
            # NOTE: use a short-lived session inside loop
            async for session in get_session():
                status = await crud.get_status(session)
                trades = await crud.get_trades(session, limit=10, symbol=subs[0] if len(subs)==1 else None)
                balances = await crud.get_balances(session)
                await manager.broadcast({
                    "type": "tick",
                    "status": {
                        "active": bool(status.active) if status else False,
                        "last_trade": status.last_trade if status else "No trades yet",
                    },
                    "balances": [{"currency": b.currency, "available_balance": b.available_balance} for b in balances],
                    "trades": [{
                        "id": t.id, "symbol": t.symbol, "side": t.side, "amount": t.amount,
                        "price": t.price, "timestamp": t.timestamp
                    } for t in trades],
                })
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Serve static dashboard
app.mount("/", StaticFiles(directory="app/static", html=True), name="static")
