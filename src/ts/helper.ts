import { symbol } from "d3";
import { getHistoricalData } from "./api";
import { OHLCVData, SMAData, StockQuote } from "./types";

function calculateSMA(data: OHLCVData[], period: number, priceKey: keyof OHLCVData = 'close'): SMAData[] {
    if (period <= 0 || !data || data.length < period) {
        return []; // Not enough data to calculate SMA
    }

    const smaValues: SMAData[] = [];
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
        // Add the current data point's price to the sum
        // Ensure priceKey is a number or can be converted
        const currentPrice = typeof data[i][priceKey] === 'number' ? (data[i][priceKey] as number) : parseFloat(String(data[i][priceKey]));
        sum += currentPrice;

        // If we have enough data points for the current period
        if (i >= period - 1) {
            const sma = sum / period;
            smaValues.push({
                date: data[i].date, // The date corresponds to the *end* of the period
                value: sma
            });

            // Subtract the price of the oldest data point in the window
            // for the next iteration (sliding window approach)
            const oldestPrice = typeof data[i - (period - 1)][priceKey] === 'number' ? (data[i - (period - 1)][priceKey] as number) : parseFloat(String(data[i - (period - 1)][priceKey]));
            sum -= oldestPrice;
        }
    }

    return smaValues;
}

function getDataDateInterval(timeframe: string): number {
    let mins = 1;
    switch (timeframe) {
        case "1day":
            mins = 5; // 5 mins 
            break;
        case "1month":
        case "3months":
            mins = 12; // 1 hour 
            break;
        case "1year":
            mins = 12 * 7 * 24; // Weekly
            break;
        case "5years":
        case "all":
            mins = 12 * 30 * 24; // Monthly
            break;
        default:
            break;
    }
    return mins
}

function parseAlphaVantageData(data: any, timeframe: string): OHLCVData[] {
    let timeSeriesKey: string;

    switch (timeframe) {
        case "1day":
            timeSeriesKey = "Time Series (60min)";
            break;
        case "1month":
            timeSeriesKey = "Time Series (60min)";
            break;
        case "1year":
        case "3months":
            timeSeriesKey = "Weekly Time Series";
            break;
        case "5years":
        case "all":
            timeSeriesKey = "Monthly Time Series";
            break;
        default:
            throw new Error("Invalid timeframe");
    }

    const timeSeries = data[timeSeriesKey];
    const parsedData: OHLCVData[] = [];

    for (const date in timeSeries) {
        parsedData.push({
            date: new Date(date),
            open: parseFloat(timeSeries[date]["1. open"]),
            high: parseFloat(timeSeries[date]["2. high"]),
            low: parseFloat(timeSeries[date]["3. low"]),
            close: parseFloat(timeSeries[date]["4. close"]),
            volume: parseInt(timeSeries[date]["5. volume"]),
        });
    }

    return parsedData.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function filterDataByTimeframe(data: OHLCVData[], timeframe: string): OHLCVData[] {
    let lastDate = data[data.length - 1].date
    const now = lastDate;

    let cutoffDate: Date;

    switch (timeframe) {
        case "1day":
            cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
            break;
        case "1month":
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
            break;
        case "3months":
            cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
            break;
        case "1year":
            cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // 365 days ago
            break;
        case "5years":
            cutoffDate = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000); // 5 years ago
            break;
        case "all":
            return data; // No filtering
        default:
            throw new Error("Invalid timeframe");
    }

    return data.filter((item) => item.date >= cutoffDate);
}

async function getMockData(timeframe: string) {
    let fileName = 'day5min.json'
    switch (timeframe) {
        case "1day":
            fileName = "day60min.json";
            break;
        case "1month":
            fileName = "2year60min.json";
            break;
        case "3months":
        case "1year":
            fileName = "weekly.json";
            break;
        case "5years":
        case "all":
            fileName = "monthly.json";
            break;
        default:
            throw new Error("Invalid timeframe");
    }

    const response = await fetch(`/mock/${fileName}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: OHLCVData[] = await response.json();
    return data;
}

// Generate mock historical data (1-hour intervals)
async function generateHistoricalData(symbol: string, timeframe: string, USE_MOCK_DATA: boolean): Promise<OHLCVData[]> {
    try {
        const apiData = USE_MOCK_DATA ? await getMockData(timeframe) : await getHistoricalData(timeframe, symbol)
        let parsedData = parseAlphaVantageData(apiData, timeframe)
        let data = filterDataByTimeframe(parsedData, timeframe);
        return data;
    } catch (error) {
        console.error('Error generating historical data:', error);
        throw error;
    }
}

function getPeriodLabel(timeframe: string) {
    let label: string = '';

    switch (timeframe) {
        case "1day":
            label = "1 day";
            break;
        case "1month":
            label = "1 month";
            break;
        case "3months":
            label = "3 month";
            break;
        case "1year":
            label = "1 year";
            break;
        case "5years":
            label = "5 years";
            break;
    }

    return label;
}

function getStockImgUrl(symbol:string) {
    switch (symbol) {
        case 'AAPL':
            return 'https://s3-symbol-logo.tradingview.com/apple--big.svg'
        case 'GOOGL':
            return 'https://s3-symbol-logo.tradingview.com/alphabet--big.svg'
        case 'MSFT':
            return 'https://s3-symbol-logo.tradingview.com/microsoft--big.svg'
        default:
            return '';
    }
}

export { calculateSMA, getDataDateInterval, generateHistoricalData, getPeriodLabel, getStockImgUrl }