/**
 * 매매 일지 페이지
 *
 * PRD 2.6에 따라 체결 내역, 보유 현황, 손익 분석 기능을 제공합니다.
 * 컴포넌트가 journal/ 폴더로 분리되어 모듈화되었습니다.
 */
import { createSignal, createResource, Show, createMemo } from 'solid-js'
import {
  BookOpen,
  TrendingUp,
  DollarSign,
  BarChart3,
  RefreshCw,
  AlertCircle,
  LineChart,
  PieChart,
  Lightbulb,
} from 'lucide-solid'
import {
  getJournalPositions,
  getJournalExecutions,
  getJournalPnLSummary,
  getJournalDailyPnL,
  getJournalSymbolPnL,
  getJournalWeeklyPnL,
  getJournalMonthlyPnL,
  getJournalYearlyPnL,
  getJournalCumulativePnL,
  getJournalInsights,
  getJournalStrategyPerformance,
  syncJournalExecutions,
} from '../api/client'
import type { ExecutionFilter } from '../api/client'
import { formatCurrency, getPnLColor } from '../utils/format'

// 분리된 컴포넌트 import
import {
  PositionsTable,
  ExecutionsTable,
  SymbolPnLTable,
  PnLAnalysisPanel,
  StrategyInsightsPanel,
} from '../components/journal'

// 탭 타입 (5개로 통합)
type TabType = 'positions' | 'executions' | 'pnl-analysis' | 'symbols' | 'strategy-insights'

export function TradingJournal() {
  // 탭 상태
  const [activeTab, setActiveTab] = createSignal<TabType>('positions')

  // 필터 상태
  const [symbolFilter, setSymbolFilter] = createSignal('')
  const [sideFilter, setSideFilter] = createSignal<string>('')

  // 새로고침 상태
  const [isRefreshing, setIsRefreshing] = createSignal(false)
  const [isSyncing, setIsSyncing] = createSignal(false)

  // 데이터 로드
  const [positions, { refetch: refetchPositions }] = createResource(getJournalPositions)
  const [pnlSummary, { refetch: refetchPnL }] = createResource(getJournalPnLSummary)
  const [dailyPnL, { refetch: refetchDaily }] = createResource(() => getJournalDailyPnL())
  const [symbolPnL, { refetch: refetchSymbols }] = createResource(getJournalSymbolPnL)

  // 기간별 손익 데이터
  const [weeklyPnL, { refetch: refetchWeekly }] = createResource(getJournalWeeklyPnL)
  const [monthlyPnL, { refetch: refetchMonthly }] = createResource(getJournalMonthlyPnL)
  const [yearlyPnL, { refetch: refetchYearly }] = createResource(getJournalYearlyPnL)
  const [cumulativePnL, { refetch: refetchCumulative }] = createResource(getJournalCumulativePnL)

  // 전략 성과 및 인사이트
  const [strategyPerformance, { refetch: refetchStrategies }] = createResource(getJournalStrategyPerformance)
  const [insights, { refetch: refetchInsights }] = createResource(getJournalInsights)

  // 체결 내역 필터
  const executionFilter = createMemo<ExecutionFilter>(() => ({
    symbol: symbolFilter() || undefined,
    side: sideFilter() || undefined,
    limit: 50,
  }))

  const [executions, { refetch: refetchExecutions }] = createResource(executionFilter, getJournalExecutions)

  // 새로고침
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        refetchPositions(),
        refetchPnL(),
        refetchDaily(),
        refetchSymbols(),
        refetchExecutions(),
        refetchWeekly(),
        refetchMonthly(),
        refetchYearly(),
        refetchCumulative(),
        refetchStrategies(),
        refetchInsights(),
      ])
    } finally {
      setIsRefreshing(false)
    }
  }

  // 동기화
  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const result = await syncJournalExecutions()
      if (result.success) {
        await handleRefresh()
      }
    } catch (error) {
      console.error('Sync failed:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div class="space-y-6">
      {/* 헤더 */}
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white flex items-center gap-3">
            <BookOpen class="w-7 h-7 text-blue-500" />
            매매일지
          </h1>
          <p class="text-gray-400 mt-1">체결 내역과 손익을 분석합니다</p>
        </div>
        <div class="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={isSyncing()}
            class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors"
          >
            <RefreshCw class={`w-4 h-4 ${isSyncing() ? 'animate-spin' : ''}`} />
            동기화
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing()}
            class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 text-white rounded-lg transition-colors"
          >
            <RefreshCw class={`w-4 h-4 ${isRefreshing() ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* PnL 요약 카드 */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-gray-800 rounded-xl p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-gray-400 text-sm">총 실현손익</span>
            <DollarSign class="w-5 h-5 text-gray-500" />
          </div>
          <div class={`text-2xl font-bold ${getPnLColor(pnlSummary()?.net_pnl || '0')}`}>
            {pnlSummary() ? formatCurrency(pnlSummary()!.net_pnl) : '-'}
          </div>
          <div class="text-xs text-gray-500 mt-1">
            수수료 차감 후
          </div>
        </div>

        <div class="bg-gray-800 rounded-xl p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-gray-400 text-sm">총 거래</span>
            <BarChart3 class="w-5 h-5 text-gray-500" />
          </div>
          <div class="text-2xl font-bold text-white">
            {pnlSummary()?.total_trades || 0}
          </div>
          <div class="text-xs text-gray-500 mt-1">
            매수 {pnlSummary()?.buy_trades || 0} / 매도 {pnlSummary()?.sell_trades || 0}
          </div>
        </div>

        <div class="bg-gray-800 rounded-xl p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-gray-400 text-sm">승률</span>
            <TrendingUp class="w-5 h-5 text-gray-500" />
          </div>
          <div class="text-2xl font-bold text-white">
            {pnlSummary()?.win_rate || '0.00'}%
          </div>
          <div class="text-xs text-gray-500 mt-1">
            승 {pnlSummary()?.winning_trades || 0} / 패 {pnlSummary()?.losing_trades || 0}
          </div>
        </div>

        <div class="bg-gray-800 rounded-xl p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-gray-400 text-sm">총 수수료</span>
            <AlertCircle class="w-5 h-5 text-gray-500" />
          </div>
          <div class="text-2xl font-bold text-orange-400">
            {pnlSummary() ? formatCurrency(pnlSummary()!.total_fees) : '-'}
          </div>
          <div class="text-xs text-gray-500 mt-1">
            거래대금 {pnlSummary() ? formatCurrency(pnlSummary()!.total_volume) : '-'}
          </div>
        </div>
      </div>

      {/* 탭 네비게이션 (5개로 통합) */}
      <div class="bg-gray-800 rounded-xl">
        <div class="flex overflow-x-auto border-b border-gray-700 scrollbar-thin scrollbar-thumb-gray-700">
          <button
            onClick={() => setActiveTab('positions')}
            class={`flex items-center gap-2 px-5 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab() === 'positions'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <BookOpen class="w-4 h-4" />
            보유 현황
          </button>
          <button
            onClick={() => setActiveTab('executions')}
            class={`flex items-center gap-2 px-5 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab() === 'executions'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <BarChart3 class="w-4 h-4" />
            체결 내역
          </button>
          <button
            onClick={() => setActiveTab('pnl-analysis')}
            class={`flex items-center gap-2 px-5 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab() === 'pnl-analysis'
                ? 'text-green-400 border-b-2 border-green-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <LineChart class="w-4 h-4" />
            손익 분석
          </button>
          <button
            onClick={() => setActiveTab('symbols')}
            class={`flex items-center gap-2 px-5 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab() === 'symbols'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <PieChart class="w-4 h-4" />
            종목별
          </button>
          <button
            onClick={() => setActiveTab('strategy-insights')}
            class={`flex items-center gap-2 px-5 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab() === 'strategy-insights'
                ? 'text-yellow-400 border-b-2 border-yellow-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Lightbulb class="w-4 h-4" />
            전략 분석
          </button>
        </div>

        {/* 탭 컨텐츠 */}
        <div class="p-4">
          <Show when={activeTab() === 'positions'}>
            <PositionsTable positions={positions()?.positions || []} />
          </Show>
          <Show when={activeTab() === 'executions'}>
            <ExecutionsTable
              executions={executions()?.executions || []}
              onRefetch={refetchExecutions}
              symbolFilter={symbolFilter()}
              setSymbolFilter={setSymbolFilter}
              sideFilter={sideFilter()}
              setSideFilter={setSideFilter}
            />
          </Show>
          <Show when={activeTab() === 'pnl-analysis'}>
            <PnLAnalysisPanel
              cumulativeData={cumulativePnL()?.curve || []}
              dailyData={dailyPnL()?.daily || []}
              weeklyData={weeklyPnL()?.weekly || []}
              monthlyData={monthlyPnL()?.monthly || []}
              yearlyData={yearlyPnL()?.yearly || []}
            />
          </Show>
          <Show when={activeTab() === 'symbols'}>
            <SymbolPnLTable symbols={symbolPnL()?.symbols || []} />
          </Show>
          <Show when={activeTab() === 'strategy-insights'}>
            <StrategyInsightsPanel
              insights={insights() || null}
              strategies={strategyPerformance()?.strategies || []}
            />
          </Show>
        </div>
      </div>

      {/* 포지션 요약 (보유 현황 탭에서만) */}
      <Show when={activeTab() === 'positions' && positions()?.summary}>
        <div class="bg-gray-800 rounded-xl p-5">
          <h3 class="text-lg font-semibold text-white mb-4">포지션 요약</h3>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div class="text-gray-400 text-sm mb-1">보유 종목 수</div>
              <div class="text-white font-medium">{positions()?.summary.total_positions || 0}</div>
            </div>
            <div>
              <div class="text-gray-400 text-sm mb-1">총 매입금액</div>
              <div class="text-white font-medium">
                {positions()?.summary ? formatCurrency(positions()!.summary.total_cost_basis) : '-'}
              </div>
            </div>
            <div>
              <div class="text-gray-400 text-sm mb-1">총 평가금액</div>
              <div class="text-white font-medium">
                {positions()?.summary ? formatCurrency(positions()!.summary.total_market_value) : '-'}
              </div>
            </div>
            <div>
              <div class="text-gray-400 text-sm mb-1">평가손익</div>
              <div class={`font-medium ${getPnLColor(positions()?.summary?.total_unrealized_pnl || '0')}`}>
                {positions()?.summary ? formatCurrency(positions()!.summary.total_unrealized_pnl) : '-'}
              </div>
            </div>
            <div>
              <div class="text-gray-400 text-sm mb-1">수익률</div>
              <div class={`font-medium ${getPnLColor(positions()?.summary?.total_unrealized_pnl_pct || '0')}`}>
                {positions()?.summary ? `${positions()!.summary.total_unrealized_pnl_pct}%` : '-'}
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default TradingJournal
