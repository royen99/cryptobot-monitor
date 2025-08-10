from sqlalchemy import Boolean, Integer, Text, Numeric, Float, TIMESTAMP, Column
from .db import Base

class Balance(Base):
    __tablename__ = "balances"
    currency = Column(Text, primary_key=True)
    available_balance = Column(Float, nullable=True)

class BotStatus(Base):
    __tablename__ = "bot_status"
    id = Column(Integer, primary_key=True)
    last_trade = Column(Text, nullable=True)
    active = Column(Boolean, default=False)

class ManualCommand(Base):
    __tablename__ = "manual_commands"
    id = Column(Integer, primary_key=True)
    symbol = Column(Text, nullable=False)
    action = Column(Text, nullable=False)       # e.g., BUY / SELL / CANCEL
    amount = Column(Float, nullable=True)
    timestamp = Column(TIMESTAMP, nullable=True)
    executed = Column(Boolean, nullable=True)

class PriceHistory(Base):
    __tablename__ = "price_history"
    symbol = Column(Text, primary_key=True)
    timestamp = Column(TIMESTAMP, primary_key=True)
    price = Column(Numeric, nullable=True)

class Trade(Base):
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True)
    symbol = Column(Text, nullable=True)
    side = Column(Text, nullable=True)          # BUY / SELL
    amount = Column(Float, nullable=True)
    price = Column(Float, nullable=True)
    timestamp = Column(TIMESTAMP, nullable=True)

class TradingState(Base):
    __tablename__ = "trading_state"
    symbol = Column(Text, primary_key=True)
    initial_price = Column(Numeric, nullable=True)
    total_trades = Column(Integer, nullable=True)
    total_profit = Column(Numeric, nullable=True)
