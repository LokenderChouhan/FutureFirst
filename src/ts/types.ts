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

export type Margin = {
    left: number
    top: number,
    right: number,
    bottom: number
}

export type LineCords = [
    [number, number],
    [number, number]
]

export type TrendingLineData = {
    id: string,
    isFree: boolean,
    isHz: boolean,
    startPrice: number,
    endPrice: number,
    startDate: Date,
    endDate: Date,

    line: d3.Selection<SVGLineElement, unknown, HTMLElement, any>,
    startCircle?: d3.Selection<SVGCircleElement, unknown, HTMLElement, any>,
    endCircle?: d3.Selection<SVGCircleElement, unknown, HTMLElement, any>,
    priceHighlightRect: AxisTrendingLineHighlightRect,
    dateHighlightRect: AxisTrendingLineHighlightRect,
}


export type AxisTrendingLineHighlightRect = {
    coverRect: d3.Selection<SVGRectElement, unknown, HTMLElement, any>,
    startRect: d3.Selection<SVGRectElement, unknown, HTMLElement, any>,
    endRect: d3.Selection<SVGRectElement, unknown, HTMLElement, any>,
    startText: d3.Selection<SVGTextElement, unknown, HTMLElement, any>,
    endText: d3.Selection<SVGTextElement, unknown, HTMLElement, any>,
}

export type IntervalSelectOption = {
    label: string,
    value: Interval
}

export type TrendingLineType = "diagTrendingLine" | "hzTrendingLine"
export type ChartType = "line" | "candlestick";
export type Timeframe = "1day" | "1month" | "3months" | "1year" | "5years";
export type Interval = "1min" | "5min" | "1hr" | "1day" | '1week';
