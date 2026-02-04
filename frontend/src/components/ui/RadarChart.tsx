/**
 * 레이더 차트 컴포넌트
 *
 * ComponentScores를 시각적으로 표시하는 SVG 기반 레이더 차트입니다.
 */
import { type Component, createMemo, For } from 'solid-js'

export interface RadarChartProps {
  /** 데이터 포인트 (key: label, value: 0-100) */
  data: Record<string, number | undefined>
  /** 차트 크기 (픽셀) */
  size?: number
  /** 채우기 색상 */
  fillColor?: string
  /** 테두리 색상 */
  strokeColor?: string
  /** 라벨 표시 여부 */
  showLabels?: boolean
}

// 라벨 한글 매핑
const LABEL_MAP: Record<string, string> = {
  // 기존 기술적 분석 라벨
  technical: '기술',
  momentum: '모멘텀',
  trend: '추세',
  volume: '거래량',
  volatility: '변동성',
  // 7Factor 정규화 점수 라벨
  norm_momentum: '모멘텀',
  norm_value: '가치',
  norm_quality: '품질',
  norm_volatility: '변동성',
  norm_liquidity: '유동성',
  norm_growth: '성장성',
  norm_sentiment: '심리',
}

export const RadarChart: Component<RadarChartProps> = (props) => {
  const size = () => props.size || 150
  const center = () => size() / 2
  const radius = () => (size() / 2) * 0.7
  const fillColor = () => props.fillColor || 'rgba(59, 130, 246, 0.3)'
  const strokeColor = () => props.strokeColor || 'rgb(59, 130, 246)'
  const showLabels = () => props.showLabels !== false

  // 데이터 포인트 추출
  const dataPoints = createMemo(() => {
    const result: { key: string; label: string; value: number }[] = []
    for (const key in props.data) {
      if (props.data[key] !== undefined) {
        result.push({
          key,
          label: LABEL_MAP[key] || key,
          value: Math.min(100, Math.max(0, props.data[key] || 0)),
        })
      }
    }
    return result
  })

  // 각도 계산 (시작: 상단, 시계 방향)
  const getAngle = (index: number, total: number) => {
    return (Math.PI * 2 * index) / total - Math.PI / 2
  }

  // 좌표 계산
  const getPoint = (index: number, total: number, value: number) => {
    const angle = getAngle(index, total)
    const r = (value / 100) * radius()
    return {
      x: center() + r * Math.cos(angle),
      y: center() + r * Math.sin(angle),
    }
  }

  // 라벨 위치 계산
  const getLabelPoint = (index: number, total: number) => {
    const angle = getAngle(index, total)
    const r = radius() + 20
    return {
      x: center() + r * Math.cos(angle),
      y: center() + r * Math.sin(angle),
    }
  }

  // 폴리곤 포인트 문자열 생성
  const polygonPoints = createMemo(() => {
    const points = dataPoints()
    if (points.length < 3) return ''
    return points
      .map((_, i) => {
        const p = getPoint(i, points.length, points[i].value)
        return `${p.x},${p.y}`
      })
      .join(' ')
  })

  // 그리드 라인 생성
  const gridLines = createMemo(() => {
    const levels = [25, 50, 75, 100]
    const total = dataPoints().length
    if (total < 3) return []

    return levels.map((level) => {
      const points = Array.from({ length: total }, (_, i) => {
        const p = getPoint(i, total, level)
        return `${p.x},${p.y}`
      }).join(' ')
      return { level, points }
    })
  })

  // 축 라인 생성
  const axisLines = createMemo(() => {
    const total = dataPoints().length
    if (total < 3) return []

    return Array.from({ length: total }, (_, i) => {
      const p = getPoint(i, total, 100)
      return { x1: center(), y1: center(), x2: p.x, y2: p.y }
    })
  })

  return (
    <svg
      width={size()}
      height={size()}
      viewBox={`0 0 ${size()} ${size()}`}
      class="radar-chart"
    >
      {/* 그리드 라인 */}
      <For each={gridLines()}>
        {(grid) => (
          <polygon
            points={grid.points}
            fill="none"
            stroke="currentColor"
            stroke-width="1"
            class="text-gray-200 dark:text-gray-700"
            opacity="0.5"
          />
        )}
      </For>

      {/* 축 라인 */}
      <For each={axisLines()}>
        {(axis) => (
          <line
            x1={axis.x1}
            y1={axis.y1}
            x2={axis.x2}
            y2={axis.y2}
            stroke="currentColor"
            stroke-width="1"
            class="text-gray-200 dark:text-gray-700"
            opacity="0.5"
          />
        )}
      </For>

      {/* 데이터 폴리곤 */}
      <polygon
        points={polygonPoints()}
        fill={fillColor()}
        stroke={strokeColor()}
        stroke-width="2"
      />

      {/* 데이터 포인트 */}
      <For each={dataPoints()}>
        {(point, index) => {
          const p = getPoint(index(), dataPoints().length, point.value)
          return (
            <circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill={strokeColor()}
            />
          )
        }}
      </For>

      {/* 라벨 */}
      {showLabels() && (
        <For each={dataPoints()}>
          {(point, index) => {
            const labelPos = getLabelPoint(index(), dataPoints().length)
            const angle = getAngle(index(), dataPoints().length)
            const textAnchor = Math.abs(angle) < 0.1 || Math.abs(angle - Math.PI) < 0.1
              ? 'middle'
              : angle > -Math.PI / 2 && angle < Math.PI / 2
              ? 'start'
              : 'end'
            return (
              <text
                x={labelPos.x}
                y={labelPos.y}
                text-anchor={textAnchor}
                dominant-baseline="middle"
                class="text-xs fill-gray-600 dark:fill-gray-400"
              >
                {point.label}
              </text>
            )
          }}
        </For>
      )}
    </svg>
  )
}

export default RadarChart
