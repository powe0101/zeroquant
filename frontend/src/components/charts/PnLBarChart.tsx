/**
 * 손익 막대 차트 컴포넌트
 *
 * lightweight-charts를 사용하여 손익 데이터를 막대 그래프로 표시합니다.
 * - 양수 손익: 초록색
 * - 음수 손익: 빨간색
 */
import { onMount, onCleanup, createEffect, on } from 'solid-js'
import { createChart, ColorType, HistogramSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, HistogramData } from 'lightweight-charts'

export interface PnLDataPoint {
  time: string // YYYY-MM-DD 형식
  value: number
  color?: string
}

interface PnLBarChartProps {
  data: PnLDataPoint[]
  height?: number
  colors?: {
    background?: string
    text?: string
    grid?: string
    positiveColor?: string
    negativeColor?: string
  }
}

// 데이터를 시간순으로 정렬
function sortByTime(data: PnLDataPoint[]): PnLDataPoint[] {
  return [...data].sort((a, b) => a.time.localeCompare(b.time))
}

// 값에 따라 색상 적용
function applyColors(
  data: PnLDataPoint[],
  positiveColor: string,
  negativeColor: string
): HistogramData[] {
  return data.map(point => ({
    time: point.time,
    value: point.value,
    color: point.value >= 0 ? positiveColor : negativeColor,
  })) as HistogramData[]
}

export function PnLBarChart(props: PnLBarChartProps) {
  let containerRef: HTMLDivElement | undefined
  let chart: IChartApi | undefined
  let histogramSeries: ISeriesApi<'Histogram'> | undefined

  const defaultColors = {
    background: 'transparent',
    text: '#d1d5db',
    grid: '#374151',
    positiveColor: '#22c55e', // green-500
    negativeColor: '#ef4444', // red-500
  }

  const getColors = () => ({
    ...defaultColors,
    ...props.colors,
  })

  onMount(() => {
    if (!containerRef) return

    const colors = getColors()

    chart = createChart(containerRef, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      width: containerRef.clientWidth,
      height: props.height || 200,
      crosshair: {
        mode: 1,
      },
      timeScale: {
        borderColor: colors.grid,
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: colors.grid,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      localization: {
        priceFormatter: (price: number) => {
          if (Math.abs(price) >= 1000000) {
            return (price / 1000000).toFixed(1) + 'M'
          } else if (Math.abs(price) >= 1000) {
            return (price / 1000).toFixed(0) + 'K'
          }
          return price.toFixed(0)
        },
      },
    })

    // Histogram series
    histogramSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'price',
        precision: 0,
        minMove: 1,
      },
    })

    // 초기 데이터 설정
    if (props.data && props.data.length > 0) {
      const sortedData = sortByTime(props.data)
      const coloredData = applyColors(sortedData, colors.positiveColor, colors.negativeColor)
      histogramSeries.setData(coloredData)
      chart.timeScale().fitContent()
    }

    // 리사이즈 핸들러
    const handleResize = () => {
      if (chart && containerRef) {
        chart.applyOptions({ width: containerRef.clientWidth })
      }
    }

    window.addEventListener('resize', handleResize)

    onCleanup(() => {
      window.removeEventListener('resize', handleResize)
      if (chart) {
        chart.remove()
      }
    })
  })

  // 데이터 업데이트
  createEffect(
    on(
      () => props.data,
      (data) => {
        if (histogramSeries && data && data.length > 0) {
          const colors = getColors()
          const sortedData = sortByTime(data)
          const coloredData = applyColors(sortedData, colors.positiveColor, colors.negativeColor)
          histogramSeries.setData(coloredData)
          chart?.timeScale().fitContent()
        }
      }
    )
  )

  return (
    <div
      ref={containerRef}
      class="w-full rounded-lg overflow-hidden"
      style={{ height: `${props.height || 200}px` }}
    />
  )
}

export default PnLBarChart
