# stock_metadata.py

STOCK_METADATA = {
    "RELIANCE": {"name": "Reliance Industries Ltd.", "sector": "Oil & Gas"},
    "TCS": {"name": "Tata Consultancy Services Ltd.", "sector": "IT"},
    "INFY": {"name": "Infosys Ltd.", "sector": "IT"},
    "HDFCBANK": {"name": "HDFC Bank Ltd.", "sector": "Financial Services"},
    "ICICIBANK": {"name": "ICICI Bank Ltd.", "sector": "Financial Services"},
    "SBIN": {"name": "State Bank of India", "sector": "Financial Services"},
    "LT": {"name": "Larsen & Toubro Ltd.", "sector": "Construction"},
    "ITC": {"name": "ITC Ltd.", "sector": "FMCG"},
    "AXISBANK": {"name": "Axis Bank Ltd.", "sector": "Financial Services"},
    "MARUTI": {"name": "Maruti Suzuki India Ltd.", "sector": "Automobile"},
    "BHARTIARTL": {"name": "Bharti Airtel Ltd.", "sector": "Telecommunication"},
    "KOTAKBANK": {"name": "Kotak Mahindra Bank Ltd.", "sector": "Financial Services"},
    "HCLTECH": {"name": "HCL Technologies Ltd.", "sector": "IT"},
    "BAJFINANCE": {"name": "Bajaj Finance Ltd.", "sector": "Financial Services"},
    "ASIANPAINT": {"name": "Asian Paints Ltd.", "sector": "Consumer Durables"},
    "SUNPHARMA": {"name": "Sun Pharmaceutical Industries Ltd.", "sector": "Healthcare"},
    "ULTRACEMCO": {"name": "UltraTech Cement Ltd.", "sector": "Construction Materials"},
    "TITAN": {"name": "Titan Company Ltd.", "sector": "Consumer Durables"},
    "POWERGRID": {"name": "Power Grid Corporation of India Ltd.", "sector": "Utilities"},
    "NTPC": {"name": "NTPC Ltd.", "sector": "Utilities"},
    "ONGC": {"name": "Oil & Natural Gas Corporation Ltd.", "sector": "Oil & Gas"},
    "JSWSTEEL": {"name": "JSW Steel Ltd.", "sector": "Metals & Mining"},
    "TATASTEEL": {"name": "Tata Steel Ltd.", "sector": "Metals & Mining"},
    "ADANIPORTS": {"name": "Adani Ports & Special Economic Zone Ltd.", "sector": "Services"},
    "HINDALCO": {"name": "Hindalco Industries Ltd.", "sector": "Metals & Mining"},
    "COALINDIA": {"name": "Coal India Ltd.", "sector": "Metals & Mining"},
    "WIPRO": {"name": "Wipro Ltd.", "sector": "IT"},
    "TECHM": {"name": "Tech Mahindra Ltd.", "sector": "IT"},
    "INDUSINDBK": {"name": "IndusInd Bank Ltd.", "sector": "Financial Services"},
    "BAJAJFINSV": {"name": "Bajaj Finserv Ltd.", "sector": "Financial Services"},
    "PFC": {"name": "Power Finance Corporation Ltd.", "sector": "Financial Services"},
    "GRASIM": {"name": "Grasim Industries Ltd.", "sector": "Materials"},
    "EICHERMOT": {"name": "Eicher Motors Ltd.", "sector": "Automobile"},
    "HEROMOTOCO": {"name": "Hero MotoCorp Ltd.", "sector": "Automobile"},
    "M&M": {"name": "Mahindra & Mahindra Ltd.", "sector": "Automobile"},
    "CIPLA": {"name": "Cipla Ltd.", "sector": "Healthcare"},
    "DRREDDY": {"name": "Dr. Reddy's Laboratories Ltd.", "sector": "Healthcare"},
    "NESTLEIND": {"name": "Nestle India Ltd.", "sector": "FMCG"},
    "BRITANNIA": {"name": "Britannia Industries Ltd.", "sector": "FMCG"},
    "APOLLOHOSP": {"name": "Apollo Hospitals Enterprise Ltd.", "sector": "Healthcare"},
    "DIVISLAB": {"name": "Divi's Laboratories Ltd.", "sector": "Healthcare"},
    "SHRIRAMFIN": {"name": "Shriram Finance Ltd.", "sector": "Financial Services"},
    "TATAMOTORS": {"name": "Tata Motors Ltd.", "sector": "Automobile"},
    "BEL": {"name": "Bharat Electronics Ltd.", "sector": "Capital Goods"},
    "TRENT": {"name": "Trent Ltd.", "sector": "Consumer Services"},
    "ADANIENT": {"name": "Adani Enterprises Ltd.", "sector": "Metals & Mining"},
    "HDFCLIFE": {"name": "HDFClife Insurance Co. Ltd.", "sector": "Financial Services"},
    "SBILIFE": {"name": "SBI Life Insurance Co. Ltd.", "sector": "Financial Services"},
    "PIDILITIND": {"name": "Pidilite Industries Ltd.", "sector": "Chemicals"},
    "DLF": {"name": "DLF Ltd.", "sector": "Realty"},
}

def get_stock_metadata(symbol: str) -> dict:
    """Return name and sector for a stock symbol, with fallbacks."""
    metadata = STOCK_METADATA.get(symbol.upper())
    if metadata:
        return metadata
    
    # Sensible defaults for missing symbols
    name = symbol.title() + " Ltd."
    return {"name": name, "sector": "Diversified"}
