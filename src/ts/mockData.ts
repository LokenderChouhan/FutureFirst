import { Interval, OHLCVData, Timeframe } from "./types";

export function generateMockOHLCV(
    timeframe: Timeframe,
    interval: Interval,
    basePrice: number = 100,
    volatility: number = 0.02
): OHLCVData[] {
    // Calculate start and end dates based on timeframe
    const endDate = new Date();
    let startDate = new Date();

    switch (timeframe) {
        case "1day":
            startDate.setDate(endDate.getDate() - 1);
            break;
        case "1month":
            startDate.setMonth(endDate.getMonth() - 1);
            break;
        case "3months":
            startDate.setMonth(endDate.getMonth() - 3);
            break;
        case "1year":
            startDate.setFullYear(endDate.getFullYear() - 1);
            break;
        case "5years":
            startDate.setFullYear(endDate.getFullYear() - 5);
            break;
    }

    // Calculate number of intervals
    const totalMilliseconds = endDate.getTime() - startDate.getTime();
    let intervalMilliseconds: number;

    switch (interval) {
        case "1min":
            intervalMilliseconds = 60 * 1000;
            break;
        case "5min":
            intervalMilliseconds = 5 * 60 * 1000;
            break;
        case "1hr":
            intervalMilliseconds = 60 * 60 * 1000;
            break;
        case "1day":
            intervalMilliseconds = 24 * 60 * 60 * 1000;
            break;
        case "1week":
            intervalMilliseconds = 7 * 24 * 60 * 60 * 1000;
            break;
    }

    const numIntervals = Math.ceil(totalMilliseconds / intervalMilliseconds);

    // Generate data
    const data: OHLCVData[] = [];
    let currentPrice = basePrice;

    for (let i = 0; i < numIntervals; i++) {
        const date = new Date(startDate.getTime() + i * intervalMilliseconds);

        // Random price movement
        const changePercent = (2 * Math.random() - 1) * volatility;
        const newPrice = currentPrice * (1 + changePercent);

        // Generate OHLC values with some intra-interval variation
        const open = currentPrice;
        const close = newPrice;
        const maxChange = Math.abs(changePercent) * 1.5; // Allow more variation for high/low
        const high = Math.max(open, close) * (1 + Math.random() * maxChange / 2);
        const low = Math.min(open, close) * (1 - Math.random() * maxChange / 2);

        // Generate volume (higher when price moves more)
        const volume = Math.round(Math.abs(changePercent) * 1e6 * (0.8 + Math.random() * 0.4));

        data.push({
            date,
            open,
            high,
            low,
            close,
            volume
        });

        currentPrice = close;
    }

    return data;
}

export function generateNextMockOHLCV(
    lastDataPoint: OHLCVData,
    afterMs: number, // next date
    volatility: number = 0.02,
): OHLCVData {

    // Generate data
    let currentPrice = lastDataPoint.close;

    const date = new Date(lastDataPoint.date.getTime() + afterMs);

    // Random price movement
    const changePercent = (2 * Math.random() - 1) * volatility;
    const newPrice = currentPrice * (1 + changePercent);

    // Generate OHLC values with some intra-interval variation
    const open = currentPrice;
    const close = newPrice;
    const maxChange = Math.abs(changePercent) * 1.5; // Allow more variation for high/low
    const high = Math.max(open, close) * (1 + Math.random() * maxChange / 2);
    const low = Math.min(open, close) * (1 - Math.random() * maxChange / 2);

    // Generate volume (higher when price moves more)
    const volume = Math.round(Math.abs(changePercent) * 1e6 * (0.8 + Math.random() * 0.4));

    return ({
        date,
        open,
        high,
        low,
        close,
        volume
    });

}