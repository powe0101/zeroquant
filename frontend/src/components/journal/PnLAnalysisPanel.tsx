/**
 * 통합 손익 분석 패널 컴포넌트
 *
 * 누적 손익 곡선 차트 + 기간별 손익 막대 차트를 표시합니다.
 */
import { createSignal, For, Show } from 'solid-js'
import { LineChart, BarChart3 } from 'lucide-solid'
import { EquityCurve } from '../charts/EquityCurve'
import type { EquityDataPoint } from '../charts/EquityCurve'
import { PnLBarChart } from '../charts/PnLBarChart'
import type { PnLDataPoint } from '../charts/PnLBarChart'
import { formatCurrency, getPnLColor } from '../../utils/format'
import type {
  CumulativePnLPoint,
  DailyPnLItem,
  WeeklyPnLItem,
  MonthlyPnLItem,
  YearlyPnLItem,
} from '../../api/client'

// 기간 선택 타입
type PeriodType = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface PnLAnalysisPanelProps {
  cumulativeData: CumulativePnLPoint[]
  dailyData: DailyPnLItem[]
  weeklyData: WeeklyPnLItem[]
  monthlyData: MonthlyPnLItem[]
  yearlyData: YearlyPnLItem[]
}

export function PnLAnalysisPanel(props: PnLAnalysisPanelProps) {
  const [selectedPeriod, setSelectedPeriod] = createSignal<PeriodType>('daily')

  const latestCumulative = () =>
    props.cumulativeData.length > 0 ? props.cumulativeData[props.cumulativeData.length - 1] : null

  // 누적 손익 차트 데이터 변환
  const cumulativeChartData = (): EquityDataPoint[] => {
    return props.cumulativeData.map(item => ({
      time: item.date,
      value: parseFloat(String(item.cumulative_pnl)),
    }))
  }

  // 기간별 손익 막대 차트 데이터
  const periodBarData = (): PnLDataPoint[] => {
    const period = selectedPeriod()
    if (period === 'daily') {
      return props.dailyData.map((d: DailyPnLItem) => ({
        time: d.date,
        value: parseFloat(String(d.realized_pnl)),
      }))
    } else if (period === 'weekly') {
      return props.weeklyData.map((w: WeeklyPnLItem) => ({
        time: w.week_start,
        value: parseFloat(String(w.realized_pnl)),
      }))
    } else if (period === 'monthly') {
      return props.monthlyData.map((m: MonthlyPnLItem) => ({
        time: `${m.year}-${String(m.month).padStart(2, '0')}-01`,
        value: parseFloat(String(m.realized_pnl)),
      }))
    } else {
      return props.yearlyData.map((y: YearlyPnLItem) => ({
        time: `${y.year}-01-01`,
        value: parseFloat(String(y.realized_pnl)),
      }))
    }
  }

  // 기간별 요약 정보
  const periodSummary = () => {
    const data = periodBarData()
    if (data.length === 0) return null

    const totalPnL = data.reduce((sum, d) => sum + d.value, 0)
    const positive = data.filter(d => d.value > 0).length
    const negative = data.filter(d => d.value < 0).length

    return { totalPnL, positive, negative, total: data.length }
  }

  const periodLabels: Record<PeriodType, string> = {
    daily: '일별',
    weekly: '주별',
    monthly: '월별',
    yearly: '연도별',
  }

  return (
    <div class="space-y-6">
      {/* 요약 카드 */}
      <Show when={latestCumulative()}>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-gray-700/50 rounded-lg p-4">
            <div class="text-gray-400 text-sm mb-1">누적 실현손익</div>
            <div class={`text-xl font-bold ${getPnLColor(latestCumulative()!.cumulative_pnl)}`}>
              {formatCurrency(latestCumulative()!.cumulative_pnl)}
            </div>
          </div>
          <div class="bg-gray-700/50 rounded-lg p-4">
            <div class="text-gray-400 text-sm mb-1">누적 수수료</div>
            <div class="text-xl font-bold text-orange-400">
              {formatCurrency(latestCumulative()!.cumulative_fees)}
            </div>
          </div>
          <div class="bg-gray-700/50 rounded-lg p-4">
            <div class="text-gray-400 text-sm mb-1">누적 거래수</div>
            <div class="text-xl font-bold text-white">
              {latestCumulative()!.cumulative_trades}회
            </div>
          </div>
        </div>
      </Show>

      {/* 누적 손익 곡선 차트 */}
      <div class="bg-gray-700/30 rounded-lg p-4">
        <div class="flex items-center justify-between mb-4">
          <h4 class="text-lg font-semibold text-white flex items-center gap-2">
            <LineChart class="w-5 h-5 text-blue-400" />
            누적 손익 곡선
          </h4>
        </div>
        <Show when={cumulativeChartData().length > 0} fallback={
          <div class="h-[250px] flex items-center justify-center text-gray-500">
            <div class="text-center">
              <LineChart class="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>누적 손익 데이터가 없습니다</p>
            </div>
          </div>
        }>
          <EquityCurve
            data={cumulativeChartData()}
            height={250}
            colors={{
              equityColor: '#3b82f6',
              positiveArea: 'rgba(59, 130, 246, 0.2)',
            }}
          />
        </Show>
      </div>

      {/* 기간별 손익 막대 차트 */}
      <div class="bg-gray-700/30 rounded-lg p-4">
        <div class="flex items-center justify-between mb-4">
          <h4 class="text-lg font-semibold text-white flex items-center gap-2">
            <BarChart3 class="w-5 h-5 text-purple-400" />
            기간별 손익
          </h4>
          {/* 기간 선택 탭 */}
          <div class="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1">
            <For each={(['daily', 'weekly', 'monthly', 'yearly'] as PeriodType[])}>
              {(period) => (
                <button
                  onClick={() => setSelectedPeriod(period)}
                  class={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    selectedPeriod() === period
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {periodLabels[period]}
                </button>
              )}
            </For>
          </div>
        </div>

        {/* 기간별 요약 */}
        <Show when={periodSummary()}>
          <div class="grid grid-cols-3 gap-4 mb-4 text-center">
            <div class="bg-gray-800/50 rounded p-2">
              <div class="text-gray-400 text-xs mb-1">{periodLabels[selectedPeriod()]} 손익 합계</div>
              <div class={`text-lg font-bold ${getPnLColor(periodSummary()!.totalPnL)}`}>
                {formatCurrency(periodSummary()!.totalPnL)}
              </div>
            </div>
            <div class="bg-gray-800/50 rounded p-2">
              <div class="text-gray-400 text-xs mb-1">이익 / 손실</div>
              <div class="text-lg font-bold">
                <span class="text-green-400">{periodSummary()!.positive}</span>
                {' / '}
                <span class="text-red-400">{periodSummary()!.negative}</span>
              </div>
            </div>
            <div class="bg-gray-800/50 rounded p-2">
              <div class="text-gray-400 text-xs mb-1">이익 비율</div>
              <div class="text-lg font-bold text-white">
                {periodSummary()!.total > 0
                  ? ((periodSummary()!.positive / periodSummary()!.total) * 100).toFixed(1)
                  : 0}%
              </div>
            </div>
          </div>
        </Show>

        <Show when={periodBarData().length > 0} fallback={
          <div class="h-[200px] flex items-center justify-center text-gray-500">
            <div class="text-center">
              <BarChart3 class="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{periodLabels[selectedPeriod()]} 손익 데이터가 없습니다</p>
            </div>
          </div>
        }>
          <PnLBarChart
            data={periodBarData()}
            height={200}
          />
        </Show>
      </div>
    </div>
  )
}

export default PnLAnalysisPanel
