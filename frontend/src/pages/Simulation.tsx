import { createSignal, For, Show, createEffect, onCleanup, createResource, createMemo } from 'solid-js'
import { useSearchParams } from '@solidjs/router'
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Square,
  RefreshCw,
  LineChart,
} from 'lucide-solid'
import { EquityCurve, SyncedChartPanel } from '../components/charts'
import type { EquityDataPoint, CandlestickDataPoint, TradeMarker } from '../components/charts'
import {
  startSimulation,
  stopSimulation,
  pauseSimulation,
  resetSimulation,
  getSimulationStatus,
  getSimulationPositions,
  getSimulationTrades,
  getStrategies,
  type SimulationStatusResponse,
  type SimulationPosition,
  type SimulationTrade,
} from '../api/client'
import type { Strategy } from '../types'

function formatCurrency(value: number | string): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numValue)
}

function formatDecimal(value: string | number, decimals: number = 2): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  return numValue.toFixed(decimals)
}

// API 기본 URL
const API_BASE = '/api/v1'

// 캔들 데이터 타입
interface CandleItem {
  time: string
  open: string
  high: string
  low: string
  close: string
  volume: string
}

interface CandleDataResponse {
  symbol: string
  timeframe: string
  candles: CandleItem[]
  totalCount: number
}

// 날짜 간 일수 계산
function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1 // +1 for inclusive
}

// 캔들 데이터 조회 (백테스트 기간에 해당하는 데이터)
async function fetchCandlesForSimulation(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<CandleDataResponse | null> {
  try {
    // 실제 기간만큼 요청 (여유 있게 20% 추가)
    const days = daysBetween(startDate, endDate)
    const limit = Math.ceil(days * 1.2)

    const params = new URLSearchParams({
      timeframe: '1d',
      limit: limit.toString(),
      sortBy: 'time',
      sortOrder: 'asc',
    })
    const res = await fetch(`${API_BASE}/dataset/${encodeURIComponent(symbol)}?${params}`)
    if (!res.ok) return null
    const data: CandleDataResponse = await res.json()

    // 백테스트 기간에 해당하는 캔들만 필터링
    const filtered = data.candles.filter(c => {
      const date = c.time.split(' ')[0]
      return date >= startDate && date <= endDate
    })

    return { ...data, candles: filtered, totalCount: filtered.length }
  } catch {
    return null
  }
}

// 캔들 데이터를 차트용 형식으로 변환
function convertCandlesToChartData(candles: CandleItem[]): CandlestickDataPoint[] {
  const uniqueMap = new Map<string, CandlestickDataPoint>()

  candles.forEach(c => {
    const timeKey = c.time.split(' ')[0] // 일봉 기준 "YYYY-MM-DD"
    uniqueMap.set(timeKey, {
      time: timeKey,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
    })
  })

  return Array.from(uniqueMap.values()).sort((a, b) =>
    (a.time as string).localeCompare(b.time as string)
  )
}

// 시뮬레이션 거래 내역을 차트 마커로 변환
function convertSimTradesToMarkers(trades: SimulationTrade[]): TradeMarker[] {
  return trades.map(trade => ({
    time: trade.timestamp.split('T')[0].split(' ')[0], // "YYYY-MM-DD" 형식
    type: trade.side === 'Buy' ? 'buy' : 'sell',
    price: parseFloat(trade.price),
    label: trade.side === 'Buy' ? '매수' : '매도',
  })).sort((a, b) =>
    (a.time as string).localeCompare(b.time as string)
  )
}

export function Simulation() {
  // URL 파라미터 읽기 (전략 페이지에서 바로 이동 시)
  const [searchParams] = useSearchParams()

  // 등록된 전략 목록 로드
  const [strategies] = createResource(async () => {
    try {
      return await getStrategies()
    } catch {
      return [] as Strategy[]
    }
  })

  // 상태 관리
  const [status, setStatus] = createSignal<SimulationStatusResponse | null>(null)
  const [positions, setPositions] = createSignal<SimulationPosition[]>([])
  const [trades, setTrades] = createSignal<SimulationTrade[]>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  // 폴링 최적화: 이전 거래 수 추적 (변경 시에만 positions/trades 갱신)
  const [prevTradeCount, setPrevTradeCount] = createSignal(-1)

  // 폼 상태
  const [selectedStrategy, setSelectedStrategy] = createSignal('')

  // URL에서 전략 ID가 있으면 자동 선택
  createEffect(() => {
    const strategyId = searchParams.strategy
    if (strategyId && strategies() && strategies()!.length > 0) {
      const found = strategies()!.find(s => s.id === strategyId)
      if (found) {
        setSelectedStrategy(found.strategyType)
      }
    }
  })
  const [initialBalance, setInitialBalance] = createSignal('10000000')
  const [speed, setSpeed] = createSignal(1)

  // 시뮬레이션 시작 날짜 (종료일은 오늘로 자동 설정)
  const today = new Date().toISOString().split('T')[0]
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const [startDate, setStartDate] = createSignal(oneYearAgo)

  // 가격 차트 데이터
  const [candleData, setCandleData] = createSignal<CandlestickDataPoint[]>([])
  const [isLoadingCandles, setIsLoadingCandles] = createSignal(false)
  const [showPriceChart, setShowPriceChart] = createSignal(false)

  // 매매 마커 (trades 변경 시 자동 갱신)
  const tradeMarkers = createMemo(() => convertSimTradesToMarkers(trades()))

  // 현재 시뮬레이션 시간까지의 캔들만 필터링 (스트리밍 효과)
  const filteredCandleData = createMemo(() => {
    const currentStatus = status()
    const startedAt = currentStatus?.started_at
    const simStartDate = currentStatus?.simulation_start_date  // 백테스트 시작 날짜
    const speed = currentStatus?.speed || 1
    const candles = candleData()

    // 캔들 데이터가 없으면 빈 배열
    if (!candles.length) {
      return []
    }

    // 시뮬레이션이 시작되지 않았으면 빈 배열 반환 (차트 숨김)
    if (currentStatus?.state === 'stopped' || !startedAt) {
      return []
    }

    // 백테스트 시작 날짜 기준으로 스트리밍 (없으면 첫 캔들 날짜 사용)
    // 일간 캔들에서 실용적인 스트리밍: 1초 실제 = 1일 시뮬레이션 × 배속
    const baseDate = simStartDate
      ? new Date(simStartDate)
      : new Date(candles[0].time as string)
    const startedAtDate = new Date(startedAt)
    const now = new Date()

    // 실제 경과 시간(초)
    const elapsedRealSeconds = (now.getTime() - startedAtDate.getTime()) / 1000

    // 시뮬레이션 경과 일수 = 경과 초 × 배속 (1초 = 1일)
    const elapsedSimDays = Math.floor(elapsedRealSeconds * speed)

    // 백테스트 시작 날짜 + 시뮬레이션 경과 일수 = 현재 시뮬레이션 날짜
    const currentSimDate = new Date(baseDate)
    currentSimDate.setDate(currentSimDate.getDate() + elapsedSimDays)
    const currentSimDateStr = currentSimDate.toISOString().split('T')[0]

    // 현재 시뮬레이션 날짜까지의 캔들만 필터링
    return candles.filter(c => {
      const candleTime = c.time as string
      return candleTime <= currentSimDateStr
    })
  })

  // 현재 시뮬레이션 시간까지의 마커만 필터링
  const filteredTradeMarkers = createMemo(() => {
    const currentStatus = status()
    const startedAt = currentStatus?.started_at
    const simStartDate = currentStatus?.simulation_start_date  // 백테스트 시작 날짜
    const speed = currentStatus?.speed || 1
    const markers = tradeMarkers()
    const candles = candleData()

    // 마커가 없거나 캔들 데이터가 없으면 빈 배열
    if (!markers.length || !candles.length) {
      return []
    }

    // 시뮬레이션이 시작되지 않았으면 빈 배열
    if (currentStatus?.state === 'stopped' || !startedAt) {
      return []
    }

    // 백테스트 시작 날짜 기준으로 스트리밍 (없으면 첫 캔들 날짜 사용)
    const baseDate = simStartDate
      ? new Date(simStartDate)
      : new Date(candles[0].time as string)
    const startedAtDate = new Date(startedAt)
    const now = new Date()
    const elapsedRealSeconds = (now.getTime() - startedAtDate.getTime()) / 1000
    const elapsedSimDays = Math.floor(elapsedRealSeconds * speed)
    const currentSimDate = new Date(baseDate)
    currentSimDate.setDate(currentSimDate.getDate() + elapsedSimDays)
    const currentSimDateStr = currentSimDate.toISOString().split('T')[0]

    return markers.filter(m => {
      const markerTime = m.time as string
      return markerTime <= currentSimDateStr
    })
  })

  // 자산 곡선 데이터
  const [equityCurve, setEquityCurve] = createSignal<EquityDataPoint[]>([])

  // 폴링 인터벌
  let pollInterval: ReturnType<typeof setInterval> | undefined

  // 초기 상태 로드 (최적화: trade_count 변경 시에만 positions/trades 갱신)
  const loadStatus = async (forceRefresh = false) => {
    try {
      const statusData = await getSimulationStatus()
      setStatus(statusData)

      // 전략 선택 초기화
      if (statusData.strategy_id && !selectedStrategy()) {
        setSelectedStrategy(statusData.strategy_id)
      }

      // 거래 수가 변경되었거나 강제 새로고침 시에만 포지션/거래 로드
      const currentTradeCount = statusData.trade_count
      if (forceRefresh || prevTradeCount() !== currentTradeCount) {
        setPrevTradeCount(currentTradeCount)

        const positionsData = await getSimulationPositions()
        setPositions(positionsData.positions)

        const tradesData = await getSimulationTrades()
        setTrades(tradesData.trades)
      }

      // 자산 곡선에 데이터 추가 (실행 중일 때)
      if (statusData.state === 'running') {
        const timestamp = Math.floor(Date.now() / 1000)
        const equity = parseFloat(statusData.total_equity)
        setEquityCurve(prev => {
          // 중복 방지
          if (prev.length > 0 && prev[prev.length - 1].time === timestamp) {
            return prev
          }
          return [...prev, { time: timestamp, value: equity }]
        })
      }

      setError(null)
    } catch (err) {
      console.error('Failed to load simulation status:', err)
      setError('시뮬레이션 상태를 불러오는데 실패했습니다')
    }
  }

  // 컴포넌트 마운트 시 상태 로드 (한 번만, 강제 새로고침)
  let initialLoadDone = false
  createEffect(() => {
    if (!initialLoadDone) {
      initialLoadDone = true
      loadStatus(true)
    }
  })

  // 실행 중일 때 폴링 (별도 상태로 관리)
  const [isPolling, setIsPolling] = createSignal(false)

  createEffect(() => {
    const currentStatus = status()
    const shouldPoll = currentStatus?.state === 'running'

    if (shouldPoll && !isPolling()) {
      setIsPolling(true)
      // 2초마다 상태 업데이트 (API 호출 최적화)
      pollInterval = setInterval(() => {
        loadStatus()
      }, 2000)
    } else if (!shouldPoll && isPolling()) {
      setIsPolling(false)
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = undefined
      }
    }
  })

  // 클린업
  onCleanup(() => {
    if (pollInterval) {
      clearInterval(pollInterval)
    }
  })

  // 시뮬레이션 시작
  const handleStart = async () => {
    if (!selectedStrategy()) {
      setError('전략을 선택해주세요')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // 시뮬레이션 시작 (시작일만 전달, 종료일은 오늘로 자동 설정)
      await startSimulation({
        strategy_id: selectedStrategy(),
        initial_balance: parseInt(initialBalance(), 10),
        speed: speed(),
        start_date: startDate(),
        end_date: today,  // 오늘 날짜까지 시뮬레이션
      })

      // 자산 곡선 초기화
      setEquityCurve([])

      await loadStatus(true)
    } catch (err) {
      console.error('Failed to start simulation:', err)
      setError('시뮬레이션 시작에 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // 시뮬레이션 중지
  const handleStop = async () => {
    setIsLoading(true)
    try {
      await stopSimulation()
      await loadStatus(true)
    } catch (err) {
      console.error('Failed to stop simulation:', err)
      setError('시뮬레이션 중지에 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // 일시정지/재개
  const handlePause = async () => {
    setIsLoading(true)
    try {
      await pauseSimulation()
      await loadStatus(true)
    } catch (err) {
      console.error('Failed to pause simulation:', err)
      setError('시뮬레이션 일시정지에 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // 리셋
  const handleReset = async () => {
    setIsLoading(true)
    try {
      await resetSimulation()
      setEquityCurve([])
      setPrevTradeCount(-1)
      await loadStatus(true)
    } catch (err) {
      console.error('Failed to reset simulation:', err)
      setError('시뮬레이션 리셋에 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // 가격 차트 데이터 로드 (시뮬레이션 시작일 ~ 오늘)
  const loadCandleData = async () => {
    if (candleData().length > 0 || isLoadingCandles()) return

    // 선택된 전략의 심볼 가져오기
    const strategy = strategies()?.find(s => s.strategyType === selectedStrategy())
    if (!strategy?.symbols || strategy.symbols.length === 0) return

    // 시뮬레이션 시작일 (status에서 가져오거나 폼 값 사용), 종료일은 오늘
    const currentStatus = status()
    const simStartDate = currentStatus?.simulation_start_date || startDate()
    const simEndDate = currentStatus?.simulation_end_date || today

    setIsLoadingCandles(true)
    try {
      const symbol = strategy.symbols[0] // 첫 번째 심볼 사용
      const data = await fetchCandlesForSimulation(symbol, simStartDate, simEndDate)
      if (data) {
        setCandleData(convertCandlesToChartData(data.candles))
      }
    } catch (err) {
      console.error('캔들 데이터 로드 실패:', err)
    } finally {
      setIsLoadingCandles(false)
    }
  }

  // 계산된 값
  const isRunning = () => status()?.state === 'running'
  const isPaused = () => status()?.state === 'paused'
  const isStopped = () => status()?.state === 'stopped'

  const totalPnl = () => {
    const s = status()
    if (!s) return 0
    return parseFloat(s.realized_pnl) + parseFloat(s.unrealized_pnl)
  }

  const totalPnlPercent = () => {
    const s = status()
    if (!s) return 0
    return parseFloat(s.return_pct)
  }

  return (
    <div class="space-y-6">
      {/* 에러 표시 */}
      <Show when={error()}>
        <div class="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
          {error()}
        </div>
      </Show>

      {/* Simulation Controls */}
      <div class="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          {/* Strategy & Settings */}
          <div class="flex items-center gap-6">
            <div>
              <label class="block text-sm text-[var(--color-text-muted)] mb-1">전략</label>
              <select
                value={selectedStrategy()}
                onChange={(e) => setSelectedStrategy(e.currentTarget.value)}
                disabled={!isStopped()}
                class="px-4 py-2 rounded-lg bg-[var(--color-surface-light)] border border-[var(--color-surface-light)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
              >
                <option value="">전략 선택...</option>
                <For each={strategies()}>
                  {(strategy) => (
                    <option value={strategy.strategyType}>
                      {strategy.name} ({strategy.strategyType})
                    </option>
                  )}
                </For>
              </select>
            </div>

            <div>
              <label class="block text-sm text-[var(--color-text-muted)] mb-1">초기 자본</label>
              <input
                type="number"
                value={initialBalance()}
                onInput={(e) => setInitialBalance(e.currentTarget.value)}
                disabled={!isStopped()}
                class="w-40 px-4 py-2 rounded-lg bg-[var(--color-surface-light)] border border-[var(--color-surface-light)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
              />
            </div>

            {/* 시뮬레이션 시작일 */}
            <div>
              <label class="block text-sm text-[var(--color-text-muted)] mb-1">시작일</label>
              <input
                type="date"
                value={startDate()}
                onInput={(e) => setStartDate(e.currentTarget.value)}
                disabled={!isStopped()}
                class="px-3 py-2 rounded-lg bg-[var(--color-surface-light)] border border-[var(--color-surface-light)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
              />
            </div>

            <Show when={status()?.started_at}>
              <div class="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface-light)] rounded-lg">
                <Clock class="w-5 h-5 text-[var(--color-text-muted)]" />
                <span class="text-[var(--color-text)] font-mono text-sm">
                  {new Date(status()!.started_at!).toLocaleString('ko-KR')}
                </span>
              </div>
            </Show>

            {/* 현재 시뮬레이션 시간 (배속 적용) */}
            <Show when={status()?.current_simulation_time}>
              <div class="flex items-center gap-2 px-4 py-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                <FastForward class="w-5 h-5 text-blue-400" />
                <div class="flex flex-col">
                  <span class="text-xs text-blue-300">시뮬레이션 시간</span>
                  <span class="text-blue-400 font-mono text-sm">
                    {new Date(status()!.current_simulation_time!).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              </div>
            </Show>

            <Show when={status()}>
              <div class="text-sm text-[var(--color-text-muted)]">
                거래: <span class="text-[var(--color-text)] font-semibold">{status()?.trade_count}건</span>
              </div>
            </Show>
          </div>

          {/* Controls */}
          <div class="flex items-center gap-2">
            {/* Speed Control */}
            <div class="flex items-center gap-1 mr-4">
              <FastForward class="w-4 h-4 text-[var(--color-text-muted)]" />
              <For each={[1, 2, 5, 10]}>
                {(spd) => (
                  <button
                    class={`px-3 py-1 text-sm rounded ${
                      speed() === spd
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-surface-light)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    } transition-colors`}
                    onClick={() => setSpeed(spd)}
                    disabled={!isStopped()}
                  >
                    {spd}x
                  </button>
                )}
              </For>
            </div>

            {/* Start/Pause/Stop Buttons */}
            <Show when={isStopped()}>
              <button
                class="p-3 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-50"
                onClick={handleStart}
                disabled={isLoading() || !selectedStrategy()}
              >
                <Play class="w-5 h-5" />
              </button>
            </Show>

            <Show when={isRunning() || isPaused()}>
              <button
                class={`p-3 rounded-lg ${
                  isPaused()
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-yellow-500 hover:bg-yellow-600'
                } text-white transition-colors disabled:opacity-50`}
                onClick={handlePause}
                disabled={isLoading()}
              >
                <Show when={isPaused()} fallback={<Pause class="w-5 h-5" />}>
                  <Play class="w-5 h-5" />
                </Show>
              </button>

              <button
                class="p-3 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
                onClick={handleStop}
                disabled={isLoading()}
              >
                <Square class="w-5 h-5" />
              </button>
            </Show>

            {/* Reset */}
            <button
              class="p-3 rounded-lg bg-[var(--color-surface-light)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
              onClick={handleReset}
              disabled={isLoading() || isRunning()}
              title="초기화"
            >
              <RotateCcw class="w-5 h-5" />
            </button>

            {/* Refresh */}
            <button
              class="p-3 rounded-lg bg-[var(--color-surface-light)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
              onClick={() => loadStatus(true)}
              disabled={isLoading()}
              title="새로고침"
            >
              <RefreshCw class={`w-5 h-5 ${isLoading() ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-4">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-blue-500/20">
              <DollarSign class="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <div class="text-sm text-[var(--color-text-muted)]">초기 자본</div>
              <div class="text-lg font-semibold text-[var(--color-text)]">
                {formatCurrency(status()?.initial_balance || initialBalance())}
              </div>
            </div>
          </div>
        </div>

        <div class="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-4">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-purple-500/20">
              <Activity class="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <div class="text-sm text-[var(--color-text-muted)]">총 자산</div>
              <div class="text-lg font-semibold text-[var(--color-text)]">
                {formatCurrency(status()?.total_equity || '0')}
              </div>
            </div>
          </div>
        </div>

        <div class="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-4">
          <div class="flex items-center gap-3">
            <div
              class={`p-2 rounded-lg ${
                totalPnl() >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}
            >
              <Show
                when={totalPnl() >= 0}
                fallback={<TrendingDown class="w-5 h-5 text-red-500" />}
              >
                <TrendingUp class="w-5 h-5 text-green-500" />
              </Show>
            </div>
            <div>
              <div class="text-sm text-[var(--color-text-muted)]">총 손익</div>
              <div
                class={`text-lg font-semibold ${
                  totalPnl() >= 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {totalPnl() >= 0 ? '+' : ''}
                {formatCurrency(totalPnl())}
              </div>
            </div>
          </div>
        </div>

        <div class="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-4">
          <div class="flex items-center gap-3">
            <div
              class={`p-2 rounded-lg ${
                totalPnlPercent() >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}
            >
              <Show
                when={totalPnlPercent() >= 0}
                fallback={<TrendingDown class="w-5 h-5 text-red-500" />}
              >
                <TrendingUp class="w-5 h-5 text-green-500" />
              </Show>
            </div>
            <div>
              <div class="text-sm text-[var(--color-text-muted)]">수익률</div>
              <div
                class={`text-lg font-semibold ${
                  totalPnlPercent() >= 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {totalPnlPercent() >= 0 ? '+' : ''}
                {formatDecimal(totalPnlPercent())}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Positions */}
        <div class="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-6">
          <h3 class="text-lg font-semibold text-[var(--color-text)] mb-4">
            보유 포지션 ({positions().length})
          </h3>

          <Show
            when={positions().length > 0}
            fallback={
              <div class="text-center py-8 text-[var(--color-text-muted)]">
                포지션 없음
              </div>
            }
          >
            <div class="space-y-3">
              <For each={positions()}>
                {(position) => {
                  const pnl = parseFloat(position.unrealized_pnl)
                  const pnlPct = parseFloat(position.return_pct)
                  return (
                    <div class="flex items-center justify-between p-3 bg-[var(--color-surface-light)] rounded-lg">
                      <div>
                        <div class="flex items-center gap-2">
                          <span class="font-semibold text-[var(--color-text)]">
                            {position.displayName || position.symbol}
                          </span>
                          <span
                            class={`px-2 py-0.5 text-xs rounded ${
                              position.side === 'Long'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {position.side}
                          </span>
                        </div>
                        <div class="text-sm text-[var(--color-text-muted)] mt-1">
                          {formatDecimal(position.quantity, 4)} @ {formatCurrency(position.entry_price)}
                        </div>
                      </div>
                      <div class="text-right">
                        <div
                          class={`font-semibold ${
                            pnl >= 0 ? 'text-green-500' : 'text-red-500'
                          }`}
                        >
                          {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                        </div>
                        <div
                          class={`text-sm ${
                            pnlPct >= 0 ? 'text-green-500' : 'text-red-500'
                          }`}
                        >
                          {pnlPct >= 0 ? '+' : ''}
                          {formatDecimal(pnlPct)}%
                        </div>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </div>

        {/* Trade History */}
        <div class="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-6">
          <h3 class="text-lg font-semibold text-[var(--color-text)] mb-4">
            거래 내역 ({trades().length})
          </h3>

          <Show
            when={trades().length > 0}
            fallback={
              <div class="text-center py-8 text-[var(--color-text-muted)]">
                거래 내역 없음
              </div>
            }
          >
            <div class="space-y-2 max-h-80 overflow-y-auto">
              <For each={[...trades()].reverse().slice(0, 20)}>
                {(trade) => {
                  const realizedPnl = trade.realized_pnl ? parseFloat(trade.realized_pnl) : null
                  return (
                    <div class="flex items-center justify-between p-3 bg-[var(--color-surface-light)] rounded-lg">
                      <div class="flex items-center gap-3">
                        <span class="text-sm text-[var(--color-text-muted)] font-mono">
                          {new Date(trade.timestamp).toLocaleTimeString('ko-KR')}
                        </span>
                        <span
                          class={`px-2 py-0.5 text-xs rounded font-medium ${
                            trade.side === 'Buy'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {trade.side === 'Buy' ? '매수' : '매도'}
                        </span>
                        <span class="text-[var(--color-text)]">{trade.displayName || trade.symbol}</span>
                      </div>
                      <div class="text-right">
                        <div class="text-sm text-[var(--color-text)]">
                          {formatDecimal(trade.quantity, 4)} @ {formatCurrency(trade.price)}
                        </div>
                        <Show when={realizedPnl !== null}>
                          <div
                            class={`text-sm ${
                              realizedPnl! >= 0 ? 'text-green-500' : 'text-red-500'
                            }`}
                          >
                            {realizedPnl! >= 0 ? '+' : ''}{formatCurrency(realizedPnl!)}
                          </div>
                        </Show>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>

      {/* Price Chart + Trade Markers */}
      <Show when={selectedStrategy()}>
        <div class="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-6">
          <details
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) {
                setShowPriceChart(true)
                loadCandleData()
              }
            }}
          >
            <summary class="cursor-pointer text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
              <LineChart class="w-5 h-5" />
              가격 차트 + 매매 태그
            </summary>
            <div class="mt-4">
              <Show
                when={!isLoadingCandles() && candleData().length > 0}
                fallback={
                  <div class="h-[280px] flex items-center justify-center text-[var(--color-text-muted)]">
                    {isLoadingCandles() ? (
                      <div class="flex items-center gap-2">
                        <RefreshCw class="w-5 h-5 animate-spin" />
                        <span>차트 데이터 로딩 중...</span>
                      </div>
                    ) : (
                      <span>차트 데이터가 없습니다 (데이터셋을 먼저 다운로드하세요)</span>
                    )}
                  </div>
                }
              >
                <SyncedChartPanel
                  data={filteredCandleData()}
                  type="candlestick"
                  mainHeight={280}
                  markers={filteredTradeMarkers()}
                />
              </Show>
            </div>
          </details>
        </div>
      </Show>

      {/* Equity Curve Chart */}
      <div class="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-6">
        <h3 class="text-lg font-semibold text-[var(--color-text)] mb-4">자산 곡선</h3>
        <Show
          when={equityCurve().length > 1}
          fallback={
            <div class="h-[300px] flex items-center justify-center text-[var(--color-text-muted)]">
              시뮬레이션을 시작하면 자산 곡선이 표시됩니다
            </div>
          }
        >
          <EquityCurve data={equityCurve()} height={300} />
        </Show>
      </div>

      {/* Additional Stats */}
      <Show when={status() && (status()!.realized_pnl !== '0' || status()!.trade_count > 0)}>
        <div class="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-6">
          <h3 class="text-lg font-semibold text-[var(--color-text)] mb-4">시뮬레이션 통계</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div class="text-sm text-[var(--color-text-muted)]">실현 손익</div>
              <div class={`text-lg font-semibold ${parseFloat(status()!.realized_pnl) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(status()!.realized_pnl)}
              </div>
            </div>
            <div>
              <div class="text-sm text-[var(--color-text-muted)]">미실현 손익</div>
              <div class={`text-lg font-semibold ${parseFloat(status()!.unrealized_pnl) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(status()!.unrealized_pnl)}
              </div>
            </div>
            <div>
              <div class="text-sm text-[var(--color-text-muted)]">현재 잔고</div>
              <div class="text-lg font-semibold text-[var(--color-text)]">
                {formatCurrency(status()!.current_balance)}
              </div>
            </div>
            <div>
              <div class="text-sm text-[var(--color-text-muted)]">포지션 수</div>
              <div class="text-lg font-semibold text-[var(--color-text)]">
                {status()!.position_count}개
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
