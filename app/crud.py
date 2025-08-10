from typing import List, Optional
from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from .models import Balance, BotStatus, Trade, PriceHistory, TradingState, ManualCommand

async def get_status(session: AsyncSession) -> BotStatus | None:
    res = await session.execute(select(BotStatus).order_by(desc(BotStatus.id)).limit(1))
    return res.scalar_one_or_none()

async def get_balances(session: AsyncSession) -> List[Balance]:
    res = await session.execute(select(Balance).order_by(Balance.currency))
    return list(res.scalars().all())

async def get_trades(session: AsyncSession, limit: int = 50, symbol: Optional[str] = None) -> List[Trade]:
    stmt = select(Trade).order_by(desc(Trade.timestamp)).limit(limit)
    if symbol:
        stmt = select(Trade).where(Trade.symbol == symbol).order_by(desc(Trade.timestamp)).limit(limit)
    res = await session.execute(stmt)
    return list(res.scalars().all())

async def get_price_history(session: AsyncSession, symbol: str, hours: int = 24) -> List[PriceHistory]:
    since = datetime.utcnow() - timedelta(hours=hours)
    stmt = (
        select(PriceHistory)
        .where(and_(PriceHistory.symbol == symbol, PriceHistory.timestamp >= since))
        .order_by(PriceHistory.timestamp)
    )
    res = await session.execute(stmt)
    return list(res.scalars().all())

async def get_state(session: AsyncSession, symbol: Optional[str] = None) -> List[TradingState]:
    stmt = select(TradingState)
    if symbol:
        stmt = stmt.where(TradingState.symbol == symbol)
    res = await session.execute(stmt.order_by(TradingState.symbol))
    return list(res.scalars().all())

async def insert_manual_command(session: AsyncSession, symbol: str, action: str, amount: Optional[float]):
    cmd = ManualCommand(symbol=symbol, action=action, amount=amount)
    session.add(cmd)
    await session.commit()
    await session.refresh(cmd)
    return cmd
