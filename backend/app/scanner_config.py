"""
scanner_config.py

Central configuration for Options Pulse Tracker.
Change scanner behaviour from here without touching business logic.
"""

# ---------------------------------------------------
# INDEX SYMBOLS
# ---------------------------------------------------

INDEX_SYMBOLS = [

    "NIFTY",

    "BANKNIFTY",

    "FINNIFTY",

    "MIDCPNIFTY",

    "SENSEX",

]

# ---------------------------------------------------
# TOP 50 F&O STOCKS
# ---------------------------------------------------

TOP_50_STOCKS = [

    "RELIANCE",
    "TCS",
    "INFY",
    "HDFCBANK",
    "ICICIBANK",
    "SBIN",
    "LT",
    "ITC",
    "AXISBANK",
    "MARUTI",
    "BHARTIARTL",
    "KOTAKBANK",
    "HCLTECH",
    "BAJFINANCE",
    "ASIANPAINT",
    "SUNPHARMA",
    "ULTRACEMCO",
    "TITAN",
    "POWERGRID",
    "NTPC",
    "ONGC",
    "JSWSTEEL",
    "TATASTEEL",
    "ADANIPORTS",
    "HINDALCO",
    "COALINDIA",
    "WIPRO",
    "TECHM",
    "INDUSINDBK",
    "BAJAJFINSV",
    "PFC",
    "GRASIM",
    "EICHERMOT",
    "HEROMOTOCO",
    "M&M",
    "CIPLA",
    "DRREDDY",
    "NESTLEIND",
    "BRITANNIA",
    "APOLLOHOSP",
    "DIVISLAB",
    "SHRIRAMFIN",
    "TATAMOTORS",
    "BEL",
    "TRENT",
    "ADANIENT",
    "HDFCLIFE",
    "SBILIFE",
    "PIDILITIND",
    "DLF",

]

ALL_FNO_STOCKS = []


# ---------------------------------------------------
# SCANNER SETTINGS
# ---------------------------------------------------

# Number of strikes on each side of ATM

INDEX_STRIKE_RANGE = 10

STOCK_STRIKE_RANGE = 2

TOP_RESULTS = 50

REFRESH_SECONDS = 10

QUOTE_BATCH_SIZE = 50

MAX_PARALLEL_REQUESTS = 8

MAX_RETRIES = 3

CURRENT_WEEKLY_ONLY = True

CURRENT_MONTHLY_ONLY = True

# ---------------------------------------------------
# FILTERS
# ---------------------------------------------------

MIN_VOLUME_RATIO = 1.5

MIN_OI_CHANGE = 0

# ---------------------------------------------------
# SMART SCORE
# ---------------------------------------------------

VOLUME_WEIGHT = 40

OI_WEIGHT = 30

PRICE_WEIGHT = 15

IV_WEIGHT = 10

SPREAD_WEIGHT = 5

# ---------------------------------------------------
# FEATURES
# ---------------------------------------------------

ENABLE_INDEX_TAB = True

ENABLE_STOCK_TAB = True

ENABLE_ALL_TAB = True

ENABLE_WATCHLIST = True

ENABLE_ALERTS = True
