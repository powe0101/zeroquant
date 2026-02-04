/**
 * 차트 유틸리티 컴포넌트
 *
 * 툴팁, 범례 등 차트에서 공통으로 사용되는 컴포넌트입니다.
 */
import { type Component, type JSX, For, Show, createMemo } from 'solid-js'

interface ChartTooltipProps {
  title?: string
  items: Array<{
    label: string
    value: string | number
    color?: string
    suffix?: string
  }>
  className?: string
}

export const ChartTooltip: Component<ChartTooltipProps> = (props) => {
  return (
    <div class={`
      bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
      rounded-lg shadow-lg p-3 text-sm
      ${props.className || ''}
    `}>
      <Show when={props.title}>
        <div class="font-medium text-gray-900 dark:text-white mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
          {props.title}
        </div>
      </Show>
      <div class="space-y-1">
        <For each={props.items}>
          {(item) => (
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-2">
                <Show when={item.color}>
                  <span
                    class="w-3 h-3 rounded-full"
                    style={{ background: item.color }}
                  />
                </Show>
                <span class="text-gray-600 dark:text-gray-400">{item.label}</span>
              </div>
              <span class="font-medium text-gray-900 dark:text-white">
                {item.value}{item.suffix || ''}
              </span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

interface ChartLegendProps {
  items: Array<{
    label: string
    color: string
    value?: string | number
    active?: boolean
  }>
  layout?: 'horizontal' | 'vertical'
  onItemClick?: (index: number) => void
  className?: string
}

export const ChartLegend: Component<ChartLegendProps> = (props) => {
  const isHorizontal = createMemo(() => props.layout !== 'vertical')

  return (
    <div class={`
      flex ${isHorizontal() ? 'flex-row flex-wrap gap-4' : 'flex-col gap-2'}
      ${props.className || ''}
    `}>
      <For each={props.items}>
        {(item, index) => (
          <div
            class={`
              flex items-center gap-2 text-sm
              ${props.onItemClick ? 'cursor-pointer hover:opacity-80' : ''}
              ${item.active === false ? 'opacity-50' : ''}
            `}
            onClick={() => props.onItemClick?.(index())}
          >
            <span
              class="w-3 h-3 rounded-sm"
              style={{ background: item.color }}
            />
            <span class="text-gray-700 dark:text-gray-300">{item.label}</span>
            <Show when={item.value !== undefined}>
              <span class="font-medium text-gray-900 dark:text-white">
                {item.value}
              </span>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}

/**
 * 숫자 포맷팅 유틸리티
 */
export const formatNumber = (value: number, options?: {
  decimals?: number
  prefix?: string
  suffix?: string
  compact?: boolean
}): string => {
  const { decimals = 2, prefix = '', suffix = '', compact = false } = options || {}

  if (compact) {
    if (Math.abs(value) >= 1e9) {
      return `${prefix}${(value / 1e9).toFixed(1)}B${suffix}`
    }
    if (Math.abs(value) >= 1e6) {
      return `${prefix}${(value / 1e6).toFixed(1)}M${suffix}`
    }
    if (Math.abs(value) >= 1e3) {
      return `${prefix}${(value / 1e3).toFixed(1)}K${suffix}`
    }
  }

  return `${prefix}${value.toFixed(decimals)}${suffix}`
}

/**
 * 통화 포맷팅
 */
export const formatCurrency = (value: number | string | null | undefined, currency: 'KRW' | 'USD' = 'KRW'): string => {
  // 숫자로 변환
  const numValue = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  if (isNaN(numValue)) return currency === 'KRW' ? '₩0' : '$0.00'

  if (currency === 'KRW') {
    if (Math.abs(numValue) >= 1e8) {
      return `${(numValue / 1e8).toFixed(1)}억원`
    }
    if (Math.abs(numValue) >= 1e4) {
      return `${(numValue / 1e4).toFixed(0)}만원`
    }
    return `${numValue.toFixed(0)}원`
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numValue)
}

/**
 * 퍼센트 포맷팅
 */
export const formatPercent = (value: number | string | null | undefined, showSign = true): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  if (isNaN(numValue)) return '0.00%'
  const sign = showSign && numValue > 0 ? '+' : ''
  return `${sign}${numValue.toFixed(2)}%`
}

/**
 * 색상 유틸리티 - 손익에 따른 색상
 */
export const getPnLColor = (value: number): string => {
  if (value > 0) return 'text-green-500'
  if (value < 0) return 'text-red-500'
  return 'text-gray-500'
}

export const getPnLBgColor = (value: number): string => {
  if (value > 0) return 'bg-green-500'
  if (value < 0) return 'bg-red-500'
  return 'bg-gray-400'
}

/**
 * 차트 색상 팔레트
 */
export const chartColors = {
  primary: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
  pastel: ['#93C5FD', '#6EE7B7', '#FCD34D', '#FCA5A5', '#C4B5FD', '#F9A8D4'],
  gradient: {
    blue: ['#3B82F6', '#1D4ED8'],
    green: ['#10B981', '#047857'],
    red: ['#EF4444', '#B91C1C'],
  },
}

export default ChartTooltip
