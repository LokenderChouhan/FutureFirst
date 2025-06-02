import * as d3 from 'd3';
import { OHLCVData, StockCardElement, StockQuote } from './types';
import { calculateSMA, getDataDateInterval, generateHistoricalData, getPeriodLabel, getStockImgUrl } from './helper';
import { fetchStockData } from './api';

// DOM Elements
const smaButton = document.getElementById('sma-button') as HTMLButtonElement;
const smaIcon = document.getElementById('sma-icon') as HTMLImageElement;
const smaPeriodInput = document.getElementById('sma-period') as HTMLInputElement;
const mainChartDiv = document.getElementById('main-chart') as HTMLDivElement;
const tooltip = document.getElementById('tooltip') as HTMLDivElement;
const errorMessage = document.getElementById('error-message') as HTMLDivElement;
const liveButton = document.getElementById('live-button') as HTMLButtonElement;
const liveStockPriceDiv = document.querySelector('.stock-price') as HTMLDivElement;
const stockImg = document.getElementById('stock-img') as HTMLImageElement;
const mockDataButton = document.getElementById('mock-data-btn') as HTMLButtonElement;
const stockSelector = document.getElementById('stock-selector') as HTMLDivElement;
const timeframeSelector = document.getElementById('timeframe-selector') as HTMLDivElement;
const chartTypeSelector = document.getElementById('chart-type-selector') as HTMLDivElement;

// Default values
let symbol: string = 'AAPL'
let timeframe: string = '1day'
let chartType: string = 'line'

// Chart dimensions
let mainChartWidth = mainChartDiv.clientWidth;

let mainChartHeight = mainChartWidth > 700 ? 400 : 300;
const margin = mainChartWidth > 700 ? { top: 20, right: 50, bottom: 30, left: 20 } : { top: 10, right: 40, bottom: 20, left: 10 };
let innerWidth = mainChartWidth - margin.left - margin.right
let innerHeight = mainChartHeight - margin.top - margin.bottom

// Chart elements
let mainChartSvg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
let xScaleOriginal: d3.ScaleTime<number, number>;
let yScaleOriginal: d3.ScaleLinear<number, number>;
let xScale: d3.ScaleTime<number, number>;
let yScale: d3.ScaleLinear<number, number>;
let xAxis: d3.Axis<d3.NumberValue>;
let yAxis: d3.Axis<d3.NumberValue>;
let gridGroup: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
let chartGroup: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
let axisGroup: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
let tooltipLine: d3.Selection<SVGLineElement, unknown, HTMLElement, any>;
let tooltipDot: d3.Selection<SVGCircleElement, unknown, HTMLElement, any>;
let listeningRect: d3.Selection<SVGRectElement, unknown, HTMLElement, any>;

// Line Chart Generators
let lineGenerator: d3.Line<OHLCVData>;
let areaGenerator: d3.Area<OHLCVData>;

// Zoom behavior
let zoom: d3.ZoomBehavior<Element, unknown>;

// Data
let historicalData: OHLCVData[] = [];
let smaData: { date: Date; value: number }[] = [];
let realtimeInterval: number | null = null;
let USE_MOCK_DATA: boolean = false

// Initialize charts
function initCharts() {
    // Clear previous charts
    mainChartDiv.innerHTML = '';

    // Main chart container
    mainChartSvg = d3.select(mainChartDiv)
        .append('svg')
        .attr('width', mainChartWidth)
        .attr('height', mainChartHeight)
        .attr('viewBox', `0 0 ${mainChartWidth} ${mainChartHeight}`);

    // make grid
    gridGroup = mainChartSvg.append('g').attr('class', 'chart-grid')
    gridGroup.append('g').attr('class', 'x-grid')
    gridGroup.append('g').attr('class', 'y-grid')

    // chart container & clip
    chartGroup = mainChartSvg.append('g').attr('class', 'chart-group')
    let defs = mainChartSvg.select("defs");
    if (defs.empty()) defs = mainChartSvg.append("defs");
    defs.append("clipPath")
        .attr("id", "chart-clip")
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", mainChartWidth - margin.right)
        .attr("height", innerHeight);

    chartGroup.attr("clip-path", "url(#chart-clip)");
    gridGroup.attr("clip-path", "url(#chart-clip)");

    // axis
    axisGroup = mainChartSvg.append('g').attr('class', 'chart-axis')
    axisGroup.append('g')
        .attr('class', 'x-axis')
        .call((g) => g.select(".domain").remove())
        .attr('transform', `translate(0,${mainChartHeight - margin.bottom})`)
    axisGroup.append('g')
        .attr('class', 'y-axis')
        .call((g) => g.select(".domain").remove())
        .attr('transform', `translate(${mainChartWidth - margin.right},0)`);

    // Scales
    xScaleOriginal = d3.scaleTime().range([margin.left, mainChartWidth - margin.right]);
    xScale = xScaleOriginal.copy();
    yScaleOriginal = d3.scaleLinear().range([mainChartHeight - margin.bottom, margin.top]);
    yScale = yScaleOriginal.copy();

    xAxis = d3.axisBottom(xScale);
    yAxis = d3.axisRight(yScale);

    // Line Generator & Area Generator Initialization for Line Chart
    lineGenerator = d3.line<OHLCVData>()
        .x(d => xScale(d.date)!)
        .y(d => yScale(d.close)!);
    areaGenerator = d3.area<OHLCVData>()
        .x(d => xScale(d.date)!) // Will use the current xScale
        .y0(yScale(yScale.domain()[0]) || innerHeight) // Initial y0
        .y1(d => yScale(d.close)!);

    // Setup the D3 Zoom behavior
    zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([1, 10]) // How much you can zoom in/out (e.g., 1x to 10x)
        .translateExtent([[0, 0], [innerWidth, innerHeight]]) // Constrain panning within chartGroup bounds
        .extent([[0, 0], [innerWidth, innerHeight]]) // Where zoom events are active
        .filter((event) => (event.type === 'mousedown' && event.button === 0) || (event.type === 'wheel'))
        .on("zoom", zoomed)

    // listening Rect to track hover & zoom
    chartGroup.selectAll('.listening-rect').remove();
    listeningRect = chartGroup.append("rect")
        .attr('class', 'listening-rect')
        .attr('width', mainChartWidth)
        .attr('height', mainChartHeight)
        .attr("fill", "transparent")
        .attr("pointer-events", "all")
        .call(zoom);
}

function zoomed(event: d3.D3ZoomEvent<Element, unknown>) {
    updateScale(event)
    drawAxis()
    drawGrid()
    showYAxisLatestTag()
    // Update the line and area paths
    if (chartType == 'line') {
        chartGroup.select('.price-line').attr('d', lineGenerator);
        chartGroup.select('.price-area').attr('d', areaGenerator);
    }
    else {
        drawCandlestickChart()
    }
    if (smaPeriodInput.disabled === false && smaData.length) {
        drawSMALine();
    }
}

function updateScale(event?: d3.D3ZoomEvent<Element, unknown>,) {
    const transform = event?.transform || d3.zoomTransform(chartGroup.select(".listening-rect").node() as Element);
    if (event) xScale = transform.rescaleX(xScaleOriginal);
    else {
        xScaleOriginal.domain(d3.extent(historicalData, d => d.date) as [Date, Date]);
        xScale = transform.rescaleX(xScaleOriginal);
    }
    const visibleData = historicalData.filter(d => {
        const date = d.date.getTime();
        const [xDomainStart, xDomainEnd] = xScale.domain().map(date => date.getTime());
        return date >= xDomainStart && date <= xDomainEnd;
    });
    // 4. Calculate Y-domain from the visible data
    if (visibleData.length > 0) {
        const minPrice = d3.min(visibleData, d => d.low)!;
        const maxPrice = d3.max(visibleData, d => d.high)!;
        const yPadding = (maxPrice - minPrice) * 0.1;
        yScale.domain([minPrice - yPadding, maxPrice + yPadding]);
    } else {
        yScale.domain([0, 100]); // Default domain or handle as needed
    }
}

function drawAxis() {
    xAxis = d3.axisBottom(xScale);
    yAxis = d3.axisRight(yScale);

    axisGroup.select('.x-axis')
        .call(xAxis)
        .call(g => g.select('.domain').remove())

    axisGroup.select('.y-axis')
        .call(yAxis)
        .call(g => g.select('.domain').remove())
}

function showYAxisLatestTag() {
    if (historicalData.length == 0) return;

    const latestPrice = historicalData[historicalData.length - 1].close;
    // Add yAxis Current price indicator
    const firstClosePrice = historicalData[0].close; // Assuming data is sorted by date ascending
    const lastClosePrice = historicalData[historicalData.length - 1].close;
    const yAxisGroup = axisGroup.select('.y-axis');
    yAxisGroup.selectAll('.price-indicator').remove();
    const indicator = yAxisGroup.append('g')
        .attr('class', 'price-indicator')
        .attr('transform', `translate(0, ${yScale(latestPrice)})`);
    indicator.append('rect')
        .attr('x', 2) // Position to left of axis
        .attr('y', -10) // Position to left of axis
        .attr('fill', lastClosePrice >= firstClosePrice ? 'var(--positive-color)' : 'var(--negative-color)');
    indicator.append('text')
        .attr('x', 22) // Center in rectangle
        .attr('y', 5) // Vertically center
        .text(d3.format('.2f')(latestPrice));
    indicator.transition()
        .duration(500)
        .attr('transform', `translate(0, ${yScale(latestPrice)})`);
}

// Update charts with data
function updateCharts() {
    if (historicalData.length === 0) return;
    updateScale()
    drawAxis()
    showYAxisLatestTag()
    drawGrid()
    // Draw chart based on type
    if (chartType === 'candlestick') {
        drawCandlestickChart()
    } else {
        drawLineChart();
    }
    // Calculate SMA if enabled
    if (smaPeriodInput.disabled === false) {
        smaData = calculateSMA(historicalData, parseInt(smaPeriodInput.value));
        drawSMALine();
    }
}

function createTooltip(dotColor: string) {
    const isLineChart = chartType === 'line'
    // Create Tooltip dashed line
    chartGroup.selectAll('.tooltip-line').remove();
    tooltipLine = chartGroup.append('line') // Append an SVG <line> element
        .attr('class', 'tooltip-line')
        .attr('x1', 0)                     // Start X coordinate
        .attr('y1', margin.top)                     // Start Y coordinate
        .attr('x2', 0)                     // End X coordinate
        .attr('y2', mainChartHeight - margin.bottom)                     // End Y coordinate
        .attr('stroke-width', 0)  // Set the stroke width

    // Create Tooltip Dot
    chartGroup.selectAll('.tooltip-dot').remove();
    tooltipDot = chartGroup.append("circle")
        .attr('class', 'tooltip-dot')
        .attr("r", 0)
        .attr("fill", dotColor)

    // create a listening rectangle on hover
    listeningRect.on("mousemove", function (event) {
        const [xCoord] = d3.pointer(event, this);
        const bisectDate = d3.bisector(d => d.date).right;
        const x0 = xScale.invert(xCoord);
        const i = bisectDate(historicalData, x0, 1);
        const d0 = historicalData[i - 1];
        const d1 = historicalData[i];
        if (!d0 || !d1) return;
        const d = x0.getTime() - d0.date.getTime() > d1.date.getTime() - x0.getTime() ? d1 : d0;
        const xPos = xScale(d.date);
        const yPos = yScale(d.close);

        if (isLineChart) {
            tooltipDot.attr("cx", xPos).attr("cy", yPos);
            tooltipDot.transition()
                .duration(50)
                .attr("r", 5);
        }
        tooltipLine.attr("x1", xPos).attr("x2", xPos);
        tooltipLine.transition()
            .duration(50)
            .attr('stroke-width', 1);

        showTooltip(event, d)
    });

    // listening rectangle mouse leave function
    listeningRect.on("mouseleave", function () {
        if (isLineChart) {
            tooltipDot.transition()
                .duration(50)
                .attr("r", 0);
        }
        tooltipLine.transition()
            .duration(50)
            .attr('stroke-width', 0);
        hideTooltip()
    });

}

// Show tooltip on hover
function showTooltip(event: MouseEvent, d: OHLCVData) {
    const [x, y] = d3.pointer(event, chartGroup.node());
    const xPos = xScale(d.date);
    const yPos = yScale(d.close);

    if (chartType == 'line') {
        tooltipDot.attr("cx", xPos).attr("cy", yPos);
        tooltipDot.transition().duration(50).attr("r", 5);
    }
    tooltipLine.attr("x1", xPos).attr("x2", xPos);
    tooltipLine.transition().duration(50).attr('stroke-width', 1);

    tooltip.style.opacity = '1';
    tooltip.style.left = `${x - margin.left}px`;
    tooltip.style.top = `${y}px`;
    tooltip.innerHTML = `
        <div>O &nbsp;${d.open.toFixed(2)}</div>
        <div>H &nbsp;${d.high.toFixed(2)}</div>
        <div>L &nbsp;${d.low.toFixed(2)}</div>
        <div>C &nbsp;${d.close.toFixed(2)}</div>
        <div>V &nbsp;${d.volume.toLocaleString()}</div>
        <div id='tooltip-date'>${d.date.toUTCString()}</div>
    `;

}

// Hide tooltip
function hideTooltip() {
    tooltip.style.opacity = '0';
}

function calculateCandleWidth(data: OHLCVData[], currentXScale: d3.ScaleTime<number, number>): number {
    if (!data || data.length === 0) return 0;

    // Calculate based on difference between two dates in pixels (more dynamic)
    // This assumes your dates are somewhat evenly spaced (e.g., daily, hourly).
    // If not, you might need a more sophisticated method or a fixed width.
    const firstDate = data[0].date;
    const secondDate = data.length > 1 ? data[1].date : new Date(firstDate.getTime() + (24 * 60 * 60 * 1000)); // Assume 1 day if only one point

    const x1 = currentXScale(firstDate);
    const x2 = currentXScale(secondDate);

    // Calculate width as a percentage of the distance between two points, or a fixed pixel width.
    // Use Math.max to ensure a minimum width even if data points are very close.
    // Use Math.abs for robustness.
    const calculatedWidth = Math.max(1, Math.abs(x2! - x1!) * 0.7); // 70% of the spacing

    // Also, put a cap on the max width to prevent giant candles when zoomed out
    return Math.min(calculatedWidth, 30); // Max 30px, adjust as needed
}

function drawGrid() {
    const xGridLines = gridGroup.select('.x-grid')
        .selectAll('.x-grid-line')
        .data(xScale.ticks().slice(0))

    xGridLines.exit().remove();

    const enteringXGridLines = xGridLines.enter()
        .append('line')
        .attr('class', 'x-grid-line');

    enteringXGridLines.merge(xGridLines)
        .attr('x1', (d) => xScale(d))
        .attr('x2', (d) => xScale(d))
        .attr('y1', margin.top)
        .attr('y2', mainChartHeight - margin.bottom)
        .lower()

    const yGridLines = gridGroup.select('.y-grid')
        .selectAll('.y-grid-line')
        .data(yScale.ticks().slice(0))

    yGridLines.exit().remove();

    const enteringYGridLines = yGridLines.enter()
        .append('line')
        .attr('class', 'y-grid-line');

    enteringYGridLines.merge(yGridLines)
        .attr('y1', (d) => yScale(d))
        .attr('y2', (d) => yScale(d))
        .attr('x1', margin.left)
        .attr('x2', mainChartWidth - margin.right)
        .lower()
}

// Draw candlestick chart
function drawCandlestickChart() {
    // Calculate candle width based on the current data and xScale
    let candleWidth = calculateCandleWidth(historicalData, xScale);

    // --- Draw Wicks ---
    const wicks = chartGroup.selectAll('.wick')
        .data(historicalData, d => (d as OHLCVData).date.getTime());

    wicks.exit().remove();

    const enteringWicks = wicks.enter()
        .append('line')
        .attr('class', 'wick');

    enteringWicks.merge(wicks)
        .attr('x1', d => xScale(d.date)!)
        .attr('x2', d => xScale(d.date)!)
        .attr('y1', d => yScale(d.high)!)
        .attr('y2', d => yScale(d.low)!)
        .attr('stroke', d => d.close >= d.open ? 'var(--positive-color)' : 'var(--negative-color)')
        .attr('stroke-width', 1);

    // --- Draw Candle Bodies ---
    const candles = chartGroup.selectAll('.candle')
        .data(historicalData, d => (d as OHLCVData).date.getTime());

    candles.exit().remove();

    const enteringCandles = candles.enter()
        .append('rect')
        .attr('class', 'candle'); // Initial class, will be updated below

    enteringCandles.merge(candles)
        .attr('class', d => d.close >= d.open ? 'candle candle-up' : 'candle candle-down') // Update class for color
        .attr('x', d => xScale(d.date)! - candleWidth / 2) // Centered on the date
        .attr('y', d => yScale(Math.max(d.open, d.close))!) // Top of the body (higher of open/close)
        .attr('width', candleWidth)
        .attr('height', d => Math.abs(yScale(d.open)! - yScale(d.close)!)); // Height based on difference

    createTooltip('')
}

// Draw line chart
function drawLineChart() {
    // Handle empty data case
    if (!historicalData || historicalData.length === 0) {
        chartGroup.select('.price-line').remove();
        chartGroup.select('.price-area').remove();
        // Remove old gradient if it exists, to clean up
        chartGroup.select('defs').select('#priceGradient').remove();
        return;
    }

    // Determine color-scheme, overall growth/fall for the visible data
    const firstClosePrice = historicalData[0].close; // Assuming data is sorted by date ascending
    const lastClosePrice = historicalData[historicalData.length - 1].close;

    let lineColor: string;
    let gradientStartColor: string;
    let gradientEndColor: string;
    if (lastClosePrice >= firstClosePrice) {
        lineColor = 'var(--positive-color)';
        gradientStartColor = 'var(--positive-gradient-start-color)'; // Green with 30% opacity
        gradientEndColor = 'var(--positive-gradient-end-color)';    // Fully transparent green
    } else {
        lineColor = 'var(--negative-color)';
        gradientStartColor = 'var(--negative-gradient-start-color)'; // Red with 30% opacity
        gradientEndColor = 'var(--negative-gradient-end-color)';    // Fully transparent red
    }

    // Define and Update Linear Gradient
    let defs = chartGroup.select('defs');
    if (defs.empty()) {
        defs = chartGroup.append('defs');
    }

    // Remove old gradient before creating a new one (important for color change)
    defs.select('#priceGradient').remove();
    const linearGradient = defs.append('linearGradient')
        .attr('id', 'priceGradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%'); // Gradient from top to bottom
    linearGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', gradientStartColor);
    linearGradient.append('stop')
        .attr('offset', '70%')
        .attr('stop-color', gradientEndColor);

    // Update y0 for the areaGenerator based on y-domain
    areaGenerator.y0(yScale(yScale.domain()[0])!); // Ensure y0 aligns with current lowest price in domain

    // Draw the Area below the Line
    chartGroup.selectAll('.price-area').remove();
    chartGroup.append('path') // Select by a specific class for the area
        .datum(historicalData)
        .attr('class', 'price-area')
        .attr('d', areaGenerator) // Generate path data for the area
        .attr('fill', 'url(#priceGradient)') // Apply the gradient fill
        .lower(); // Send the area path to the back so it's behind the line and candles

    // Draw the Line
    chartGroup.selectAll('.price-line').remove();
    chartGroup.append('path') // Select your existing line path by its class
        .datum(historicalData)
        .attr('class', 'price-line')
        .attr('d', lineGenerator) // Use the lineGenerator for the line path
        .attr('stroke', lineColor) // Apply the determined line color
        .attr('stroke-width', 2) // Ensure stroke width
        .attr('fill', 'none') // Ensure line has no fill
        .raise()

    createTooltip(lineColor);
}

// Draw SMA line
function drawSMALine() {
    chartGroup.selectAll('.sma-line').remove();
    const smaLine = d3.line<{ date: Date; value: number }>()
        .x(d => xScale(d.date)!)
        .y(d => yScale(d.value)!);
    chartGroup.append('path')
        .datum(smaData)
        .attr('class', 'sma-line')
        .attr('d', smaLine);
}

// hide SMA line
function hideSMALine() {
    // Clear previous SMA line
    mainChartSvg.selectAll('.sma-line').remove();
}

// Show error message
function showError(message: string) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';

    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

function showLiveUpdateOnChart() {
    if (historicalData.length < 2) return;

    let newDataPoint = historicalData[historicalData.length - 1];
    let lastDataPointInChart = historicalData[historicalData.length - 2]
    const diffInMins = (newDataPoint.date.getTime() - lastDataPointInChart.date.getTime()) / (1000 * 60);
    const xAxisIntervalInMins = getDataDateInterval(timeframe)
    if (diffInMins >= xAxisIntervalInMins) {
        historicalData.shift();
        historicalData.push(newDataPoint);
        lastDataPointInChart = newDataPoint;
        updateCharts();
    }
    else {
        historicalData.push(newDataPoint);
        showYAxisLatestTag()
    }
}

function updateStockCard() {
    let change = 0
    let percentChange = 0
    let n = historicalData.length
    if (n > 1) {
        let current = historicalData[n - 1].close
        let previous = historicalData[n - 2].close
        change = current - previous;
        percentChange = ((current - previous) / previous) * 100
    }
    stockImg.setAttribute("src", getStockImgUrl(symbol))
    showStockCard(change, percentChange, historicalData[historicalData.length - 1])
}

function showStockCard(change: number, percentChange: number, ohlcv: OHLCVData) {
    let currentPriceDiv = liveStockPriceDiv.querySelector('.current-price')!;
    let priceChangeDiv = liveStockPriceDiv.querySelector('.price-change')!;
    let percentChangeDiv = liveStockPriceDiv.querySelector('.percent-change')!;
    let periodDiv = liveStockPriceDiv.querySelector('.period')!;
    let ohlcvDiv = liveStockPriceDiv.querySelector('.ohlcv')!;

    periodDiv.textContent = getPeriodLabel(timeframe)
    currentPriceDiv.innerHTML = `${ohlcv.close.toFixed(2)} <span class="curr">USD</span>`;
    ohlcvDiv.innerHTML = `
        <div >
            <span><strong>O</strong>&nbsp; ${ohlcv.open}</span>
            <span><strong>H</strong>&nbsp; ${ohlcv.high}</span>
            <span><strong>L</strong>&nbsp; ${ohlcv.low}</span>
            <span><strong>C</strong>&nbsp; ${ohlcv.close}</span>
            <span><strong>V</strong>&nbsp; ${ohlcv.volume}</span>
        </div>
        `
    // Update change indicators
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

function createMockQuote() {
    const lastData = historicalData[historicalData.length - 1];
    const basePrice = lastData.close;

    // Generate random price movement (-0.5% to +0.5%)
    const changePercent = (Math.random() - 0.5);
    const newPrice = basePrice * (1 + changePercent / 100);

    // Create mock quote data
    const quote = {
        "01. symbol": symbol,
        "02. open": lastData.close.toFixed(4),
        "03. high": Math.max(lastData.close, newPrice).toFixed(4),
        "04. low": Math.min(lastData.close, newPrice).toFixed(4),
        "05. price": newPrice.toFixed(4),
        "06. volume": Math.floor(Math.random() * 1000000 + 500000).toString(),
        "07. latest trading day": new Date().toISOString().split('T')[0],
        "08. previous close": lastData.close.toFixed(4),
        "09. change": (newPrice - lastData.close).toFixed(4),
        "10. change percent": ((newPrice - lastData.close) / lastData.close * 100).toFixed(4) + "%"
    };

    return quote;
}

async function getLiveUpdate() {
    realtimeInterval = setInterval(async () => {
        if (historicalData.length === 0) return;
        const quote = USE_MOCK_DATA ? createMockQuote() : await fetchStockData(symbol);

        if (!quote) return;
        const change = parseFloat(quote['09. change']);
        const percentChange = parseFloat(quote['10. change percent'].replace('%', ''));
        let ohlcvData = {
            open: Number(quote["02. open"]),
            high: Number(quote["03. high"]),
            low: Number(quote["04. low"]),
            close: Number(quote["05. price"]),
            volume: Number(quote["06. volume"]),
            date: new Date()
        } as OHLCVData
        showStockCard(change, percentChange, ohlcvData)
        historicalData.push(ohlcvData);
        showLiveUpdateOnChart()
    }, 250)
}

// Handle window resize
window.addEventListener('resize', () => {
    mainChartWidth = mainChartDiv.clientWidth;
    if (mainChartSvg) {
        mainChartSvg
            .attr('width', mainChartWidth)
            .attr('height', mainChartHeight);
        if (historicalData.length > 0) {
            updateCharts();
        }
    }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        initCharts();
        historicalData = await generateHistoricalData(symbol, timeframe, USE_MOCK_DATA);
        smaData = calculateSMA(historicalData, parseInt(smaPeriodInput.value));
        updateCharts();
        updateStockCard();
    } catch (error) {
        showError('Failed to load data. Please try again.');
        console.error('Error:', error);
    }
});

timeframeSelector.addEventListener('click', async (event: Event) => {
    const clickedElement = event.target as HTMLElement;
    if (clickedElement.tagName === 'BUTTON') {
        let newTimeframe = clickedElement.dataset.timeframe || '';
        // Toggle active class
        const buttons = timeframeSelector.querySelectorAll('button');
        buttons.forEach(button => button.classList.remove('active'));
        clickedElement.classList.add('active');
        // reftech api & update chart
        if (newTimeframe !== timeframe) {
            timeframe = newTimeframe
            historicalData = await generateHistoricalData(symbol, timeframe, USE_MOCK_DATA);
            updateCharts();
            updateStockCard();
        }
    }
});

stockSelector.addEventListener('click', async (event: Event) => {
    const clickedElement = event.target as HTMLElement;
    if (clickedElement.tagName === 'BUTTON') {
        let newSymbol = clickedElement.dataset.stockSymbol || '';
        const buttons = stockSelector.querySelectorAll('button');
        buttons.forEach(button => button.classList.remove('active'));
        clickedElement.classList.add('active');
        // reftech api & update chart
        if (newSymbol !== symbol) {
            symbol = newSymbol
            historicalData = await generateHistoricalData(symbol, timeframe, USE_MOCK_DATA);
            updateCharts();
            updateStockCard();
        }
    }
});

smaPeriodInput.addEventListener('change', async (event: Event) => {
    smaData = calculateSMA(historicalData, parseInt(smaPeriodInput.value));
    drawSMALine();
})

chartTypeSelector.addEventListener('click', async (event: Event) => {
    const clickedElement = event.target as HTMLElement;
    const clickedButton = clickedElement.closest('button');
    if (clickedButton) {
        let newChartType = clickedButton.dataset.chartType || '';
        // Toggle active class:
        const buttons = chartTypeSelector.querySelectorAll('button');
        buttons.forEach(button => button.classList.remove('active'));
        clickedButton.classList.add('active');
        // update chart
        if (newChartType !== chartType) {
            chartType = newChartType
            initCharts();
            updateCharts();
        }

    }
});

smaButton.addEventListener('click', () => {
    if (smaPeriodInput.disabled) {
        smaPeriodInput.disabled = false
        smaIcon.setAttribute('src', 'icons/eye.svg')
        smaData = calculateSMA(historicalData, parseInt(smaPeriodInput.value));
        drawSMALine();
    }
    else {
        smaPeriodInput.disabled = true
        smaIcon.setAttribute('src', 'icons/eye-slash.svg')
        hideSMALine()
    }
})

liveButton.addEventListener('click', () => {
    const liveDot = liveButton.querySelector('.live-dot');
    const isActive = liveDot?.classList.contains('active');
    if (isActive) {
        liveDot && liveDot.classList.remove('active');
        clearInterval(Number(realtimeInterval))
    }
    else {
        liveDot && liveDot.classList.add('active');
        getLiveUpdate()
    }
})

mockDataButton.addEventListener('click', async () => {
    const isActive = mockDataButton.classList.contains('active');
    USE_MOCK_DATA = isActive ? false : true;
    if (!isActive) {
        initCharts();
        historicalData = await generateHistoricalData(symbol, timeframe, true);
        smaData = calculateSMA(historicalData, parseInt(smaPeriodInput.value));
        updateCharts();
        updateStockCard();
        clearInterval(Number(realtimeInterval))
    }
    mockDataButton.classList.toggle('active');
})

