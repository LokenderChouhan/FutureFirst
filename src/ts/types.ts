// Interfaces
export interface OHLCVData {
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}


export interface SMAData {
    date: Date;
    value: number;
}

export type StockQuote = {
    '01. symbol': string;
    '05. price': string;
    '09. change': string;
    '10. change percent': string;
};

export type AlphaVantageQuoteResponse = {
    'Global Quote'?: StockQuote;
    'Error Message'?: string;
    'Note'?: string;
};

export type StockCardElement = {
    element: HTMLElement;
    currentPrice: HTMLElement;
    priceChange: HTMLElement;
    percentChange: HTMLElement;
    lastPrice: number | null;
};