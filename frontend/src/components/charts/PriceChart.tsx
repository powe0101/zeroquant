import { onMount, onCleanup, createEffect, on } from 'solid-js'
import { createChart, ColorType, CandlestickSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, CandlestickData, LineData, SeriesMarker, Time, ISeriesMarkersPluginApi, LogicalRange } from 'lightweight-charts'

/** 시간 범위 타입 (차트 동기화용) */
export interface TimeRange {
  from: Time
  to: Time
}

export interface CandlestickDataPoint {
  time: string | number
  open: number
  high: number
  low: number
  close: number
}

export interface LineDataPoint {
  time: string | number
  value: number
}

/** 지표 오버레이 데이터. */
export interface IndicatorOverlay {
  id: string
  name: string
  data: LineDataPoint[]
  color: string
  lineWidth?: number
  priceScaleId?: 'left' | 'right'
}

/** 거래 마커 타입. */
export type TradeMarkerType = 'entry' | 'exit' | 'buy' | 'sell' | 'stop' | 'target'

/** 거래 마커 데이터. */
export interface TradeMarker {
  time: string | number
  type: TradeMarkerType
  price?: number
  label?: string
}

/** 마커 타입별 설정 반환. */
function getMarkerConfig(type: TradeMarkerType): {
  position: 'aboveBar' | 'belowBar' | 'inBar'
  color: string
  shape: 'circle' | 'arrowUp' | 'arrowDown' | 'square'
  defaultLabel: string
} {
  switch (type) {
    case 'entry':
    case 'buy':
      return { position: 'belowBar', color: '#22c55e', shape: 'arrowUp', defaultLabel: 'BUY' }
    case 'exit':
    case 'sell':
      return { position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', defaultLabel: 'SELL' }
    case 'stop':
      return { position: 'aboveBar', color: '#f97316', shape: 'circle', defaultLabel: 'STOP' }
    case 'target':
      return { position: 'aboveBar', color: '#3b82f6', shape: 'square', defaultLabel: 'TP' }
    default:
      return { position: 'inBar', color: '#6b7280', shape: 'circle', defaultLabel: '' }
  }
}

interface PriceChartProps {
  data: CandlestickDataPoint[] | LineDataPoint[]
  type?: 'candlestick' | 'line'
  height?: number
  showVolume?: boolean
  /** 지표 오버레이 목록. */
  indicators?: IndicatorOverlay[]
  /** 거래 마커 목록 (진입/청산 표시). */
  markers?: TradeMarker[]
  colors?: {
    background?: string
    text?: string
    grid?: string
    upColor?: string
    downColor?: string
    lineColor?: string
  }
}

export function PriceChart(props: PriceChartProps) {
  let containerRef: HTMLDivElement | undefined
  let chart: IChartApi | undefined
  let mainSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | undefined
  let markersPlugin: ISeriesMarkersPluginApi<Time> | undefined
  const indicatorSeries = new Map<string, ISeriesApi<'Line'>>()

  const defaultColors = {
    background: 'transparent',
    text: '#d1d5db',
    grid: '#374151',
    upColor: '#22c55e',
    downColor: '#ef4444',
    lineColor: '#3b82f6',
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
      height: props.height || 400,
      crosshair: {
        mode: 1,
      },
      timeScale: {
        borderColor: colors.grid,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: colors.grid,
      },
    })

    // Create series based on type (lightweight-charts v5 API)
    if (props.type === 'line') {
      mainSeries = chart.addSeries(LineSeries, {
        color: colors.lineColor,
        lineWidth: 2,
      })
    } else {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: colors.upColor,
        downColor: colors.downColor,
        borderUpColor: colors.upColor,
        borderDownColor: colors.downColor,
        wickUpColor: colors.upColor,
        wickDownColor: colors.downColor,
      })
    }

    // Set initial data with slight delay to ensure DOM is ready
    if (props.data && props.data.length > 0) {
      // Sort data by time to ensure correct order
      const sortedData = [...props.data].sort((a, b) => {
        const timeA = typeof a.time === 'string' ? a.time : a.time.toString()
        const timeB = typeof b.time === 'string' ? b.time : b.time.toString()
        return timeA.localeCompare(timeB)
      })
      mainSeries.setData(sortedData as CandlestickData[] | LineData[])
      // Use requestAnimationFrame to ensure chart is fully rendered
      requestAnimationFrame(() => {
        chart?.timeScale().fitContent()
      })
    }

    // Handle resize
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

  // Update data when props change
  createEffect(
    on(
      () => props.data,
      (data) => {
        if (mainSeries && data && data.length > 0) {
          mainSeries.setData(data as CandlestickData[] | LineData[])
          chart?.timeScale().fitContent()
        }
      }
    )
  )

  // Update indicator overlays when props.indicators change
  createEffect(
    on(
      () => props.indicators,
      (indicators) => {
        if (!chart) return

        // Remove old indicator series that are no longer in the list
        const currentIds = new Set(indicators?.map(i => i.id) || [])
        for (const [id, series] of indicatorSeries.entries()) {
          if (!currentIds.has(id)) {
            chart.removeSeries(series)
            indicatorSeries.delete(id)
          }
        }

        // Add or update indicator series
        if (indicators) {
          for (const indicator of indicators) {
            let series = indicatorSeries.get(indicator.id)

            if (!series) {
              // Create new series for this indicator
              // LineWidth must be 1, 2, 3, or 4 in LightweightCharts
              const lineWidth = (indicator.lineWidth && indicator.lineWidth >= 1 && indicator.lineWidth <= 4
                ? indicator.lineWidth
                : 2) as 1 | 2 | 3 | 4
              series = chart.addSeries(LineSeries, {
                color: indicator.color,
                lineWidth,
                priceScaleId: indicator.priceScaleId || 'right',
                lastValueVisible: true,
                priceLineVisible: false,
              })
              indicatorSeries.set(indicator.id, series)
            }

            // Update series data
            if (indicator.data && indicator.data.length > 0) {
              const sortedData = [...indicator.data].sort((a, b) => {
                const timeA = typeof a.time === 'string' ? a.time : a.time.toString()
                const timeB = typeof b.time === 'string' ? b.time : b.time.toString()
                return timeA.localeCompare(timeB)
              })
              series.setData(sortedData as LineData[])
            }
          }
        }
      }
    )
  )

  // Update trade markers when props.markers change (Lightweight Charts v5 API)
  createEffect(
    on(
      () => props.markers,
      (markers) => {
        if (!mainSeries) return

        // Convert TradeMarker to SeriesMarker format
        const seriesMarkers: SeriesMarker<Time>[] = (markers || [])
          .map((marker) => {
            const config = getMarkerConfig(marker.type)
            return {
              time: marker.time as Time,
              position: config.position,
              color: config.color,
              shape: config.shape,
              text: marker.label || config.defaultLabel,
            }
          })
          .sort((a, b) => {
            const timeA = typeof a.time === 'string' ? a.time : String(a.time)
            const timeB = typeof b.time === 'string' ? b.time : String(b.time)
            return timeA.localeCompare(timeB)
          })

        // Remove existing markers plugin and create new one
        if (markersPlugin) {
          markersPlugin.setMarkers([])
        }

        if (seriesMarkers.length > 0) {
          markersPlugin = createSeriesMarkers(mainSeries, seriesMarkers)
        }
      }
    )
  )

  return (
    <div
      ref={containerRef}
      class="w-full rounded-lg overflow-hidden"
      style={{ height: `${props.height || 400}px` }}
    />
  )
}
