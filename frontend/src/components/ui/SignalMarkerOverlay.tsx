/**
 * 신호 마커 오버레이 컴포넌트
 *
 * 차트 위에 매수/매도 신호를 시각화합니다.
 * 백테스트 결과 또는 실시간 신호를 표시하는 데 사용됩니다.
 */
import { type Component, For, Show, createMemo, createSignal } from 'solid-js'
import type { SignalMarker, SignalIndicators } from '../../types'
import { formatNumber, formatPercent } from './ChartUtils'

// ==================== 타입 정의 ====================

export interface SignalMarkerOverlayProps {
  /** 신호 마커 배열 */
  markers: SignalMarker[]
  /** 컨테이너 너비 (px) */
  width: number
  /** 컨테이너 높이 (px) */
  height: number
  /** 가격 범위 (min, max) */
  priceRange: { min: number; max: number }
  /** 시간 범위 (시작, 종료 타임스탬프) */
  timeRange: { start: number; end: number }
  /** 마커 클릭 핸들러 */
  onMarkerClick?: (marker: SignalMarker) => void
  /** 호버 시 툴팁 표시 여부 */
  showTooltip?: boolean
  /** 필터: 표시할 신호 유형 */
  signalTypeFilter?: string[]
  /** 필터: 표시할 방향 */
  sideFilter?: ('Buy' | 'Sell')[]
}

// ==================== 유틸리티 ====================

/**
 * 가격을 Y 좌표로 변환
 */
function priceToY(price: number, range: { min: number; max: number }, height: number): number {
  const { min, max } = range
  if (max === min) return height / 2
  return height - ((price - min) / (max - min)) * height
}

/**
 * 타임스탬프를 X 좌표로 변환
 */
function timeToX(
  timestamp: number,
  range: { start: number; end: number },
  width: number
): number {
  const { start, end } = range
  if (end === start) return width / 2
  return ((timestamp - start) / (end - start)) * width
}

/**
 * 신호 강도에 따른 마커 크기
 */
function getMarkerSize(strength: number): number {
  // 0.0 ~ 1.0 -> 16px ~ 32px
  return 16 + strength * 16
}

// ==================== 서브 컴포넌트 ====================

interface MarkerIconProps {
  side: 'Buy' | 'Sell' | undefined
  size: number
  executed: boolean
}

/**
 * 마커 아이콘 (삼각형)
 */
const MarkerIcon: Component<MarkerIconProps> = (props) => {
  const isBuy = () => props.side === 'Buy'
  const color = () => (isBuy() ? '#10B981' : '#EF4444') // green / red
  const fillOpacity = () => (props.executed ? 1 : 0.5)

  // 삼각형 SVG (위/아래 방향)
  return (
    <svg
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      style={{ filter: props.executed ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : 'none' }}
    >
      <Show
        when={isBuy()}
        fallback={
          // 매도: 아래 방향 삼각형
          <path
            d="M12 18L4 6h16L12 18z"
            fill={color()}
            fill-opacity={fillOpacity()}
            stroke={color()}
            stroke-width="2"
          />
        }
      >
        {/* 매수: 위 방향 삼각형 */}
        <path
          d="M12 6L4 18h16L12 6z"
          fill={color()}
          fill-opacity={fillOpacity()}
          stroke={color()}
          stroke-width="2"
        />
      </Show>
    </svg>
  )
}

interface SignalTooltipProps {
  marker: SignalMarker
  x: number
  y: number
}

/**
 * 신호 툴팁
 */
const SignalTooltip: Component<SignalTooltipProps> = (props) => {
  const isBuy = () => props.marker.side === 'Buy'

  // 지표 목록 생성
  const indicatorEntries = createMemo(() => {
    const entries: { key: string; value: string }[] = []
    const ind = props.marker.indicators
    if (ind.rsi !== undefined) entries.push({ key: 'RSI', value: formatNumber(ind.rsi, { decimals: 1 }) })
    if (ind.macd !== undefined) entries.push({ key: 'MACD', value: formatNumber(ind.macd, { decimals: 4 }) })
    if (ind.volume_ratio !== undefined) entries.push({ key: '거래량비', value: formatNumber(ind.volume_ratio, { decimals: 1 }) + 'x' })
    if (ind.atr !== undefined) entries.push({ key: 'ATR', value: formatNumber(ind.atr, { decimals: 2 }) })
    return entries
  })

  // 툴팁 위치 조정 (화면 밖으로 나가지 않도록)
  const tooltipStyle = createMemo(() => {
    const left = props.x < 150 ? props.x + 20 : props.x - 200
    const top = props.y < 150 ? props.y + 20 : props.y - 150
    return { left: `${left}px`, top: `${top}px` }
  })

  return (
    <div
      class="absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
             rounded-lg shadow-xl p-3 min-w-[180px] text-sm pointer-events-none"
      style={tooltipStyle()}
    >
      {/* 헤더 */}
      <div class="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <span class="font-semibold text-gray-900 dark:text-white">{props.marker.symbol}</span>
        <span
          class={`px-2 py-0.5 rounded text-xs font-medium ${
            isBuy()
              ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
          }`}
        >
          {props.marker.side || '신호'}
        </span>
      </div>

      {/* 신호 정보 */}
      <div class="space-y-1">
        <div class="flex justify-between">
          <span class="text-gray-500 dark:text-gray-400">유형</span>
          <span class="text-gray-900 dark:text-white">{props.marker.signal_type}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 dark:text-gray-400">가격</span>
          <span class="text-gray-900 dark:text-white">{formatNumber(props.marker.price, { decimals: 0 })}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 dark:text-gray-400">강도</span>
          <span class="text-gray-900 dark:text-white">{formatPercent(props.marker.strength * 100, false)}</span>
        </div>
        <Show when={props.marker.executed}>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">실행</span>
            <span class="text-green-600 dark:text-green-400">✓ 체결됨</span>
          </div>
        </Show>
      </div>

      {/* 지표 정보 */}
      <Show when={indicatorEntries().length > 0}>
        <div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">지표</div>
          <div class="grid grid-cols-2 gap-1 text-xs">
            <For each={indicatorEntries()}>
              {(entry) => (
                <>
                  <span class="text-gray-500 dark:text-gray-400">{entry.key}</span>
                  <span class="text-gray-900 dark:text-white text-right">{entry.value}</span>
                </>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* 사유 */}
      <Show when={props.marker.reason}>
        <div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
          {props.marker.reason}
        </div>
      </Show>
    </div>
  )
}

// ==================== 메인 컴포넌트 ====================

/**
 * 신호 마커 오버레이
 *
 * 차트 위에 투명한 레이어로 신호 마커를 표시합니다.
 *
 * @example
 * ```tsx
 * <div class="relative">
 *   <CandlestickChart ... />
 *   <SignalMarkerOverlay
 *     markers={signals}
 *     width={800}
 *     height={400}
 *     priceRange={{ min: 50000, max: 60000 }}
 *     timeRange={{ start: startTs, end: endTs }}
 *     onMarkerClick={(m) => console.log('Clicked:', m)}
 *   />
 * </div>
 * ```
 */
export const SignalMarkerOverlay: Component<SignalMarkerOverlayProps> = (props) => {
  const [hoveredMarker, setHoveredMarker] = createSignal<SignalMarker | null>(null)
  const [hoverPosition, setHoverPosition] = createSignal({ x: 0, y: 0 })

  // 필터링된 마커
  const filteredMarkers = createMemo(() => {
    let markers = props.markers

    if (props.signalTypeFilter?.length) {
      markers = markers.filter((m) => props.signalTypeFilter!.includes(m.signal_type))
    }

    if (props.sideFilter?.length) {
      markers = markers.filter((m) => m.side && props.sideFilter!.includes(m.side))
    }

    return markers
  })

  // 마커 위치 계산
  const markerPositions = createMemo(() => {
    return filteredMarkers().map((marker) => {
      const timestamp = new Date(marker.timestamp).getTime()
      const x = timeToX(timestamp, props.timeRange, props.width)
      const y = priceToY(marker.price, props.priceRange, props.height)
      const size = getMarkerSize(marker.strength)
      return { marker, x, y, size }
    })
  })

  const handleMouseEnter = (marker: SignalMarker, x: number, y: number) => {
    if (props.showTooltip !== false) {
      setHoveredMarker(marker)
      setHoverPosition({ x, y })
    }
  }

  const handleMouseLeave = () => {
    setHoveredMarker(null)
  }

  const handleClick = (marker: SignalMarker) => {
    props.onMarkerClick?.(marker)
  }

  return (
    <div
      class="absolute inset-0 pointer-events-none"
      style={{ width: `${props.width}px`, height: `${props.height}px` }}
    >
      {/* 마커들 */}
      <For each={markerPositions()}>
        {({ marker, x, y, size }) => (
          <div
            class="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer pointer-events-auto
                   transition-transform hover:scale-125"
            style={{ left: `${x}px`, top: `${y}px` }}
            onMouseEnter={() => handleMouseEnter(marker, x, y)}
            onMouseLeave={handleMouseLeave}
            onClick={() => handleClick(marker)}
          >
            <MarkerIcon side={marker.side} size={size} executed={marker.executed} />
          </div>
        )}
      </For>

      {/* 툴팁 */}
      <Show when={hoveredMarker()}>
        <SignalTooltip
          marker={hoveredMarker()!}
          x={hoverPosition().x}
          y={hoverPosition().y}
        />
      </Show>
    </div>
  )
}

// ==================== 보조 컴포넌트 ====================

export interface SignalLegendProps {
  showBuy?: boolean
  showSell?: boolean
  onToggleBuy?: () => void
  onToggleSell?: () => void
  buyCount?: number
  sellCount?: number
}

/**
 * 신호 범례
 *
 * 매수/매도 신호 표시 토글과 개수를 표시합니다.
 */
export const SignalLegend: Component<SignalLegendProps> = (props) => {
  return (
    <div class="flex items-center gap-4 text-sm">
      <button
        class={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
          props.showBuy !== false
            ? 'border-green-300 bg-green-50 dark:border-green-600 dark:bg-green-900/30'
            : 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800 opacity-50'
        }`}
        onClick={props.onToggleBuy}
      >
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path d="M12 6L4 18h16L12 6z" fill="#10B981" stroke="#10B981" stroke-width="2" />
        </svg>
        <span class="text-green-700 dark:text-green-300">매수</span>
        <Show when={props.buyCount !== undefined}>
          <span class="text-green-600 dark:text-green-400 font-medium">{props.buyCount}</span>
        </Show>
      </button>

      <button
        class={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
          props.showSell !== false
            ? 'border-red-300 bg-red-50 dark:border-red-600 dark:bg-red-900/30'
            : 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800 opacity-50'
        }`}
        onClick={props.onToggleSell}
      >
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path d="M12 18L4 6h16L12 18z" fill="#EF4444" stroke="#EF4444" stroke-width="2" />
        </svg>
        <span class="text-red-700 dark:text-red-300">매도</span>
        <Show when={props.sellCount !== undefined}>
          <span class="text-red-600 dark:text-red-400 font-medium">{props.sellCount}</span>
        </Show>
      </button>
    </div>
  )
}

export default SignalMarkerOverlay
