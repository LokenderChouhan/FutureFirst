import * as d3 from 'd3';
import { ChartType, Margin, OHLCVData, SMAData, TrendingLineData, TrendingLinePriceHighlight } from './types';
import { calculateSMA } from './helper';

// d3
let xScaleOriginal: d3.ScaleTime<number, number>;
let xScale: d3.ScaleTime<number, number>;
let yScale: d3.ScaleLinear<number, number>;

// d3 data
let data: OHLCVData[] = [];
let drawingTrendingLine: TrendingLineData | null; // active line data
let trendingLinesData: TrendingLineData[] = [] // all

// dom states
let margin: Margin;
let svgWidth: number;
let svgHeight: number;
let isDrawingHzTrendingLine: boolean = false;
let isDrawingFreeTrendingLine: boolean = false;
let chartType: ChartType;
let onTrendingLineComplete: (() => void) | null = null;

const initCharts = (
    chartData: OHLCVData[],
    chartSvgWidth: number, chartSvgHeight: number,
    chartMargin: Margin,
    chartTypeInput: ChartType,
    showSma: boolean, smaPeriodInput: number,
) => {
    data = chartData;
    chartType = chartTypeInput;
    margin = chartMargin;
    svgWidth = chartSvgWidth;
    svgHeight = chartSvgHeight;

    // get conatiner
    const containerDiv = d3.select('#main-chart')

    // add svg
    containerDiv.selectAll('svg').remove()
    containerDiv
        .append('svg')
        .attr('class', 'chart-svg')
        .attr('width', svgWidth)
        .attr('height', svgHeight)
        .style("cursor", 'crosshair')

    yScale = d3
        .scaleLinear()
        .domain(d3.extent(data, d => d.close) as [number, number])
        .range([svgHeight - margin.bottom, margin.top])

    xScale = d3
        .scaleTime()
        .domain(d3.extent(data, d => d.date) as [Date, Date])
        .range([margin.left, svgWidth - margin.right])

    xScaleOriginal = xScale.copy()
    const d3Svg = d3.select('svg')
    drawAxis(xScale, yScale, d3Svg, svgHeight, svgWidth)
    drawGrid(xScale, yScale, d3Svg, svgHeight, svgWidth, margin)

    let chartGroup = d3Svg
        .append('g')
        .attr('class', 'chart-group')
    // .style("cursor", 'crosshair')

    // Drae line/candle chart
    if (chartType == 'line') drawLineChart()
    else drawCandleStickChart()
    // draw sma line
    if (showSma) {
        drawSMALine(smaPeriodInput)
    }

    // Attach clip path to chartGroup
    d3Svg.selectAll("defs").remove();
    let defs = d3Svg.append("defs");
    defs.append("clipPath")
        .attr("id", "chart-clip")
        .append("rect")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", svgWidth - margin.left - margin.right)
        .attr("height", svgHeight - margin.top - margin.bottom);
    chartGroup.attr("clip-path", "url(#chart-clip)");

    // Trending lines Groups
    chartGroup.selectAll('.trending-lines').remove();
    let trendingLinesGroup = chartGroup.append('g').attr('class', 'trending-lines')
    trendingLinesGroup.append('g').attr('class', 'hz-trending-lines')
    trendingLinesGroup.append('g').attr('class', 'free-trending-lines')

    // create hidden tooltip elements
    createTooltip()

    handleMouseEvents();
}


function handleMouseEvents() {
    let chartSvg = d3.select('.chart-svg')
    const chartGroup = d3.select('.chart-group')
    chartSvg
        .on('mousemove', (event) => {
            const [x, y] = d3.pointer(event, chartGroup.node());
            const boundedX = Math.max(margin.left, Math.min(x, svgWidth - margin.right));
            const boundedY = Math.max(margin.top, Math.min(y, svgHeight - margin.bottom));
            handleToolipMouseMove(boundedX, boundedY)
            handleFreeTrendingLineDrawing(boundedX, boundedY)
        })
        .on('mouseleave', (event) => {
            handleToolipMouseLeave(chartType)
        })
        .on('click', (event) => {
            const [x, y] = d3.pointer(event, chartGroup.node());
            const boundedX = Math.max(margin.left, Math.min(x, svgWidth - margin.right));
            const boundedY = Math.max(margin.top, Math.min(y, svgHeight - margin.bottom));
            if (isDrawingHzTrendingLine) {
                handleHzTrendingLineClick(boundedY)
            }
            else if (isDrawingFreeTrendingLine) {
                handleFreeTendingLineClick(boundedX, boundedY)
            }
        })
        .on('zoom', zoomHandler)
    chartSvg.call(zoomHandler() as any)
}

function zoomHandler() {
    return d3.zoom()
        .scaleExtent([1, 10])
        .translateExtent([[0, 0], [svgWidth, svgHeight]])
        .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {

            if (isDrawingFreeTrendingLine) return;

            const transform = event.transform;

            // update xScale
            xScale = transform.rescaleX(xScaleOriginal);
            // // update yScale, domain : Calculate prices from the visible x axis dates
            const [xDomainStartDate, xDomainEndDate] = xScale.domain().map(date => date.getTime());
            const visibleDataPoints = data.filter(d => {
                const date = d.date.getTime();
                return date >= xDomainStartDate && date <= xDomainEndDate;
            });
            if (visibleDataPoints.length > 0) {
                const minPrice = d3.min(visibleDataPoints, d => d.low)!;
                const maxPrice = d3.max(visibleDataPoints, d => d.high)!;
                const yPadding = (maxPrice - minPrice) * 0.1;
                yScale.domain([minPrice - yPadding, maxPrice + yPadding]);
            }

            // update axis & grid
            updateAxis(xScale, yScale, svgHeight, svgWidth)
            updateGrid(xScale, yScale, svgHeight, svgWidth, margin)

            const chartGroup = d3.select('.chart-group')

            if (chartType == 'line') {
                // update line's x
                const line = d3
                    .line<OHLCVData>()
                    .x(d => xScale(d.date))
                    .y(d => yScale(d.close))
                const chartGroup = d3.select('.chart-group')
                chartGroup
                    .select('.line-path')
                    .transition()
                    .duration(50)
                    .attr('d', line);
                chartGroup
                    .select('.current-price-line')
                    .transition()
                    .duration(50)
                    .attr('y1', yScale(data[data.length - 1].close))
                    .attr('y2', yScale(data[data.length - 1].close))
            }
            else {
                drawCandleStickChart()
            }

            // update sma Line's x
            const smaLine = chartGroup.select('.sma-line')
            if (!smaLine.empty()) {
                const smaLine = d3.line<SMAData>()
                    .x(d => xScale(d.date))
                    .y(d => yScale(d.value));
                chartGroup.select('.sma-line')
                    .transition()
                    .duration(50)
                    .attr('d', smaLine.x(d => xScale(d.date)));
            }

            handleTrendingLineOnScaleUpdate()

        });
}

// ------ Trending Lines ------
function removeDrawingTrendingLine() {
    drawingTrendingLine?.line.remove()
    drawingTrendingLine?.startCircle?.remove()
    drawingTrendingLine?.priceHighlightRect?.startRect?.remove()
    drawingTrendingLine?.priceHighlightRect?.startText?.remove()
    drawingTrendingLine?.priceHighlightRect?.coverRect?.remove()
    drawingTrendingLine?.priceHighlightRect?.endRect?.remove()
    drawingTrendingLine?.priceHighlightRect?.endText?.remove()

    drawingTrendingLine = null
    isDrawingFreeTrendingLine = false
    isDrawingHzTrendingLine = false

    onTrendingLineComplete = null
}

function resetDrawingTrendingLine() {
    drawingTrendingLine = null
    isDrawingFreeTrendingLine = false
    isDrawingHzTrendingLine = false
    onTrendingLineComplete = null
}

function startFreeTrendingLineDrawing(onComplete: () => void) {
    drawingTrendingLine = null
    isDrawingFreeTrendingLine = true;
    onTrendingLineComplete = onComplete
}

function startHzTrendingLineDrawing(onComplete: () => void) {
    drawingTrendingLine = null
    isDrawingHzTrendingLine = true;
    onTrendingLineComplete = onComplete
}

function handleFreeTendingLineClick(boundedX: number, boundedY: number) {
    let isStartingPoint = drawingTrendingLine == null
    let freeTrendingLinesGroup = d3.select('.free-trending-lines')

    if (isStartingPoint) {
        let line = freeTrendingLinesGroup
            .append('line')
            .attr('class', 'trending-line')
            .attr('x1', boundedX)
            .attr('y1', boundedY)
            .attr('x2', boundedX)
            .attr('y2', boundedY)
            .attr('stroke', '#2862ff')
            .attr('stroke-width', 2)
            .style('cursor', 'move');

        let startCircle = freeTrendingLinesGroup
            .append('circle')
            .attr('class', 'trending-line-start')
            .attr('cx', boundedX)
            .attr('cy', boundedY)
            .attr('r', 5)
            .attr('fill', 'white')
            .attr("stroke", "#2862ff")
            .attr("stroke-width", "2")
            .style('cursor', "default")
            .call(d3.drag<SVGCircleElement, unknown>().on('drag', (event) => {
                const boundedX = Math.max(margin.left, Math.min(event.x, svgWidth - margin.right));
                const boundedY = Math.max(margin.top, Math.min(event.y, svgHeight - margin.bottom));
                const price = Number(yScale.invert(boundedY).toFixed(2));
                const date = xScale.invert(boundedX);

                line.attr('x1', boundedX).attr('y1', boundedY);
                startCircle.attr('cx', boundedX).attr('cy', boundedY);

                const lineData = trendingLinesData.find((d: TrendingLineData) => d.line === line)!;
                lineData.startPrice = price;
                lineData.startDate = date;

                updateTrendingLinePriceHighlight(lineData);
            }));

        const price = Number(yScale.invert(boundedY).toFixed(2))
        const date = xScale.invert(boundedX);

        drawingTrendingLine = {
            id: '',
            isFree: true,
            isHz: false,
            startPrice: price,
            endPrice: price,
            startDate: date,
            endDate: date,
            line,
            startCircle,
            priceHighlightRect: startTrendingLinePriceHighlight(price, boundedY, svgWidth, margin, false)
        }
    }
    else if (drawingTrendingLine) {
        let line = drawingTrendingLine.line
            .attr('x2', boundedX)
            .attr('y2', boundedY)
            .call(d3.drag<SVGLineElement, unknown>().on('drag', (event) => {
                const dx = event.dx;
                const dy = event.dy;

                const lineData = trendingLinesData.find((d: TrendingLineData) => d.line === line)!;

                let newX1 = Number(line.attr('x1')) + dx;
                let newX2 = Number(line.attr('x2')) + dx;
                let newY1 = Number(line.attr('y1')) + dy;
                let newY2 = Number(line.attr('y2')) + dy;

                line
                    .attr('x1', newX1)
                    .attr('y1', newY1)
                    .attr('x2', newX2)
                    .attr('y2', newY2);

                // Update start and end circles
                lineData.startCircle?.attr('cx', newX1).attr('cy', newY1);
                lineData.endCircle?.attr('cx', newX2).attr('cy', newY2);
                lineData.startPrice = Number(yScale.invert(newY1).toFixed(2));
                lineData.endPrice = Number(yScale.invert(newY2).toFixed(2));
                lineData.startDate = xScale.invert(newX1);
                lineData.endDate = xScale.invert(newX2);
                updateTrendingLinePriceHighlight(lineData);
            }));

        let endCircle = freeTrendingLinesGroup
            .append('circle')
            .attr('class', 'trending-line-end')
            .attr('cx', boundedX)
            .attr('cy', boundedY)
            .attr('r', 5)
            .attr('fill', 'white')
            .attr("stroke", "#2862ff")
            .attr("stroke-width", "2")
            .style('cursor', "default")
            .call(d3.drag<SVGCircleElement, unknown>().on('drag', (event) => {
                const boundedX = Math.max(margin.left, Math.min(event.x, svgWidth - margin.right));
                const boundedY = Math.max(margin.top, Math.min(event.y, svgHeight - margin.bottom));
                const price = Number(yScale.invert(boundedY).toFixed(2));
                const date = xScale.invert(boundedX);
                line.attr('x2', boundedX).attr('y2', boundedY);
                endCircle.attr('cx', boundedX).attr('cy', boundedY);

                const lineData = trendingLinesData.find((d: TrendingLineData) => d.line === line)!;
                lineData.endPrice = price;
                lineData.endDate = date;

                updateTrendingLinePriceHighlight(lineData);
            }));

        const endPrice = Number(yScale.invert(boundedY).toFixed(2))
        const endDate = xScale.invert(boundedX);

        const { startPrice, startDate } = drawingTrendingLine;
        let id = `free_from_${startPrice}_${startDate.getTime()}_to_${endPrice}_${endDate.getTime()}`;
        drawingTrendingLine = {
            ...drawingTrendingLine,
            id: `free_from_${startPrice}_${startDate.getTime()}_to_${endPrice}_${endDate.getTime()}`,
            endPrice,
            endDate,
            endCircle,
        }
        // avoid duplicate
        if (!trendingLinesData.some((lineData) => lineData.id == id)) {
            trendingLinesData.push(drawingTrendingLine)
            endTrendingLinePriceHighlight(drawingTrendingLine.priceHighlightRect)
        }
        if (onTrendingLineComplete) onTrendingLineComplete()
        resetDrawingTrendingLine()
    }
}

function handleFreeTrendingLineDrawing(boundedX: number, boundedY: number) {
    if (!drawingTrendingLine) return;
    drawingTrendingLine.line
        .attr('x2', boundedX)
        .attr('y2', boundedY)
    const price = Number(yScale.invert(boundedY).toFixed(2))

    coverTrendingLinePriceHighlight(price, boundedY, svgWidth, margin, drawingTrendingLine.priceHighlightRect)
}

function handleHzTrendingLineClick(boundedY: number) {
    let hzTrendingLinesGroup = d3.select('.hz-trending-lines')
    let hzTrendingLine = hzTrendingLinesGroup
        .append('line')
        .attr('class', 'trending-line')
        .attr('x1', margin.left)
        .attr('y1', boundedY)
        .attr('x2', svgWidth - margin.right)
        .attr('y2', boundedY)
        .attr('stroke', '#2862ff')
        .attr('stroke-width', 2)
        .style("cursor", "ns-resize")
        .call(d3.drag<SVGLineElement, unknown>().on('drag', (event) => {
            const boundedY = Math.max(margin.top, Math.min(event.y, svgHeight - margin.bottom));
            const price = Number(yScale.invert(boundedY).toFixed(2));

            hzTrendingLine.attr('y1', boundedY).attr('y2', boundedY);

            const lineData = trendingLinesData.find(d => d.line === hzTrendingLine)!;
            lineData.startPrice = price;
            lineData.endPrice = price;

            updateTrendingLinePriceHighlight(lineData);
        }));

    const price = Number(yScale.invert(boundedY).toFixed(2))
    let id = `hz_${price}`
    if (!trendingLinesData.some((lineData) => lineData.id == id)) {
        trendingLinesData.push({
            id: `hz_${price}`,
            isFree: false,
            isHz: true,
            line: hzTrendingLine,
            startPrice: price,
            endPrice: price,
            startDate: d3.min(data, d => d.date)!,
            endDate: d3.max(data, d => d.date)!,
            priceHighlightRect: startTrendingLinePriceHighlight(price, boundedY, svgWidth, margin, true)
        })
    }
    if (onTrendingLineComplete) onTrendingLineComplete()
    resetDrawingTrendingLine()
}

// --- TRENDING LINEs PRICE HIGhLIGHTs ----
function startTrendingLinePriceHighlight(
    price: number,
    y: number,
    svgWidth: number,
    margin: Margin,
    isHzLine: boolean
): TrendingLinePriceHighlight {
    let axisGroup = d3.select('.trending-lines-price-hightler')
    let group = axisGroup.select(`.${isHzLine ? 'hz' : 'free'}-trending-lines-price-hightler`)
    let startRect = group.append('rect')
    let startText = group.append('text')
    let endRect = isHzLine ? startRect : group.append('rect')
    let coverRect = isHzLine ? startRect : group.append('rect')
    let endText = isHzLine ? startText : group.append('text')

    if (!isHzLine)
        coverRect
            .attr('x', svgWidth - margin.right)
            .attr('y', y)
            .attr('width', '36px')
            .attr('height', '12px')
            .attr('class', 'highlight-rect')
            .attr('fill', '#c9d8ff')
            .style('opacity', 0.5)

    startRect
        .attr('x', svgWidth - margin.right)
        .attr('y', y - 6)
        .attr('width', '36px')
        .attr('height', '12px')
        .attr('class', 'start-rect')
        .attr('fill', isHzLine ? '#2862ff' : '#049981')
        .style('opacity', 1)

    startText
        .attr('class', 'start-text')
        .text(price)
        .attr('fill', 'white')
        .attr('font-size', '10px')
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle')
        .attr('dy', 1)
        .attr('x', (svgWidth - margin.right) + (36 / 2))
        .attr('y', (y - 6) + (12 / 2));

    if (!isHzLine)
        endRect
            .attr('x', svgWidth - margin.right)
            .attr('y', y - 6)
            .attr('width', '36px')
            .attr('height', '12px')
            .attr('class', 'end-rect')
            .attr('fill', 'black')
            .style('opacity', 0)

    return ({
        coverRect,
        startRect,
        endRect,
        startText,
        endText,
    })
}

function coverTrendingLinePriceHighlight(
    price: number,
    y: number,
    svgWidth: number,
    margin: Margin,
    priceHighlightRect: TrendingLinePriceHighlight,
) {

    let rectY = y - 6
    priceHighlightRect.endRect
        .attr('y', rectY)
        .style('opacity', 1)

    priceHighlightRect.endText
        .attr('class', 'end-text')
        .text(price)
        .attr('fill', 'white')
        .attr('font-size', '10px')
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle')
        .attr('dy', 1)
        .attr('x', (svgWidth - margin.right) + (36 / 2))
        .attr('y', rectY + 6);

    const startY = Number(priceHighlightRect.startRect.attr('y'));
    const endY = Number(priceHighlightRect.endRect.attr('y'));

    if (y < startY) {
        priceHighlightRect.coverRect
            .attr('y', endY + 12)
            .attr('height', Math.max(startY - (endY + 12), 0))
    }
    else {
        priceHighlightRect.coverRect
            .attr('y', startY + 12)
            .attr('height', Math.max(endY - startY - 12, 0))
    }
}

function endTrendingLinePriceHighlight(
    priceHighlightRect: TrendingLinePriceHighlight,
) {
    priceHighlightRect.startRect.attr('fill', '#2862ff')
    priceHighlightRect.endRect.attr('fill', '#2862ff')
}

// handle Trending Lines & Price Highlights On ScaleUpdate i.e zoom
function handleTrendingLineOnScaleUpdate() {
    trendingLinesData.forEach((trendingLineData) => {
        const { isHz, line, priceHighlightRect, startPrice, endPrice, startDate, endDate, startCircle, endCircle } = trendingLineData

        let x1 = xScale(startDate)
        let y1 = yScale(startPrice)
        let x2 = xScale(endDate)
        let y2 = yScale(endPrice)

        // Trending line
        if (isHz) {
            line
                .attr("y1", y1)
                .attr("y2", y1);
        }
        else {
            line
                .attr("x1", x1)
                .attr("x2", x2)
                .attr("y1", y1)
                .attr("y2", y2);
        }

        if (!isHz) {
            startCircle!
                .attr("cx", x1)
                .attr("cy", y1)
            endCircle!
                .attr("cx", x2)
                .attr("cy", y2)
        }


        // Price Highlight Rects
        priceHighlightRect.startRect.attr('y', y1 - 6)
        priceHighlightRect.startText.attr('y', y1)

        if (!isHz) {
            let wentUp = y2 < y1;

            // end Price tag
            trendingLineData.priceHighlightRect.endRect.attr('y', wentUp ? y2 - 6 : y2 - 6)
            trendingLineData.priceHighlightRect.endText.attr('y', y2)

            // area cover tag
            trendingLineData.priceHighlightRect.coverRect
                .attr('y', wentUp ? y2 + 6 : y1 + 6)
                .attr('height', wentUp ? (y1 - (y2 + 12)) : (y2 - (y1 + 12)))
        }

    });
}

// add existing trending lines if were there: called on timeframe / interval change
function addTrendingLines() {
    let freeTrendingLinesGroup = d3.select('.free-trending-lines')
    let hzTrendingLinesGroup = d3.select('.hz-trending-lines')
    let axisGroup = d3.select('.trending-lines-price-hightler')
    let hzAxisGroup = axisGroup.select(`.hz-trending-lines-price-hightler`)
    let freeAxisGroup = axisGroup.select(`.free-trending-lines-price-hightler`)

    trendingLinesData.forEach((trendingLineData) => {
        const { isHz, startPrice, endPrice, startDate, endDate } = trendingLineData

        // Add Trending lines
        let x1 = xScale(startDate)
        let y1 = yScale(startPrice)
        let x2 = xScale(endDate)
        let y2 = yScale(endPrice)

        if (isHz) {
            trendingLineData.line = hzTrendingLinesGroup
                .append('line')
                .attr('class', 'trending-line')
                .attr('x1', margin.left)
                .attr('y1', y1)
                .attr('x2', svgWidth - margin.right)
                .attr('y2', y1)
                .attr('stroke', '#2862ff')
                .attr('stroke-width', 2)
        }
        else {
            trendingLineData.line = freeTrendingLinesGroup
                .append('line')
                .attr('class', 'trending-line')
                .attr("x1", x1)
                .attr("x2", x2)
                .attr("y1", y1)
                .attr("y2", y2)
                .attr('stroke', '#2862ff')
                .attr('stroke-width', 2)

            trendingLineData.startCircle = freeTrendingLinesGroup
                .append('circle')
                .attr('class', 'trending-line-start')
                .attr('cx', x1)
                .attr('cy', y1)
                .attr('r', 5)
                .attr('fill', 'white')
                .attr("stroke", "#2862ff")
                .attr("stroke-width", "2")

            trendingLineData.endCircle = freeTrendingLinesGroup
                .append('circle')
                .attr('class', 'trending-line-end')
                .attr('cx', x2)
                .attr('cy', y2)
                .attr('r', 5)
                .attr('fill', 'white')
                .attr("stroke", "#2862ff")
                .attr("stroke-width", "2")
        }

        // Price Highlights
        let group = isHz ? hzAxisGroup : freeAxisGroup
        let startRect = group.append('rect')
        let startText = group.append('text')
        let endRect = isHz ? startRect : group.append('rect')
        let coverRect = isHz ? startRect : group.append('rect')
        let endText = isHz ? startText : group.append('text')

        trendingLineData.priceHighlightRect.startRect = startRect
            .attr('x', svgWidth - margin.right)
            .attr('y', y1 - 6)
            .attr('width', '36px')
            .attr('height', '12px')
            .attr('class', 'start-rect')
            .attr('fill', '#2862ff')
            .style('opacity', 1)

        trendingLineData.priceHighlightRect.startText = startText
            .attr('class', 'start-text')
            .text(startPrice)
            .attr('fill', 'white')
            .attr('font-size', '10px')
            .attr('text-anchor', 'middle')
            .attr('alignment-baseline', 'middle')
            .attr('dy', 1)
            .attr('x', (svgWidth - margin.right) + (36 / 2))
            .attr('y', y1);

        if (!isHz) {

            trendingLineData.priceHighlightRect.endRect = endRect
                .attr('x', svgWidth - margin.right)
                .attr('y', y2 - 6)
                .attr('width', '36px')
                .attr('height', '12px')
                .attr('class', 'end-rect')
                .attr('fill', '#2862ff')
                .style('opacity', 1)

            trendingLineData.priceHighlightRect.endText = endText
                .attr('class', 'end-text')
                .text(endPrice)
                .attr('fill', 'white')
                .attr('font-size', '10px')
                .attr('text-anchor', 'middle')
                .attr('alignment-baseline', 'middle')
                .attr('dy', 1)
                .attr('x', (svgWidth - margin.right) + (36 / 2))
                .attr('y', y2);

            let wentUp = y2 < y1;

            trendingLineData.priceHighlightRect.coverRect = coverRect
                .attr('x', svgWidth - margin.right)
                .attr('y', wentUp ? y2 + 6 : y1 + 6)
                .attr('width', '36px')
                .attr('height', wentUp ? (y1 - (y2 + 12)) : (y2 - (y1 + 12)))
                .attr('class', 'highlight-rect')
                .attr('fill', '#c9d8ff')
                .style('opacity', 0.5)
        }
    });
}
// add new data point to chart
function addDataPoint(dataPoint: OHLCVData) {
    data.push(dataPoint)
    if (chartType == 'line') drawLineChart()
    else drawCandleStickChart()
}

// ----- AXIS ------
function drawAxis(
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    svg: d3.Selection<d3.BaseType, unknown, HTMLElement, any>,
    svgHeight: number,
    svgWidth: number,
) {
    const axisGroup = svg.append('g').attr('class', 'axis-group')
    let xAxis = d3.axisTop(xScale);
    let yAxis = d3.axisLeft(yScale);

    axisGroup
        .append('g')
        .attr('class', 'x-axis')
        .call(xAxis)
        .attr('transform', `translate(0, ${svgHeight})`)
    axisGroup
        .append('g')
        .attr('class', 'y-axis')
        .call(yAxis)
        .attr('transform', `translate(${svgWidth}, 0)`)

    let trendingLinesPriceHighlighter = axisGroup
        .append('g')
        .attr('class', 'trending-lines-price-hightler')
    let hzTrendingLinesPriceHighlighter = trendingLinesPriceHighlighter
        .append('g')
        .attr('class', 'hz-trending-lines-price-hightler')
    let freeTrendingLinesPriceHighlighter = trendingLinesPriceHighlighter
        .append('g')
        .attr('class', 'free-trending-lines-price-hightler')
    // .attr('transform', `translate(${svgWidth}, 0)`)
}

function updateAxis(
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    svgHeight: number,
    svgWidth: number,
) {
    let xAxis = d3.axisTop(xScale);
    let yAxis = d3.axisLeft(yScale);

    d3.select('.x-axis')
        .call(xAxis as any)
        .attr('transform', `translate(0, ${svgHeight})`);
    d3.select('.y-axis')
        .call(yAxis as any)
        .attr('transform', `translate(${svgWidth}, 0)`)
}

//------ GRID ------
function drawGrid(
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    svg: d3.Selection<d3.BaseType, unknown, HTMLElement, any>,
    svgHeight: number,
    svgWidth: number,
    margin: Margin,
) {
    let gridGroup = svg.append('g').attr('class', 'grid')
    let xGridGroup = gridGroup.append('g').attr('class', 'x-grid')
    let yGridGroup = gridGroup.append('g').attr('class', 'y-grid')

    yGridGroup
        .selectAll('.y-grid-line')
        .data(xScale.ticks())
        .join('line')
        .attr('class', 'y-grid-line')
        .attr('x1', (d) => xScale(d))
        .attr('x2', (d) => xScale(d))
        .attr('y1', svgHeight - margin.bottom)
        .attr('y2', margin.top)
        .style('stroke', 'var(--grid-color)')
        .lower()

    xGridGroup
        .selectAll('.x-grid-line')
        .data(yScale.ticks())
        .join('line')
        .attr('class', 'x-grid-line')
        .attr('x1', margin.left)
        .attr('x2', svgWidth - margin.right)
        .attr('y1', (d) => yScale(d))
        .attr('y2', (d) => yScale(d))
        .style('stroke', 'var(--grid-color)')
        .lower()
}

function updateGrid(
    xScale: d3.ScaleTime<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    svgHeight: number,
    svgWidth: number,
    margin: Margin
) {
    let xGridGroup = d3.select('.x-grid')
    let yGridGroup = d3.select('.y-grid')

    yGridGroup
        .selectAll('.y-grid-line')
        .data(xScale.ticks())
        .join(
            // Enter
            (enter) =>
                enter.append('line')
                    .attr('class', 'y-grid-line')
                    .attr('x1', (d) => xScale(d))
                    .attr('x2', (d) => xScale(d))
                    .attr('y1', svgHeight - margin.bottom)
                    .attr('y2', margin.top)
                    .style('stroke', 'var(--grid-color)'),
            // Update
            (update) =>
                update.call(update =>
                    update.attr('x1', (d) => xScale(d))
                        .attr('x2', (d) => xScale(d))),
            // Exit
            (exit) =>
                exit.call(exit => exit.remove())
        )
        .lower();

    xGridGroup
        .selectAll('.x-grid-line')
        .data(yScale.ticks())
        .join(
            // Enter
            (enter) =>
                enter.append('line')
                    .attr('class', 'x-grid-line')
                    .attr('x1', margin.left)
                    .attr('x2', svgWidth - margin.right)
                    .attr('y1', (d) => yScale(d))
                    .attr('y2', (d) => yScale(d))
                    .style('stroke', 'var(--grid-color)'),
            // Update
            (update) =>
                update.call(update =>
                    update.attr('y1', (d) => yScale(d))
                        .attr('y2', (d) => yScale(d))
                ),
            // Exit
            (exit) =>
                exit.call(exit => exit.remove())
        )
        .lower();
}

//------ LINE CHART ------
function drawLineChart() {
    const chartGroup = d3.select('.chart-group')
    chartType = 'line'

    // remove any chart if exist
    chartGroup.select('.line-group').remove()
    chartGroup.select('.candlestick-group').remove()

    const line = d3
        .line<OHLCVData>()
        .x(d => xScale(d.date))
        .y(d => yScale(d.close))

    let lineGroup = chartGroup
        .append('g')
        .attr('class', 'line-group')
    lineGroup
        .append('path')
        .datum(data)
        .attr('class', 'line-path')
        .attr('d', (d) => line(d))
        .attr("stroke", '#049981')
        .attr("stroke-width", 2)
        .attr('fill', 'none')
    let y = yScale(data[data.length - 1].close)
    lineGroup
        .append('line')
        .attr('class', 'current-price-line')
        .attr('x1', margin.left)
        .attr('y1', y)
        .attr('x2', svgWidth - margin.right)
        .attr('y2', y)
        .attr('stroke', '#049981')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2 2')
        .style('opacity', 0.5)

}

//------ CANDLESTICK CHART ------
function calculateCandleWidth(): number {
    if (!data || data.length === 0) return 0;
    const firstDate = data[0].date;
    const secondDate = data.length > 1 ? data[1].date : new Date(firstDate.getTime() + (24 * 60 * 60 * 1000)); // Assume 1 day if only one point
    const x1 = xScale(firstDate);
    const x2 = xScale(secondDate);
    const calculatedWidth = Math.max(1, Math.abs(x2! - x1!) * 0.7);
    return Math.min(calculatedWidth, 30);
}

function drawCandleStickChart() {
    chartType = 'candlestick'

    const chartGroup = d3.select('.chart-group')

    // remove existing chart if exist
    chartGroup.select('.line-group').remove()
    chartGroup.select('.candlestick-group').remove()

    const candleStickchartGroup = chartGroup.append('g').attr('class', 'candlestick-group')

    // Calculate candle width based on the current data and xScale
    let candleWidth = calculateCandleWidth();

    // --- Draw Wicks ---
    candleStickchartGroup
        .selectAll('.wick')
        .data(data, d => (d as OHLCVData).date.getTime())
        .join(
            (enter) =>
                enter.append('line')
                    .attr('class', 'wick')
                    .attr('x1', d => xScale(d.date)!)
                    .attr('x2', d => xScale(d.date)!)
                    .attr('y1', d => yScale(d.high)!)
                    .attr('y2', d => yScale(d.low)!)
                    .attr('stroke', d => d.close >= d.open ? 'var(--positive-color)' : 'var(--negative-color)')
                    .attr('stroke-width', 1),
            (update) =>
                update.call(update =>
                    update
                        .attr('x1', d => xScale(d.date)!)
                        .attr('x2', d => xScale(d.date)!)
                        .attr('y1', d => yScale(d.high)!)
                        .attr('y2', d => yScale(d.low)!)
                ),
            (exit) => exit.call(exit => exit.remove())
        );

    // --- Draw Candle Bodies ---
    candleStickchartGroup
        .selectAll('.candle')
        .data(data, d => (d as OHLCVData).date.getTime())
        .join(
            (enter) =>
                enter.append('rect')
                    .attr('class', d => d.close >= d.open ? 'candle candle-up' : 'candle candle-down') // Update class for color
                    .attr('x', d => xScale(d.date)! - candleWidth / 2) // Centered on the date
                    .attr('y', d => yScale(Math.max(d.open, d.close))!) // Top of the body (higher of open/close)
                    .attr('width', candleWidth)
                    .attr('height', d => Math.abs(yScale(d.open)! - yScale(d.close)!)) // Height based on difference
                    .attr('fill', d => d.close >= d.open ? 'var(--positive-color)' : 'var(--negative-color)')
                    .attr('stroke-width', 1),
            (update) =>
                update.call(update =>
                    update
                        .attr('x', d => xScale(d.date)! - candleWidth / 2) // Centered on the date
                        .attr('y', d => yScale(Math.max(d.open, d.close))!) // Top of the body (higher of open/close)
                        .attr('width', candleWidth)
                        .attr('height', d => Math.abs(yScale(d.open)! - yScale(d.close)!)) // Height based on difference
                ),
            (exit) => exit.call(exit => exit.remove())
        );
}

// ------ SMA LINE ------
function drawSMALine(smaPeriod: number) {
    const chartGroup = d3.select('svg').select('.chart-group')
    let smaData = calculateSMA(data, smaPeriod);
    chartGroup.selectAll('.sma-line').remove();
    const smaLine = d3.line<SMAData>()
        .x(d => xScale(d.date)!)
        .y(d => yScale(d.value)!);
    chartGroup.append('path')
        .datum(smaData)
        .attr('class', 'sma-line')
        .attr('d', smaLine);
}

function hideSMALine() {
    d3.selectAll('.sma-line').remove();
}

// ----- TOOLTIP ------
function showTooltip(
    boundedX: number, boundedY: number,
    d: OHLCVData | null,
    margin: Margin,
) {
    if (!d) return
    const tooltipDiv = document.getElementById('tooltip') as HTMLDivElement;
    tooltipDiv.style.opacity = '1';
    tooltipDiv.style.left = `${boundedX - margin.left - 5}px`;
    tooltipDiv.style.top = `${boundedY}px`;
    tooltipDiv.innerHTML = `
        <div>O &nbsp;${d.open.toFixed(2)}</div>
        <div>H &nbsp;${d.high.toFixed(2)}</div>
        <div>L &nbsp;${d.low.toFixed(2)}</div>
        <div>C &nbsp;${d.close.toFixed(2)}</div>
        <div>V &nbsp;${d.volume.toLocaleString()}</div>
        <div id='tooltip-date'>${d.date.toUTCString()}</div>
    `;
}

function hideTooltip() {
    const tooltipDiv = document.getElementById('tooltip') as HTMLDivElement;
    tooltipDiv.style.opacity = '0';
}

function createTooltip() {
    const chartGroup = d3.select('.chart-group')

    // Add Tooltip Elemetns
    chartGroup.selectAll('.tooltip').remove();
    let toolTipGroup = chartGroup.append('g').attr('class', 'chart-tooltip');

    // Create hidden Tooltip dashed line
    toolTipGroup
        .append('line')
        .attr('class', 'tooltip-line')
        .attr('x1', margin.left)
        .attr('y1', margin.top)
        .attr('x2', svgWidth - margin.right)
        .attr('y2', svgHeight - margin.bottom)
        .attr('stroke-width', 0)

    // Create hidden Tooltip Dot
    toolTipGroup.append("circle")
        .attr('class', 'tooltip-dot')
        .attr("r", 0)
        .attr("stroke", "white")
        .attr('stroke-width', 1)
        .attr("fill", "#049981")

}

function getBisectDate(x: number,
): { xPos: number, yPos: number, dataPoint: OHLCVData | null } {
    const bisectDate = d3.bisector(d => d.date).right;
    const x0 = xScale.invert(x);
    const i = bisectDate(data, x0, 1);
    const d0 = data[i - 1];
    const d1 = data[i];
    if (!d0 || !d1) return ({ xPos: 0, yPos: 0, dataPoint: null });
    const d = x0.getTime() - d0.date.getTime() > d1.date.getTime() - x0.getTime() ? d1 : d0;
    return ({
        dataPoint: d,
        xPos: xScale(d.date),
        yPos: yScale(d.close),
    })
}

function handleToolipMouseMove(boundedX: number, boundedY: number) {
    const { dataPoint, xPos, yPos } = getBisectDate(boundedX, data, xScale, yScale)
    if (chartType == 'line') {
        let tooltipDot = d3.select('.tooltip-dot');
        tooltipDot.attr("cx", xPos).attr("cy", yPos);
        tooltipDot.transition().duration(50).attr("r", 4); // 0 -> 4
    }
    let tooltipLine = d3.select('.tooltip-line');
    tooltipLine.attr("x1", xPos).attr("x2", xPos);
    tooltipLine.transition().duration(50).attr('stroke-width', 1); // 0 -> 1
    showTooltip(boundedX, boundedY, dataPoint, margin)
}

function handleToolipMouseLeave(chartType: ChartType) {
    if (chartType == 'line') {
        let tooltipDot = d3.select('.tooltip-dot');
        tooltipDot.transition().duration(50).attr("r", 0); // 5 -> 0
    }
    let tooltipLine = d3.select('.tooltip-line');
    tooltipLine.transition().duration(50).attr('stroke-width', 0); // 1 -> 0
    hideTooltip()
}

// Add this new function to update price highlights when dragging
function updateTrendingLinePriceHighlight(trendingLineData: TrendingLineData) {
    const { isHz, priceHighlightRect, startPrice, endPrice } = trendingLineData;

    if (isHz) {
        const y = yScale(startPrice);
        priceHighlightRect.startRect.attr('y', y - 6);
        priceHighlightRect.startText
            .attr('y', y)
            .text(startPrice);
    } else {
        const startY = yScale(startPrice);
        const endY = yScale(endPrice);

        priceHighlightRect.startRect.attr('y', startY - 6);
        priceHighlightRect.startText
            .attr('y', startY)
            .text(startPrice);

        priceHighlightRect.endRect.attr('y', endY - 6);
        priceHighlightRect.endText
            .attr('y', endY)
            .text(endPrice);

        const wentUp = endY < startY;
        priceHighlightRect.coverRect
            .attr('y', wentUp ? endY + 6 : startY + 6)
            .attr('height', wentUp ? Math.max(startY - (endY + 12), 0) : Math.max(endY - (startY + 12), 0));
    }
}

export {
    initCharts,
    addDataPoint,
    drawLineChart, drawCandleStickChart,
    startFreeTrendingLineDrawing, startHzTrendingLineDrawing,
    drawSMALine, hideSMALine,
    addTrendingLines, removeDrawingTrendingLine
}

