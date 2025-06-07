
import * as d3 from 'd3';
import { getAvailableInterval, getNumInterval } from './helper';
import { ChartType, Interval, IntervalSelectOption, Margin, OHLCVData, Timeframe } from './types';
import { upateStockPriceView, updateStockImg } from './stockCard';
import { generateMockOHLCV, generateNextMockOHLCV } from './mockData';
import { addDataPoint, addTrendingLines, drawCandleStickChart, drawLineChart, drawSMALine, hideSMALine, initCharts, removeDrawingLine, startFreeTrendingLineDrawing, startHzTrendingLineDrawing } from './Chart';

const margin: Margin = { top: 10, left: 10, bottom: 40, right: 40 }
const svgWidth = 1000;
const svgHeight = 400;

// DOM Elements
const smaButton = document.getElementById('sma-button') as HTMLImageElement;
const smaIcon = document.getElementById('sma-icon') as HTMLImageElement;
const smaPeriodInput = document.getElementById('sma-period') as HTMLInputElement;
const liveButton = document.getElementById('live-button') as HTMLButtonElement;
const stockSelector = document.getElementById('stock-selector') as HTMLDivElement;
const timeframeSelector = document.getElementById('timeframe-selector') as HTMLDivElement;
const intervalSelect = document.querySelector('#interval-select') as HTMLSelectElement;
const chartTypeSelector = document.getElementById('chart-type-selector') as HTMLDivElement;
const trendingLineSelector = document.getElementById('trending-line-selector') as HTMLDivElement;

let timeframe: Timeframe = '1day'
let chartType: ChartType = 'line'
let symbol: string = 'AAPL';
let interval: Interval = '1min'

let liveIntervalId: number | null = null;

// data
let data: OHLCVData[] = [];

function resetTrendingLineSelector() {
    const buttons = trendingLineSelector.querySelectorAll('button');
    buttons.forEach(button => button.classList.remove('active'));
}

function setIntervalOptions(intervalOptions: IntervalSelectOption[], value: Interval) {
    let optionsHtml = ''
    intervalOptions.forEach((option) => {
        optionsHtml += `<option value="${option.value}">${option.label}</option>`
    })
    intervalSelect.value = value
    intervalSelect.innerHTML = optionsHtml
}

function startLive() {
    let intervalMs = 500
    let numDatapoints_to_showOnChartAfter = getNumInterval(interval, intervalMs);
    let numDatapoints_curr = 0
    let lastNewDataPoint = data[data.length - 1]
    liveIntervalId = setInterval(() => {
        const newDataPoint = generateNextMockOHLCV(lastNewDataPoint, intervalMs);
        // update card view
        upateStockPriceView([lastNewDataPoint, newDataPoint], timeframe)
        lastNewDataPoint = newDataPoint
        numDatapoints_curr++;
        if (numDatapoints_curr == numDatapoints_to_showOnChartAfter) {
            const wrtPushedDataPoint = generateNextMockOHLCV(data[data.length - 1], intervalMs * numDatapoints_to_showOnChartAfter);
            data.push(wrtPushedDataPoint)
            lastNewDataPoint = wrtPushedDataPoint
            numDatapoints_curr = 0;
            addDataPoint(wrtPushedDataPoint)
        }
    }, intervalMs)
}

function stopLive() {
    liveIntervalId && clearInterval(liveIntervalId)
}

function reInitiateLive() {
    if (liveIntervalId) {
        stopLive()
        startLive()
    }
}

// ------------------ 
smaButton.addEventListener('click', () => {
    const chartGroup = d3.select('svg').select('.chart-group')
    if (chartGroup.empty()) return
    if (smaPeriodInput.disabled) {
        smaPeriodInput.disabled = false
        smaIcon.setAttribute('src', 'icons/eye.svg')
        drawSMALine(parseInt(smaPeriodInput.value))
    }
    else {
        smaPeriodInput.disabled = true
        smaIcon.setAttribute('src', 'icons/eye-slash.svg')
        hideSMALine(chartGroup)
    }
})

smaPeriodInput.addEventListener('change', () => {
    const chartGroup = d3.select('svg').select('.chart-group')
    if (chartGroup.empty()) return
    drawSMALine(parseInt(smaPeriodInput.value))
})

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
            data = generateMockOHLCV(timeframe, interval);
            initCharts(
                data,
                svgWidth, svgHeight,
                margin,
                chartType,
                !smaPeriodInput.disabled, parseInt(smaPeriodInput.value),
            );
            updateStockImg(symbol)
            upateStockPriceView(data, timeframe)
            reInitiateLive()
        }
    }
});

liveButton.addEventListener('click', () => {
    const liveDot = liveButton.querySelector('.live-dot');
    const isActive = liveDot?.classList.contains('active');
    if (isActive) {
        liveDot && liveDot.classList.remove('active');
        stopLive()
    }
    else {
        liveDot && liveDot.classList.add('active');
        startLive()
    }
})

timeframeSelector.addEventListener('click', async (event: Event) => {
    const clickedElement = event.target as HTMLElement;
    if (clickedElement.tagName === 'BUTTON') {
        let newTimeframe = clickedElement.dataset.timeframe || '';
        // reftech api & update chart
        if (newTimeframe !== timeframe) {
            // Toggle active class
            const buttons = timeframeSelector.querySelectorAll('button');
            buttons.forEach(button => button.classList.remove('active'));
            clickedElement.classList.add('active');
            timeframe = newTimeframe as Timeframe

            const intervalOptions = getAvailableInterval(newTimeframe)
            let isCurrIntervalValid = intervalOptions.some((intervalOption) => intervalOption.value == interval)
            if (!isCurrIntervalValid) {
                interval = intervalOptions[0].value
                setIntervalOptions(intervalOptions, interval)
            }

            data = generateMockOHLCV(timeframe, interval);
            upateStockPriceView(data, timeframe)
            initCharts(
                data,
                svgWidth, svgHeight,
                margin,
                chartType,
                !smaPeriodInput.disabled, parseInt(smaPeriodInput.value),
            );
            // add exisitng trending lines
            addTrendingLines()
            reInitiateLive()
        }
    }
});

intervalSelect.addEventListener('change', (e) => {
    interval = intervalSelect.value as Interval
    data = generateMockOHLCV(timeframe, interval);
    initCharts(
        data,
        svgWidth, svgHeight,
        margin,
        chartType,
        !smaPeriodInput.disabled, parseInt(smaPeriodInput.value),
    );
    addTrendingLines()
    upateStockPriceView(data, timeframe)
    reInitiateLive()
})

chartTypeSelector.addEventListener('click', async (event: Event) => {
    const clickedElement = event.target as HTMLElement;
    const clickedButton = clickedElement.closest('button');
    if (clickedButton) {
        let newChartType = (clickedButton.dataset.chartType || 'line') as ChartType;
        // Toggle active class:
        const buttons = chartTypeSelector.querySelectorAll('button');
        buttons.forEach(button => button.classList.remove('active'));
        clickedButton.classList.add('active');
        // update chart
        if (newChartType !== chartType) {
            chartType = newChartType
            if (chartType == 'line') drawLineChart()
            else drawCandleStickChart();
        }
    }
});

trendingLineSelector.addEventListener('click', async (event: Event) => {
    const clickedElement = event.target as HTMLElement;
    const clickedButton = clickedElement.closest('button');
    if (clickedButton) {
        if (clickedButton.dataset.trendingLineType == 'diagTrendingLine') {
            if (clickedButton.classList.contains('active')) {
                removeDrawingLine()
                resetTrendingLineSelector()
            }
            else {
                resetTrendingLineSelector()
                clickedButton.classList.add('active')
                startFreeTrendingLineDrawing()
            }
        }
        if (clickedButton.dataset.trendingLineType == 'hzTrendingLine') {
            if (clickedButton.classList.contains('active')) {
                resetTrendingLineSelector()
                removeDrawingLine()
            }
            else {
                resetTrendingLineSelector()
                clickedButton.classList.add('active')
                startHzTrendingLineDrawing()
            }

        }
    }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        data = generateMockOHLCV(timeframe, interval);
        initCharts(
            data,
            svgWidth, svgHeight,
            margin,
            chartType,
            !smaPeriodInput.disabled, parseInt(smaPeriodInput.value),
        );
        upateStockPriceView(data, timeframe)
        // updateCharts();
    } catch (error) {
        console.error('Error:', error);
    }
});

