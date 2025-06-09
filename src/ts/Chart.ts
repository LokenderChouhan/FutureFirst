import * as d3 from 'd3';
import { ChartType, Margin, OHLCVData, SMAData, TrendingLineData, AxisTrendingLineHighlightRect } from './types';
import { calculateSMA, formatDate } from './helper';

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
            
            // Check if click is on a trending line
            const clickedLine = d3.select(event.target);
            const isTrendingLine = clickedLine.classed('trending-line');
            
            if (isTrendingLine) {
                const lineId = clickedLine.attr('id');
                const clickedTrendingLine = trendingLinesData.find(line => line.line?.attr('id') === lineId);
                if (clickedTrendingLine) {
                    // Hide all trending line elements first
                    trendingLinesData.forEach(line => setTrendingLineElementsVisibility(line, false));
                    // Show elements for clicked line
                    setTrendingLineElementsVisibility(clickedTrendingLine, true);
                }
            } else {
                // Click outside trending line - hide all elements
                trendingLinesData.forEach(line => setTrendingLineElementsVisibility(line, false));
            }

            if (isDrawingHzTrendingLine) {
                handleHzTrendingLineClick(boundedX, boundedY)
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

            if (isDrawingFreeTrendingLine || isDrawingHzTrendingLine) return;

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

function freeLineCircleDragHandler(this: SVGCircleElement, event: d3.D3DragEvent<SVGCircleElement, unknown, unknown>) {

    const circle = d3.select(this);
    const circleId = circle.attr('id');

    const lineData = trendingLinesData.find((d: TrendingLineData) => {
        const startCircleId = d.startCircle?.attr('id');
        const endCircleId = d.endCircle?.attr('id');
        return startCircleId === circleId || endCircleId === circleId;
    });

    if (!lineData) return;

    const [minPrice, maxPrice] = d3.extent(data, (d: OHLCVData) => d.close);
    const [minDate, maxDate] = d3.extent(data, (d: OHLCVData) => d.date);
    let minX = xScale(minDate as Date)
    let maxX = xScale(maxDate as Date)
    let maxY = yScale(minPrice as number)
    let minY = yScale(maxPrice as number)

    const boundedX = Math.max(minX, Math.min(event.x, maxX));
    const boundedY = Math.max(minY, Math.min(event.y, maxY));

    // // Update circle position
    circle.attr('cx', boundedX).attr('cy', boundedY);

    const price = Number(yScale.invert(boundedY).toFixed(2));
    const date = xScale.invert(boundedX);

    // Update line position
    const isStartCircle = lineData.startCircle?.attr('id') === circleId;
    if (isStartCircle) {
        lineData.line.attr('x1', boundedX).attr('y1', boundedY);
        lineData.startPrice = price;
        lineData.startDate = date;
    } else {
        lineData.line.attr('x2', boundedX).attr('y2', boundedY);
        lineData.endPrice = price;
        lineData.endDate = date;
    }

    updateTrendingLinePriceHighlight(lineData);
    updateTrendingLineDateHighlight(lineData)
}

function freeLineDragHandler(this: SVGLineElement, event: d3.D3DragEvent<SVGLineElement, unknown, unknown>) {
    const line = d3.select(this);
    const lineId = line.attr('id');

    const lineData = trendingLinesData.find((d: TrendingLineData) => d.line?.attr('id') === lineId);

    if (!lineData) return;

    const [minPrice, maxPrice] = d3.extent(data, (d: OHLCVData) => d.close);
    const [minDate, maxDate] = d3.extent(data, (d: OHLCVData) => d.date);
    let minX = xScale(minDate as Date)
    let maxX = xScale(maxDate as Date)
    let maxY = yScale(minPrice as number)
    let minY = yScale(maxPrice as number)

    const dx = event.dx;
    const dy = event.dy;
    let newX1 = Number(line.attr('x1')) + dx;
    let newX2 = Number(line.attr('x2')) + dx;
    let newY1 = Number(line.attr('y1')) + dy;
    let newY2 = Number(line.attr('y2')) + dy;

    const boundedX1 = Math.max(minX, Math.min(newX1, maxX));
    const boundedX2 = Math.max(minX, Math.min(newX2, maxX));
    const boundedY1 = Math.max(minY, Math.min(newY1, maxY));
    const boundedY2 = Math.max(minY, Math.min(newY2, maxY));

    line
        .attr('x1', boundedX1)
        .attr('y1', boundedY1)
        .attr('x2', boundedX2)
        .attr('y2', boundedY2);

    // Update start and end circles
    lineData.startCircle?.attr('cx', boundedX1).attr('cy', boundedY1);
    lineData.endCircle?.attr('cx', boundedX2).attr('cy', boundedY2);

    lineData.startPrice = Number(yScale.invert(boundedY1).toFixed(2));
    lineData.endPrice = Number(yScale.invert(boundedY2).toFixed(2));

    lineData.startDate = xScale.invert(boundedX1);
    lineData.endDate = xScale.invert(boundedX2);
    updateTrendingLinePriceHighlight(lineData);
    updateTrendingLineDateHighlight(lineData);
}

function hzLineDragHandler(this: SVGLineElement, event: d3.D3DragEvent<SVGLineElement, unknown, unknown>) {
    const line = d3.select(this);
    const lineId = line.attr('id');

    const lineData = trendingLinesData.find((d: TrendingLineData) => d.line?.attr('id') === lineId);

    if (!lineData) return;

    const [minPrice, maxPrice] = d3.extent(data, (d: OHLCVData) => d.close);
    let maxY = yScale(minPrice as number)
    let minY = yScale(maxPrice as number)

    const boundedY = Math.max(minY, Math.min(event.y, maxY));
    const price = Number(yScale.invert(boundedY).toFixed(2));

    lineData.line.attr('y1', boundedY).attr('y2', boundedY);
    lineData.startPrice = price;
    lineData.endPrice = price;

    updateTrendingLinePriceHighlight(lineData);
    updateTrendingLineDateHighlight(lineData);
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

        const circleId = `trending-line-start-${Date.now()}`;
        let startCircle = freeTrendingLinesGroup
            .append('circle')
            .attr('class', 'trending-line-start')
            .attr('cx', boundedX)
            .attr('cy', boundedY)
            .attr('id', circleId)
            .attr('r', 5)
            .attr('fill', 'white')
            .attr("stroke", "#2862ff")
            .attr("stroke-width", "2")
            .style('cursor', "default")
            .call(d3.drag<SVGCircleElement, unknown>().on("drag", freeLineCircleDragHandler))

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
            priceHighlightRect: startTrendingLinePriceHighlight(price, boundedY, svgWidth, margin, false),
            dateHighlightRect: startTrendingLineDateHighlight(date, boundedX, svgHeight, margin, false),
        }
    }
    else if (drawingTrendingLine) {
        const lineId = `trending-line-${Date.now()}`;
        drawingTrendingLine.line
            .attr('x2', boundedX)
            .attr('y2', boundedY)
            .attr('id', lineId)
            .call(d3.drag<SVGLineElement, unknown>().on("drag", freeLineDragHandler));

        const circleId = `trending-line-end-${Date.now()}`;
        let endCircle = freeTrendingLinesGroup
            .append('circle')
            .attr('class', 'trending-line-end')
            .attr('id', circleId)
            .attr('cx', boundedX)
            .attr('cy', boundedY)
            .attr('r', 5)
            .attr('fill', 'white')
            .attr("stroke", "#2862ff")
            .attr("stroke-width", "2")
            .style('cursor', "default")
            .call(d3.drag<SVGCircleElement, unknown>().on("drag", freeLineCircleDragHandler))

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
            endTrendingLineDateHighlight(drawingTrendingLine.dateHighlightRect)
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
    const date = new Date(xScale.invert(boundedX))
    coverTrendingLinePriceHighlight(price, boundedY, svgWidth, margin, drawingTrendingLine.priceHighlightRect)
    coverTrendingLineDateHighlight(date, boundedX, svgHeight, margin, drawingTrendingLine.dateHighlightRect)
}

function handleHzTrendingLineClick(boundedX: number, boundedY: number) {
    let hzTrendingLinesGroup = d3.select('.hz-trending-lines')
    const lineId = `trending-line-${Date.now()}`;
    let hzTrendingLine = hzTrendingLinesGroup
        .append('line')
        .attr('class', 'trending-line')
        .attr('id', lineId)
        .attr('x1', margin.left)
        .attr('y1', boundedY)
        .attr('x2', svgWidth - margin.right)
        .attr('y2', boundedY)
        .attr('stroke', '#2862ff')
        .attr('stroke-width', 2)
        .style("cursor", "ns-resize")
        .call(d3.drag<SVGLineElement, unknown>().on("drag", hzLineDragHandler));

    const price = Number(yScale.invert(boundedY).toFixed(2))
    const date = xScale.invert(boundedX);

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
            priceHighlightRect: startTrendingLinePriceHighlight(price, boundedY, svgWidth, margin, true),
            dateHighlightRect: startTrendingLineDateHighlight(date, boundedY, svgWidth, margin, true)
        })
    }
    if (onTrendingLineComplete) onTrendingLineComplete()
    resetDrawingTrendingLine()
}

// --- TRENDING LINEs AXIS HIGhLIGHTs ----
function startTrendingLineDateHighlight(
    date: Date,
    x: number,
    svgHeight: number,
    margin: Margin,
    isHzLine: boolean
): AxisTrendingLineHighlightRect {
    let axisGroup = d3.select('.trending-lines-price-hightler')
    let group = axisGroup.select(`.${isHzLine ? 'hz' : 'free'}-trending-lines-price-hightler`)
    let startRect = group.append('rect')
    let startText = group.append('text')
    let endRect = isHzLine ? startRect : group.append('rect')
    let coverRect = isHzLine ? startRect : group.append('rect')
    let endText = isHzLine ? startText : group.append('text')

    if (!isHzLine)
        coverRect
            .attr('x', x)
            .attr('y', svgHeight - margin.bottom)
            .attr('width', '100px')
            .attr('height', '18px')
            .attr('width', 100)
            .attr('class', 'highlight-rect')
            .attr('fill', '#c9d8ff')
            .style('opacity', 0.5)

    startRect
        .attr('x', x - 50)
        .attr('y', svgHeight - margin.bottom)
        .attr('width', '100px')
        .attr('height', '18px')
        .attr('class', 'start-rect')
        .attr('fill', isHzLine ? '#2862ff' : '#049981')
        .style('opacity', 1)

    startText
        .attr('class', 'start-text')
        .text(formatDate(date))
        .attr('fill', 'white')
        .attr('font-size', '10px')
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle')
        .attr('dy', 1)
        .attr('x', x)
        .attr('y', (svgHeight - margin.bottom + 8));

    if (!isHzLine)
        endRect
            .attr('x', x - 50)
            .attr('y', svgHeight - margin.bottom)
            .attr('width', '100px')
            .attr('height', '18px')
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

function endTrendingLineDateHighlight(
    dateHighlightRect: AxisTrendingLineHighlightRect,
) {
    dateHighlightRect.startRect.attr('fill', '#2862ff')
    dateHighlightRect.endRect.attr('fill', '#2862ff')
}

function startTrendingLinePriceHighlight(
    price: number,
    y: number,
    svgWidth: number,
    margin: Margin,
    isHzLine: boolean
): AxisTrendingLineHighlightRect {
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

function coverTrendingLineDateHighlight(
    date: Date,
    x: number,
    svgHeight: number,
    margin: Margin,
    dateHighlightRect: AxisTrendingLineHighlightRect,
) {
    dateHighlightRect.endRect
        .attr('x', x - 50)
        .style('opacity', 1)

    dateHighlightRect.endText
        .attr('class', 'end-text')
        .text(formatDate(date))
        .attr('fill', 'white')
        .attr('font-size', '10px')
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle')
        .attr('dy', 1)
        .attr('x', x)
        .attr('y', (svgHeight - margin.bottom + 8));

    const startX = Number(dateHighlightRect.startRect.attr('x'));

    if (x < startX) {
        let endX = x + 50;
        dateHighlightRect.coverRect
            .attr('x', endX)
            .attr('width', Math.max(startX - endX, 0))
    }
    else {
        let endX = x - 50;
        dateHighlightRect.coverRect
            .attr('x', startX + 100)
            .attr('width', Math.max(endX - (startX + 100), 0))
    }
}

function coverTrendingLinePriceHighlight(
    price: number,
    y: number,
    svgWidth: number,
    margin: Margin,
    priceHighlightRect: AxisTrendingLineHighlightRect,
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
    priceHighlightRect: AxisTrendingLineHighlightRect,
) {
    priceHighlightRect.startRect.attr('fill', '#2862ff')
    priceHighlightRect.endRect.attr('fill', '#2862ff')
}

// handle Trending Lines & Price Highlights On ScaleUpdate i.e zoom
function handleTrendingLineOnScaleUpdate() {
    trendingLinesData.forEach((trendingLineData) => {
        const { isHz, line, priceHighlightRect, dateHighlightRect, startPrice, endPrice, startDate, endDate, startCircle, endCircle } = trendingLineData

        const [minPrice, maxPrice] = d3.extent(data, (d: OHLCVData) => d.close);
        const [minDate, maxDate] = d3.extent(data, (d: OHLCVData) => d.date);
        let minX = xScale(minDate as Date)
        let maxX = xScale(maxDate as Date)
        let maxY = yScale(minPrice as number)
        let minY = yScale(maxPrice as number)

        // Add Trending lines
        let x1 = xScale(startDate)
        let y1 = yScale(startPrice)
        let x2 = xScale(endDate)
        let y2 = yScale(endPrice)

        x1 = Math.max(minX, Math.min(x1, maxX));
        x2 = Math.max(minX, Math.min(x2, maxX));
        y1 = Math.max(minY, Math.min(y1, maxY));
        y2 = Math.max(minY, Math.min(y2, maxY));

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

        // Date Highlight Rects
        dateHighlightRect.startRect.attr('x', x1 - 50)
        dateHighlightRect.startText.attr('x', x1)

        if (!isHz) {
            let wentLeft = x2 < x1

            dateHighlightRect.endRect.attr('x', x2 - 50)
            dateHighlightRect.endText.attr('x', x2)
            dateHighlightRect.coverRect
                .attr('x', wentLeft ? x2 + 50 : x1 + 50)
                .attr('width', wentLeft ? Math.max(x1 - (x2 + 100), 0) : Math.max(x2 - (x1 + 100), 0));

            let wentUp = y2 < y1;

            // end Price tag
            trendingLineData.priceHighlightRect.endRect.attr('y', y2 - 6)
            trendingLineData.priceHighlightRect.endText.attr('y', y2)

            // area cover tag
            trendingLineData.priceHighlightRect.coverRect
                .attr('y', wentUp ? y2 + 6 : y1 + 6)
                .attr('height', wentUp ? Math.max(y1 - (y2 + 12), 0) : Math.max(y2 - (y1 + 12), 0));
        }

    });
}

// Add this new function after the existing functions but before the exports
function setTrendingLineElementsVisibility(trendingLineData: TrendingLineData, isVisible: boolean) {
    const { startCircle, endCircle, priceHighlightRect, dateHighlightRect, isHz } = trendingLineData;
    
    // Set circle visibility
    if (startCircle) {
        startCircle.style('opacity', isVisible ? 1 : 0);
    }
    if (endCircle) {
        endCircle.style('opacity', isVisible ? 1 : 0);
    }

    // Set price highlight visibility
    if (priceHighlightRect) {
        priceHighlightRect.startRect.style('opacity', isVisible ? 1 : 0);
        priceHighlightRect.startText.style('opacity', isVisible ? 1 : 0);
        if(!isHz) {
            if (priceHighlightRect.endRect) {
                priceHighlightRect.endRect.style('opacity', isVisible ? 1 : 0);
                priceHighlightRect.endText.style('opacity', isVisible ? 1 : 0);
            }
            if (priceHighlightRect.coverRect) {
                priceHighlightRect.coverRect.style('opacity', isVisible ? 0.5 : 0);
            }

        }
    }

    // Set date highlight visibility
    if (dateHighlightRect) {
        dateHighlightRect.startRect.style('opacity', isVisible ? 1 : 0);
        dateHighlightRect.startText.style('opacity', isVisible ? 1 : 0);
        if (dateHighlightRect.endRect) {
            dateHighlightRect.endRect.style('opacity', isVisible ? 1 : 0);
            dateHighlightRect.endText.style('opacity', isVisible ? 1 : 0);
        }
        if (dateHighlightRect.coverRect) {
            dateHighlightRect.coverRect.style('opacity', isVisible ? 0.5 : 0);
        }
    }
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

        const [minPrice, maxPrice] = d3.extent(data, (d: OHLCVData) => d.close);
        const [minDate, maxDate] = d3.extent(data, (d: OHLCVData) => d.date);
        let minX = xScale(minDate as Date)
        let maxX = xScale(maxDate as Date)
        let maxY = yScale(minPrice as number)
        let minY = yScale(maxPrice as number)

        // Add Trending lines
        let x1 = xScale(startDate)
        let y1 = yScale(startPrice)
        let x2 = xScale(endDate)
        let y2 = yScale(endPrice)

        // in bound
        x1 = Math.max(minX, Math.min(x1, maxX));
        x2 = Math.max(minX, Math.min(x2, maxX));
        y1 = Math.max(minY, Math.min(y1, maxY));
        y2 = Math.max(minY, Math.min(y2, maxY));

        // calculate & set start ends values in bound
        x1 = Math.min(x1, x2);
        x2 = Math.max(x1, x2);
        y1 = Math.min(y1, y2);
        y2 = Math.max(y1, y2);
        trendingLineData.startDate = xScale.invert(x1)
        trendingLineData.endDate = xScale.invert(x2)
        trendingLineData.startPrice = Number(yScale.invert(y1).toFixed(2))
        trendingLineData.endPrice = Number(yScale.invert(y2).toFixed(2))


        if (isHz) {
            const lineId = `trending-line-${Date.now()}`;
            trendingLineData.line = hzTrendingLinesGroup
                .append('line')
                .attr('class', 'trending-line')
                .attr('id', lineId)
                .attr('x1', margin.left)
                .attr('y1', y1)
                .attr('x2', svgWidth - margin.right)
                .attr('y2', y1)
                .attr('stroke', '#2862ff')
                .attr('stroke-width', 2)
                .style("cursor", "ns-resize")
                .call(d3.drag<SVGLineElement, unknown>().on("drag", hzLineDragHandler));
        }
        else {
            const lineId = `trending-line-${Date.now()}`;
            trendingLineData.line = freeTrendingLinesGroup
                .append('line')
                .attr('class', 'trending-line')
                .attr('id', lineId)
                .attr("x1", x1)
                .attr("x2", x2)
                .attr("y1", y1)
                .attr("y2", y2)
                .attr('stroke', '#2862ff')
                .attr('stroke-width', 2)
                .style('cursor', 'move')
                .call(d3.drag<SVGLineElement, unknown>().on("drag", freeLineDragHandler));

            const startCircleId = `trending-line-start-${Date.now()}`;
            trendingLineData.startCircle = freeTrendingLinesGroup
                .append('circle')
                .attr('class', 'trending-line-start')
                .attr('id', startCircleId)
                .attr('cx', x1)
                .attr('cy', y1)
                .attr('r', 5)
                .attr('fill', 'white')
                .attr("stroke", "#2862ff")
                .attr("stroke-width", "2")
                .style('cursor', "default")
                .call(d3.drag<SVGCircleElement, unknown>().on("drag", freeLineCircleDragHandler));

            const endCircleId = `trending-line-end-${Date.now()}`;
            trendingLineData.endCircle = freeTrendingLinesGroup
                .append('circle')
                .attr('class', 'trending-line-end')
                .attr('id', endCircleId)
                .attr('cx', x2)
                .attr('cy', y2)
                .attr('r', 5)
                .attr('fill', 'white')
                .attr("stroke", "#2862ff")
                .attr("stroke-width", "2")
                .style('cursor', "default")
                .call(d3.drag<SVGCircleElement, unknown>().on("drag", freeLineCircleDragHandler));
        }

        // Price Highlights
        let group = isHz ? hzAxisGroup : freeAxisGroup
        let priceStartRect = group.append('rect')
        let priceStartText = group.append('text')
        let priceCoverRect = isHz ? priceStartRect : group.append('rect')
        let priceEndRect = isHz ? priceStartRect : group.append('rect')
        let priceEndText = isHz ? priceStartRect : group.append('text')

        let dateStartRect = group.append('rect')
        let dateStartText = group.append('text')
        let dateCoverRect = isHz ? dateStartRect : group.append('rect')
        let dateEndRect = isHz ? dateStartRect : group.append('rect')
        let dateEndText = isHz ? dateStartRect : group.append('text')

        trendingLineData.priceHighlightRect.startRect = priceStartRect
            .attr('x', svgWidth - margin.right)
            .attr('y', y1 - 6)
            .attr('width', '36px')
            .attr('height', '12px')
            .attr('class', 'start-rect')
            .attr('fill', '#2862ff')
            .style('opacity', 1)

        trendingLineData.priceHighlightRect.startText = priceStartText
            .attr('class', 'start-text')
            .text(startPrice)
            .attr('fill', 'white')
            .attr('font-size', '10px')
            .attr('text-anchor', 'middle')
            .attr('alignment-baseline', 'middle')
            .attr('dy', 1)
            .attr('x', (svgWidth - margin.right) + (36 / 2))
            .attr('y', y1);

        trendingLineData.priceHighlightRect.startRect = dateStartRect
            .attr('x', x1 - 50)
            .attr('y', svgHeight - margin.bottom)
            .attr('width', '100px')
            .attr('height', '18px')
            .attr('class', 'start-rect')
            .attr('fill', '#2862ff')
            .style('opacity', 1)

        trendingLineData.priceHighlightRect.startText = dateStartText
            .attr('class', 'start-text')
            .text(formatDate(startDate))
            .attr('fill', 'white')
            .attr('font-size', '10px')
            .attr('text-anchor', 'middle')
            .attr('alignment-baseline', 'middle')
            .attr('dy', 1)
            .attr('x', x1)
            .attr('y', (svgHeight - margin.bottom + 8));

        if (!isHz) {

            trendingLineData.priceHighlightRect.endRect = priceEndRect
                .attr('x', svgWidth - margin.right)
                .attr('y', y2 - 6)
                .attr('width', '36px')
                .attr('height', '12px')
                .attr('class', 'end-rect')
                .attr('fill', '#2862ff')
                .style('opacity', 1)

            trendingLineData.priceHighlightRect.endText = priceEndText
                .attr('class', 'end-text')
                .text(endPrice)
                .attr('fill', 'white')
                .attr('font-size', '10px')
                .attr('text-anchor', 'middle')
                .attr('alignment-baseline', 'middle')
                .attr('dy', 1)
                .attr('x', (svgWidth - margin.right) + (36 / 2))
                .attr('y', y2);

            trendingLineData.dateHighlightRect.endRect = dateEndRect
                .attr('x', x2 - 50)
                .attr('y', svgHeight - margin.bottom)
                .attr('width', '100px')
                .attr('height', '18px')
                .attr('class', 'start-rect')
                .attr('fill', '#2862ff')
                .style('opacity', 1)

            trendingLineData.dateHighlightRect.endText = dateEndText
                .attr('class', 'end-text')
                .text(formatDate(endDate))
                .attr('fill', 'white')
                .attr('font-size', '10px')
                .attr('text-anchor', 'middle')
                .attr('alignment-baseline', 'middle')
                .attr('dy', 1)
                .attr('x', x2)
                .attr('y', (svgHeight - margin.bottom + 8));

        }

        // Initially hide all elements
        setTrendingLineElementsVisibility(trendingLineData, false);
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

// Add this new function to update price highlights when dragging
function updateTrendingLineDateHighlight(trendingLineData: TrendingLineData) {
    const { isHz, dateHighlightRect, startDate, endDate } = trendingLineData;

    if (isHz) return;

    const startX = xScale(startDate);
    const endX = xScale(endDate);

    dateHighlightRect.startRect.attr('x', startX - 50);
    dateHighlightRect.startText
        .attr('x', startX)
        .text(formatDate(startDate));

    dateHighlightRect.endRect.attr('x', endX - 50);
    dateHighlightRect.endText
        .attr('x', endX)
        .text(formatDate(endDate));

    const wentLeft = endX < startX;
    dateHighlightRect.coverRect
        .attr('x', wentLeft ? endX + 50 : startX + 50)
        .attr('width', wentLeft ? Math.max(startX - (endX + 100), 0) : Math.max(endX - (startX + 100), 0));
}

export {
    initCharts,
    addDataPoint,
    drawLineChart, drawCandleStickChart,
    startFreeTrendingLineDrawing, startHzTrendingLineDrawing,
    drawSMALine, hideSMALine,
    addTrendingLines, removeDrawingTrendingLine
}

