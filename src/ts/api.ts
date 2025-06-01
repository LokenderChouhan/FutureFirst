import { OHLCVData } from "./types";
import { ALPHA_VANTAGE_KEY as API_KEY, ALPHA_VANTAGE_BASE_URL as BASE_URL } from '../config';

const getTimeframeSearchQuery = (timeframe: string) => {
    switch (timeframe) {
        case "1day":
            // Standard intraday for a single day, 60min interval
            return `function=TIME_SERIES_INTRADAY&interval=60min`;
        case "1month":
            // For longer intraday views, use TIME_SERIES_INTRADAY with 60min and full outputsize
            // This will give up to ~2 years of 60min data.
            return `function=TIME_SERIES_INTRADAY&interval=60min&outputsize=full`;
        case "3months":
        case "1year":
            // No 'interval' parameter for WEEKLY. This will return one data point per week.
            return `function=TIME_SERIES_WEEKLY`;
        case "5years":
        case "all":
            // No 'interval' parameter for MONTHLY. This will return one data point per month.
            return `function=TIME_SERIES_MONTHLY`;
        default:
            throw new Error("Invalid timeframe");
    }
}

async function getHistoricalData(timeframe: string, symbol: string) {
    // In a real app, you would fetch from Alpha Vantage API
    const response = await fetch(`${BASE_URL}?${getTimeframeSearchQuery(timeframe)}&symbol=${symbol}&apikey=${API_KEY}`);
    const apiData: OHLCVData[] = await response.json();
    return apiData;
}

// Fetch stock data from Alpha Vantage
async function fetchStockData(symbol: string) {
    try {
        const response = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`
        );
        const data = await response.json();

        if (data['Error Message']) {
            console.error(`Error fetching ${symbol}:`, data['Error Message']);
            return null;
        }

        return data['Global Quote'];
    } catch (error) {
        console.error(`Error fetching ${symbol}:`, error);
        return null;
    }
}

export { getHistoricalData, fetchStockData }