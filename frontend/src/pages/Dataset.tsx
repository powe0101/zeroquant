import { createSignal, createEffect, createMemo, For, Show } from 'solid-js'
import { createQuery, createMutation, useQueryClient } from '@tanstack/solid-query'
import {
  Database, Download, Trash2, RefreshCw, TrendingUp, BarChart3,
  Search, Zap, Loader2, X, Grid2x2, Square
} from 'lucide-solid'
import { useToast } from '../components/Toast'
import { MultiPanelGrid, type LayoutMode, type PanelConfig } from '../components/MultiPanelGrid'
import { SymbolPanel, type DatasetSummary } from '../components/SymbolPanel'

// ==================== 타입 ====================

interface DatasetListResponse {
  datasets: DatasetSummary[]
  totalCount: number
}

interface FetchDatasetRequest {
  symbol: string
  timeframe: string
  limit: number
  startDate?: string  // YYYY-MM-DD 형식
  endDate?: string    // YYYY-MM-DD 형식
}

interface Strategy {
  id: string
  name: string
  strategyType: string
  symbols: string[]
}

// ==================== API ====================

const API_BASE = 'http://localhost:3000/api/v1'

async function fetchDatasets(): Promise<DatasetListResponse> {
  const res = await fetch(`${API_BASE}/dataset`)
  if (!res.ok) throw new Error('데이터셋 목록 조회 실패')
  return res.json()
}

async function downloadDataset(req: FetchDatasetRequest): Promise<{ fetchedCount: number; message: string }> {
  const res = await fetch(`${API_BASE}/dataset/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('데이터셋 다운로드 실패')
  return res.json()
}

async function deleteDataset(symbol: string, timeframe?: string): Promise<void> {
  const url = timeframe
    ? `${API_BASE}/dataset/${encodeURIComponent(symbol)}?timeframe=${timeframe}`
    : `${API_BASE}/dataset/${encodeURIComponent(symbol)}`
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) throw new Error('데이터셋 삭제 실패')
}

async function fetchStrategies(): Promise<Strategy[]> {
  const res = await fetch(`${API_BASE}/strategies`)
  if (!res.ok) throw new Error('전략 목록 조회 실패')
  const data = await res.json()
  return data.strategies || []
}

// 심볼 검색 결과 타입
interface SymbolSearchResult {
  ticker: string
  name: string
  market: string
  yahooSymbol: string | null
}

interface SymbolSearchResponse {
  results: SymbolSearchResult[]
  total: number
}

// 심볼 검색 API
async function searchSymbols(query: string, limit: number = 10): Promise<SymbolSearchResult[]> {
  if (!query.trim()) return []
  const params = new URLSearchParams({ q: query, limit: limit.toString() })
  const res = await fetch(`${API_BASE}/dataset/search?${params}`)
  if (!res.ok) return []
  const data: SymbolSearchResponse = await res.json()
  return data.results || []
}

// ==================== 메인 컴포넌트 ====================

export function Dataset() {
  const toast = useToast()
  const queryClient = useQueryClient()

  // ==================== 상태 ====================
  // 뷰 모드: single (탭 방식) / multi (그리드 방식)
  const [viewType, setViewType] = createSignal<'single' | 'multi'>('multi')
  // 그리드 레이아웃
  const [layoutMode, setLayoutMode] = createSignal<LayoutMode>('2x2')

  // 패널 설정 (멀티 뷰용)
  const [panels, setPanels] = createSignal<PanelConfig[]>([])
  // 싱글 뷰용 상태
  const [activeSymbol, setActiveSymbol] = createSignal<string>('')
  const [activeTimeframe, setActiveTimeframe] = createSignal<string>('1d')
  // 싱글 뷰 검색 상태
  const [singleSearchQuery, setSingleSearchQuery] = createSignal('')
  const [singleSearchResults, setSingleSearchResults] = createSignal<SymbolSearchResult[]>([])
  const [singleSearchLoading, setSingleSearchLoading] = createSignal(false)
  const [singleSelectedIndex, setSingleSelectedIndex] = createSignal(-1)

  // 심볼 이름 캐시 (ticker -> name)
  const [symbolNameCache, setSymbolNameCache] = createSignal<Map<string, string>>(new Map())

  // 심볼 이름 캐시에 추가
  const cacheSymbolName = (ticker: string, name: string) => {
    setSymbolNameCache(prev => {
      const newMap = new Map(prev)
      newMap.set(ticker, name)
      return newMap
    })
  }

  // 심볼 표시 이름 반환 (티커 또는 티커(이름))
  const getSymbolDisplayName = (ticker: string): string => {
    const name = symbolNameCache().get(ticker)
    return name ? `${ticker} (${name})` : ticker
  }

  // UI 상태
  const [showDownloadForm, setShowDownloadForm] = createSignal(false)
  const [downloadSymbol, setDownloadSymbol] = createSignal('')
  const [downloadTimeframe, setDownloadTimeframe] = createSignal('1d')
  const [downloadLimit, setDownloadLimit] = createSignal(500)
  // 날짜 범위 다운로드
  const [downloadStartDate, setDownloadStartDate] = createSignal('')
  const [downloadEndDate, setDownloadEndDate] = createSignal('')
  const [useDateRange, setUseDateRange] = createSignal(false)
  // 다운로드 폼 자동완성 상태
  const [showDownloadAutocomplete, setShowDownloadAutocomplete] = createSignal(false)
  const [downloadSelectedIndex, setDownloadSelectedIndex] = createSignal(-1)

  // ==================== 쿼리 ====================
  const datasetsQuery = createQuery(() => ({
    queryKey: ['datasets'],
    queryFn: fetchDatasets,
    refetchInterval: 30000,
  }))

  const strategiesQuery = createQuery(() => ({
    queryKey: ['strategies'],
    queryFn: fetchStrategies,
  }))

  // ==================== 뮤테이션 ====================
  const downloadMutation = createMutation(() => ({
    mutationFn: downloadDataset,
    onSuccess: (data, variables) => {
      toast.success('다운로드 완료', data.message)
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
      queryClient.invalidateQueries({ queryKey: ['candles', variables.symbol] })
      setShowDownloadForm(false)
      setDownloadSymbol('')
      setDownloadStartDate('')
      setDownloadEndDate('')
      setUseDateRange(false)
    },
    onError: (error: Error) => {
      toast.error('다운로드 실패', error.message)
    },
  }))

  const deleteMutation = createMutation(() => ({
    mutationFn: (params: { symbol: string; timeframe?: string }) =>
      deleteDataset(params.symbol, params.timeframe),
    onSuccess: (_, variables) => {
      toast.success('삭제 완료', '데이터셋이 삭제되었습니다')
      queryClient.invalidateQueries({ queryKey: ['datasets'] })

      // 패널에서도 제거
      if (variables.timeframe) {
        setPanels(prev => prev.map(p =>
          p.symbol === variables.symbol && p.timeframe === variables.timeframe
            ? { ...p, symbol: undefined, timeframe: undefined }
            : p
        ))
      } else {
        setPanels(prev => prev.map(p =>
          p.symbol === variables.symbol
            ? { ...p, symbol: undefined, timeframe: undefined }
            : p
        ))
      }
    },
    onError: (error: Error) => {
      toast.error('삭제 실패', error.message)
    },
  }))

  // ==================== 계산된 값 ====================
  const cachedSymbols = createMemo(() => {
    const datasets = datasetsQuery.data?.datasets || []
    return [...new Set(datasets.map(d => d.symbol))].sort()
  })


  const strategySymbols = createMemo(() => {
    const strategies = strategiesQuery.data || []
    const symbolSet = new Set<string>()
    strategies.forEach(s => {
      if (s.symbols) s.symbols.forEach(sym => symbolSet.add(sym))
    })
    return Array.from(symbolSet)
  })

  const totalCandles = () => (datasetsQuery.data?.datasets || []).reduce((sum, d) => sum + d.candleCount, 0)

  // 다운로드 폼 자동완성 심볼 목록
  const downloadAutocompleteSymbols = createMemo(() => {
    const term = downloadSymbol().toUpperCase().trim()
    if (!term) return []
    // 캐시된 심볼 + 전략 심볼 합쳐서 검색
    const allSymbols = [...new Set([...cachedSymbols(), ...strategySymbols()])]
    return allSymbols
      .filter(s => s.toUpperCase().includes(term))
      .slice(0, 8)
  })

  // 다운로드 폼 심볼 선택 핸들러
  const handleDownloadSymbolSelect = (symbol: string) => {
    setDownloadSymbol(symbol)
    setShowDownloadAutocomplete(false)
    setDownloadSelectedIndex(-1)
  }

  // 다운로드 폼 키보드 핸들러
  const handleDownloadKeyDown = (e: KeyboardEvent) => {
    const symbols = downloadAutocompleteSymbols()
    const len = symbols.length

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setDownloadSelectedIndex(prev => (prev + 1) % len)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setDownloadSelectedIndex(prev => (prev - 1 + len) % len)
    } else if (e.key === 'Enter' && downloadSelectedIndex() >= 0 && downloadSelectedIndex() < len) {
      e.preventDefault()
      handleDownloadSymbolSelect(symbols[downloadSelectedIndex()])
    } else if (e.key === 'Escape') {
      setShowDownloadAutocomplete(false)
      setDownloadSelectedIndex(-1)
    }
  }

  // ==================== 핸들러 ====================

  // 패널 심볼 변경
  const changePanelSymbol = (panelId: string, symbol: string, symbolName?: string) => {
    if (symbol) {
      setPanels(prev => prev.map(p =>
        p.id === panelId ? { ...p, symbol, symbolName, timeframe: '1d' } : p
      ))
    } else {
      // 심볼 해제 (검색 모드로 전환)
      setPanels(prev => prev.map(p =>
        p.id === panelId ? { ...p, symbol: undefined, symbolName: undefined } : p
      ))
    }
  }

  // 패널 닫기
  const closePanel = (panelId: string) => {
    setPanels(prev => prev.filter(p => p.id !== panelId))
  }

  // 패널 타임프레임 변경
  const changePanelTimeframe = (panelId: string, timeframe: string) => {
    setPanels(prev => prev.map(p =>
      p.id === panelId ? { ...p, timeframe } : p
    ))
  }

  // 빠른 다운로드
  const quickDownload = (symbol: string) => {
    downloadMutation.mutate({ symbol, timeframe: '1d', limit: 500 })
  }

  // 싱글 뷰 심볼 검색 (debounced)
  let singleSearchTimeout: ReturnType<typeof setTimeout> | null = null
  const handleSingleSearch = async (query: string) => {
    setSingleSearchQuery(query)
    setSingleSelectedIndex(-1)

    if (singleSearchTimeout) clearTimeout(singleSearchTimeout)

    if (!query.trim()) {
      setSingleSearchResults([])
      return
    }

    singleSearchTimeout = setTimeout(async () => {
      setSingleSearchLoading(true)
      try {
        const results = await searchSymbols(query, 10)
        setSingleSearchResults(results)
      } catch {
        setSingleSearchResults([])
      } finally {
        setSingleSearchLoading(false)
      }
    }, 300)
  }

  const handleSingleKeyDown = (e: KeyboardEvent) => {
    const results = singleSearchResults()
    const len = results.length

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSingleSelectedIndex(prev => (prev + 1) % len)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSingleSelectedIndex(prev => (prev - 1 + len) % len)
    } else if (e.key === 'Enter' && singleSelectedIndex() >= 0 && singleSelectedIndex() < len) {
      e.preventDefault()
      const selected = results[singleSelectedIndex()]
      selectSingleSymbol(selected.ticker, selected.name)
    } else if (e.key === 'Escape') {
      setSingleSearchResults([])
      setSingleSelectedIndex(-1)
    }
  }

  const selectSingleSymbol = (ticker: string, name?: string) => {
    setActiveSymbol(ticker)
    setActiveTimeframe('1d')
    setSingleSearchQuery('')
    setSingleSearchResults([])
    setSingleSelectedIndex(-1)
    // 심볼 이름 캐시
    if (name) {
      cacheSymbolName(ticker, name)
    }
  }

  // 초기 패널 설정
  createEffect(() => {
    if (panels().length === 0 && viewType() === 'multi') {
      // 기본 4개 패널 생성
      setPanels([
        { id: 'panel-1' },
        { id: 'panel-2' },
        { id: 'panel-3' },
        { id: 'panel-4' },
      ])
    }
  })


  // ==================== 렌더링 ====================
  return (
    <div class="h-full flex flex-col">
      {/* 상단 바: 뷰 모드 + 액션 */}
      <div class="flex items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-3">
          <h1 class="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
            <Database class="w-5 h-5" />
            데이터셋
          </h1>
          {/* 뷰 모드 토글 */}
          <div class="flex gap-1 bg-[var(--color-surface)] rounded-lg p-1">
            <button
              onClick={() => setViewType('single')}
              class={`px-3 py-1.5 text-sm rounded flex items-center gap-2 transition
                      ${viewType() === 'single'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-light)]'}`}
            >
              <Square class="w-4 h-4" />
              싱글
            </button>
            <button
              onClick={() => setViewType('multi')}
              class={`px-3 py-1.5 text-sm rounded flex items-center gap-2 transition
                      ${viewType() === 'multi'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-light)]'}`}
            >
              <Grid2x2 class="w-4 h-4" />
              멀티
            </button>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div class="flex items-center gap-2">
          <button
            onClick={() => setShowDownloadForm(!showDownloadForm())}
            class="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg
                   hover:bg-[var(--color-primary-dark)] transition flex items-center gap-2"
          >
            <Download class="w-4 h-4" />
            다운로드
          </button>
          <button
            onClick={() => datasetsQuery.refetch()}
            class="px-4 py-2 bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg
                   hover:bg-[var(--color-surface-light)] transition"
          >
            <RefreshCw class={`w-4 h-4 ${datasetsQuery.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div class="grid grid-cols-4 gap-4 mb-4">
        <div class="bg-[var(--color-surface)] rounded-xl p-4 flex items-center gap-3">
          <div class="p-2 bg-blue-500/20 rounded-lg">
            <Database class="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p class="text-sm text-[var(--color-text-muted)]">캐시 심볼</p>
            <p class="text-xl font-bold text-[var(--color-text)]">{cachedSymbols().length}</p>
          </div>
        </div>
        <div class="bg-[var(--color-surface)] rounded-xl p-4 flex items-center gap-3">
          <div class="p-2 bg-green-500/20 rounded-lg">
            <BarChart3 class="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p class="text-sm text-[var(--color-text-muted)]">전체 캔들</p>
            <p class="text-xl font-bold text-[var(--color-text)]">{totalCandles().toLocaleString()}</p>
          </div>
        </div>
        <div class="bg-[var(--color-surface)] rounded-xl p-4 flex items-center gap-3">
          <div class="p-2 bg-purple-500/20 rounded-lg">
            <TrendingUp class="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p class="text-sm text-[var(--color-text-muted)]">전략 심볼</p>
            <p class="text-xl font-bold text-[var(--color-text)]">{strategySymbols().length}</p>
          </div>
        </div>
        <div class="bg-[var(--color-surface)] rounded-xl p-4 flex items-center gap-3">
          <div class="p-2 bg-amber-500/20 rounded-lg">
            <Grid2x2 class="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p class="text-sm text-[var(--color-text-muted)]">활성 패널</p>
            <p class="text-xl font-bold text-[var(--color-text)]">
              {viewType() === 'multi' ? panels().filter(p => p.symbol).length : (activeSymbol() ? 1 : 0)}
            </p>
          </div>
        </div>
      </div>

      {/* 다운로드 폼 */}
      <Show when={showDownloadForm()}>
        <div class="bg-[var(--color-surface)] rounded-xl p-6 mb-4">
          <h2 class="text-lg font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
            <Download class="w-5 h-5" />
            데이터 다운로드
          </h2>
          <Show when={strategySymbols().length > 0}>
            <div class="mb-4">
              <label class="block text-sm text-[var(--color-text-muted)] mb-2">
                전략 심볼 (클릭하여 빠른 다운로드)
              </label>
              <div class="flex flex-wrap gap-2">
                <For each={strategySymbols()}>
                  {(symbol) => (
                    <button
                      onClick={() => quickDownload(symbol)}
                      disabled={downloadMutation.isPending}
                      class="px-3 py-1.5 bg-[var(--color-primary)]/20 text-[var(--color-primary)]
                             rounded-lg hover:bg-[var(--color-primary)]/30 transition
                             flex items-center gap-1.5 text-sm"
                    >
                      <Zap class="w-3.5 h-3.5" />
                      {symbol}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <div class="grid grid-cols-4 gap-4">
            <div class="relative">
              <label class="block text-sm text-[var(--color-text-muted)] mb-2">심볼</label>
              <div class="relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  value={downloadSymbol()}
                  onInput={(e) => {
                    setDownloadSymbol(e.currentTarget.value)
                    setShowDownloadAutocomplete(true)
                    setDownloadSelectedIndex(-1)
                  }}
                  onFocus={() => setShowDownloadAutocomplete(true)}
                  onBlur={() => setTimeout(() => setShowDownloadAutocomplete(false), 200)}
                  onKeyDown={handleDownloadKeyDown}
                  placeholder="심볼 검색..."
                  class="w-full pl-9 pr-4 py-2 bg-[var(--color-bg)] text-[var(--color-text)]
                         rounded-lg border border-[var(--color-surface-light)]
                         focus:outline-none focus:border-[var(--color-primary)]"
                />

                {/* 자동완성 드롭다운 */}
                <Show when={showDownloadAutocomplete() && downloadSymbol().trim() && downloadAutocompleteSymbols().length > 0}>
                  <div class="absolute top-full left-0 right-0 mt-1 bg-[var(--color-surface)]
                              border border-[var(--color-surface-light)] rounded-lg shadow-xl z-50
                              max-h-48 overflow-auto">
                    <For each={downloadAutocompleteSymbols()}>
                      {(symbol, index) => (
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault()
                            handleDownloadSymbolSelect(symbol)
                          }}
                          class={`w-full px-3 py-2 text-left text-sm font-mono flex items-center gap-2
                                  transition hover:bg-[var(--color-surface-light)]
                                  ${index() === downloadSelectedIndex()
                                    ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                                    : 'text-[var(--color-text)]'}`}
                        >
                          <TrendingUp class="w-3.5 h-3.5 text-[var(--color-primary)]" />
                          <span>{symbol}</span>
                          <Show when={cachedSymbols().includes(symbol)}>
                            <span class="ml-auto text-xs text-green-400">OK</span>
                          </Show>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </div>
            <div>
              <label class="block text-sm text-[var(--color-text-muted)] mb-2">타임프레임</label>
              <select
                value={downloadTimeframe()}
                onChange={(e) => setDownloadTimeframe(e.currentTarget.value)}
                style={{ "background-color": "#1a1a2e" }}
                class="w-full px-4 py-2 text-[var(--color-text)] rounded-lg border border-[var(--color-surface-light)]"
              >
                <option value="1m">1분</option>
                <option value="5m">5분</option>
                <option value="15m">15분</option>
                <option value="1h">1시간</option>
                <option value="1d">1일</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-[var(--color-text-muted)] mb-2">
                <span class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={useDateRange()}
                    onChange={(e) => setUseDateRange(e.currentTarget.checked)}
                    class="rounded border-[var(--color-surface-light)]"
                  />
                  날짜 범위 지정
                </span>
              </label>
              <Show when={useDateRange()} fallback={
                <input
                  type="number"
                  value={downloadLimit()}
                  onInput={(e) => setDownloadLimit(parseInt(e.currentTarget.value) || 100)}
                  min="10"
                  max="5000"
                  class="w-full px-4 py-2 bg-[var(--color-bg)] text-[var(--color-text)]
                         rounded-lg border border-[var(--color-surface-light)]"
                  placeholder="캔들 수"
                />
              }>
                <div class="flex gap-2">
                  <input
                    type="date"
                    value={downloadStartDate()}
                    onInput={(e) => setDownloadStartDate(e.currentTarget.value)}
                    class="flex-1 px-3 py-2 bg-[var(--color-bg)] text-[var(--color-text)]
                           rounded-lg border border-[var(--color-surface-light)] text-sm"
                    placeholder="시작일"
                  />
                  <span class="text-[var(--color-text-muted)] self-center">~</span>
                  <input
                    type="date"
                    value={downloadEndDate()}
                    onInput={(e) => setDownloadEndDate(e.currentTarget.value)}
                    class="flex-1 px-3 py-2 bg-[var(--color-bg)] text-[var(--color-text)]
                           rounded-lg border border-[var(--color-surface-light)] text-sm"
                    placeholder="종료일"
                  />
                </div>
              </Show>
            </div>
            <div class="flex items-end">
              <button
                onClick={() => downloadMutation.mutate({
                  symbol: downloadSymbol(),
                  timeframe: downloadTimeframe(),
                  limit: downloadLimit(),
                  ...(useDateRange() && downloadStartDate() ? { startDate: downloadStartDate() } : {}),
                  ...(useDateRange() && downloadEndDate() ? { endDate: downloadEndDate() } : {}),
                })}
                disabled={downloadMutation.isPending || !downloadSymbol() || (useDateRange() && !downloadStartDate())}
                class="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg
                       hover:bg-[var(--color-primary-dark)] transition disabled:opacity-50
                       flex items-center justify-center gap-2"
              >
                <Show when={downloadMutation.isPending} fallback={<Download class="w-4 h-4" />}>
                  <RefreshCw class="w-4 h-4 animate-spin" />
                </Show>
                다운로드
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* 메인 컨텐츠 */}
      <div class="flex-1 min-h-0">
        <Show when={viewType() === 'multi'}>
          {/* 멀티 패널 뷰 */}
          <MultiPanelGrid
            panels={panels()}
            layoutMode={layoutMode()}
            onLayoutChange={setLayoutMode}
            onPanelClose={closePanel}
            availableSymbols={[...new Set([...cachedSymbols(), ...strategySymbols()])]}
            onSymbolChange={(panelId, symbol, symbolName) => changePanelSymbol(panelId, symbol, symbolName)}
            onSymbolSearch={async (query) => {
              const results = await searchSymbols(query, 10)
              return results.map(r => ({
                ticker: r.ticker,
                name: r.name,
                market: r.market
              }))
            }}
            renderPanel={(panel) => (
              <SymbolPanel
                symbol={panel.symbol}
                symbolDisplayName={panel.symbolName ? `${panel.symbol} (${panel.symbolName})` : undefined}
                timeframe={panel.timeframe || '1d'}
                datasets={datasetsQuery.data?.datasets || []}
                cachedSymbols={cachedSymbols()}
                onSymbolChange={(symbol) => changePanelSymbol(panel.id, symbol)}
                onTimeframeChange={(tf) => changePanelTimeframe(panel.id, tf)}
                onRefresh={() => {
                  if (panel.symbol) {
                    downloadMutation.mutate({
                      symbol: panel.symbol,
                      timeframe: panel.timeframe || '1d',
                      limit: 500,
                    })
                  }
                }}
                onDelete={() => {
                  if (panel.symbol) {
                    deleteMutation.mutate({
                      symbol: panel.symbol,
                      timeframe: panel.timeframe,
                    })
                  }
                }}
                isRefreshing={downloadMutation.isPending}
                compact={layoutMode() !== '1x1'}
              />
            )}
          />
        </Show>

        <Show when={viewType() === 'single'}>
          {/* 싱글 뷰 */}
          <div class="h-full bg-[var(--color-surface)] rounded-xl p-4 flex flex-col gap-3">
            {/* 싱글 뷰 심볼 검색 헤더 */}
            <div class="flex-shrink-0 relative">
              <div class="flex items-center gap-2">
                <Search class="w-4 h-4 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  placeholder="심볼/회사명 검색..."
                  value={singleSearchQuery()}
                  onInput={(e) => handleSingleSearch(e.currentTarget.value)}
                  onKeyDown={handleSingleKeyDown}
                  class="flex-1 bg-[var(--color-surface-light)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                />
                <Show when={activeSymbol()}>
                  <button
                    onClick={() => {
                      setActiveSymbol('')
                      setSingleSearchQuery('')
                    }}
                    class="p-2 hover:bg-[var(--color-surface-light)] rounded-lg transition-colors"
                    title="심볼 해제"
                  >
                    <X class="w-4 h-4 text-[var(--color-text-muted)]" />
                  </button>
                </Show>
              </div>
              {/* 검색 결과 드롭다운 */}
              <Show when={singleSearchResults().length > 0}>
                <div class="absolute top-full left-0 right-0 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                  <For each={singleSearchResults()}>
                    {(result, idx) => (
                      <button
                        onClick={() => selectSingleSymbol(result.ticker, result.name)}
                        class={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-[var(--color-surface-light)] transition-colors ${
                          idx() === singleSelectedIndex() ? 'bg-[var(--color-surface-light)]' : ''
                        }`}
                      >
                        <TrendingUp class="w-4 h-4 text-[var(--color-primary)]" />
                        <span class="font-medium text-[var(--color-text)]">{result.ticker}</span>
                        <span class="text-sm text-[var(--color-text-muted)]">{result.name}</span>
                        <Show when={result.market}>
                          <span class="text-xs px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                            {result.market}
                          </span>
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
              {/* 로딩 표시 */}
              <Show when={singleSearchLoading()}>
                <div class="absolute top-full left-0 right-0 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-center">
                  <Loader2 class="w-5 h-5 animate-spin mx-auto text-[var(--color-primary)]" />
                </div>
              </Show>
            </div>

            {/* SymbolPanel */}
            <div class="flex-1 min-h-0">
              <SymbolPanel
                symbol={activeSymbol() || undefined}
                symbolDisplayName={activeSymbol() ? getSymbolDisplayName(activeSymbol()) : undefined}
                timeframe={activeTimeframe()}
                datasets={datasetsQuery.data?.datasets || []}
                cachedSymbols={cachedSymbols()}
                onSymbolChange={(symbol) => {
                  setActiveSymbol(symbol)
                  setActiveTimeframe('1d')
                }}
                onTimeframeChange={setActiveTimeframe}
                onRefresh={() => {
                  if (activeSymbol()) {
                    downloadMutation.mutate({
                      symbol: activeSymbol(),
                      timeframe: activeTimeframe(),
                      limit: 500,
                    })
                  }
                }}
                onDelete={() => {
                  if (activeSymbol()) {
                    deleteMutation.mutate({
                      symbol: activeSymbol(),
                      timeframe: activeTimeframe(),
                    })
                  }
                }}
                isRefreshing={downloadMutation.isPending}
              />
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
