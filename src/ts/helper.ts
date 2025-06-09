import { Interval, IntervalSelectOption, OHLCVData, SMAData } from "./types";

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

function getAvailableInterval(timeframe: string): IntervalSelectOption[] {

    let min1: IntervalSelectOption = { value: "1min", label: "1 min" }
    let min5: IntervalSelectOption = { value: "5min", label: "5 min" }
    let ahr: IntervalSelectOption = { value: "1hr", label: "1 Hr" }
    let aDay: IntervalSelectOption = { value: "1day", label: "1 Day" }
    let aWeek: IntervalSelectOption = { value: "1week", label: "1 Week" }

    switch (timeframe) {
        case '1day':
            return [min1, min5, ahr]
        case '1month':
            return [min5, ahr, aDay]
        case '3months':
            return [ahr, aDay, aWeek]
        case '1year':
        case '5years':
            return [aDay, aWeek]
        default:
            return [];
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

function getStockImgUrl(symbol: string) {
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

function getNumInterval(interval: Interval, ms: number): number {
    let msInMin = 60 * 1000
    let msInHr = msInMin * 60
    switch (interval) {
        case "1min":
            return (msInMin / ms)
        case "5min":
            return ((5 * msInMin) / ms)
        case "1hr":
            return (msInHr / ms)
        case "1day":
            return ((24 * msInHr) / ms)
        case "1week":
            return ((7 * 24 * msInHr) / ms)
        default:
            return 0
    }
}

function formatDate(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const dayName = days[date.getDay()];
    const dateNum = String(date.getDate()).padStart(2, '0');
    const monthName = months[date.getMonth()];
    const shortYear = String(date.getFullYear()).slice(-2);

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${dayName} ${dateNum} ${monthName}' ${shortYear} ${hours}:${minutes}`;
}

export { calculateSMA, getPeriodLabel, getStockImgUrl, getNumInterval, getAvailableInterval, formatDate }