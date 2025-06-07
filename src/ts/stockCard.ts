import { OHLCVData } from "./types";

const liveStockPriceDiv = document.querySelector('.stock-price') as HTMLDivElement;
const priceChangeDiv = liveStockPriceDiv.querySelector('.price-change')!;
const percentChangeDiv = liveStockPriceDiv.querySelector('.percent-change')!;
const periodDiv = liveStockPriceDiv.querySelector('.period')!;
const stockImg = document.getElementById('stock-img') as HTMLImageElement;
const currentPriceDiv = liveStockPriceDiv.querySelector('.current-price')!;
const ohlcvDiv = liveStockPriceDiv.querySelector('.ohlcv')!;

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

function updateStockImg(symbol: string) {
    stockImg.setAttribute("src", getStockImgUrl(symbol))
}

function upateStockPriceView(data: OHLCVData[], timeframe: string) {
    let n = data.length
    if (n > 0) {
        let dataPoint = data[n - 1];
        currentPriceDiv.innerHTML = `${dataPoint.close.toFixed(2)} <span class="curr">USD</span>`;
        ohlcvDiv.innerHTML = `
            <div >
                <span><strong>O</strong>&nbsp; ${dataPoint.open.toFixed(2)}</span>
                <span><strong>H</strong>&nbsp; ${dataPoint.high.toFixed(2)}</span>
                <span><strong>L</strong>&nbsp; ${dataPoint.low.toFixed(2)}</span>
                <span><strong>C</strong>&nbsp; ${dataPoint.close.toFixed(2)}</span>
                <span><strong>V</strong>&nbsp; ${dataPoint.volume.toFixed(2)}</span>
            </div>
            `
    }
    if (n > 1) {
        let current = data[n - 1].close
        let previous = data[n - 2].close
        let change = 0
        let percentChange = 0
        change = current - previous;
        percentChange = ((current - previous) / previous) * 100
        periodDiv.textContent = getPeriodLabel(timeframe)
        priceChangeDiv.textContent = change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
        percentChangeDiv.textContent = change >= 0 ? `+${percentChange.toFixed(2)}%` : `${percentChange.toFixed(2)}%`;
        if (change >= 0) {
            liveStockPriceDiv.classList.add('price-up');
            liveStockPriceDiv.classList.remove('price-down');
        }
        else {
            liveStockPriceDiv.classList.add('price-down');
            liveStockPriceDiv.classList.remove('price-up');
        }
    }
}

export { updateStockImg, upateStockPriceView }