import { createSignal, createMemo, For, Show, onMount } from 'solid-js'
import { createQuery, createMutation } from '@tanstack/solid-query'
import {
  ListFilter, Search, TrendingUp, TrendingDown, Activity, BarChart3,
  ChevronUp, ChevronDown, Loader2, RefreshCw, Sparkles, Target,
  DollarSign, Percent, Building2, Zap, AlertCircle
} from 'lucide-solid'
import { useToast } from '../components/Toast'
import {
  runScreening,
  getScreeningPresets,
  runPresetScreening,
  runMomentumScreening,
  type ScreeningRequest,
  type ScreeningResponse,
  type ScreeningResultDto,
  type ScreeningPreset,
  type MomentumQuery,
  type MomentumResponse,
  type MomentumResultDto,
} from '../api/client'

// ==================== 타입 ====================

type ScreeningTab = 'preset' | 'custom' | 'momentum'
type SortField = 'ticker' | 'name' | 'market_cap' | 'per' | 'pbr' | 'roe' | 'dividend_yield' | 'change_pct'
type SortOrder = 'asc' | 'desc'

interface FilterState {
  market: string
  min_per: string
  max_per: string
  min_pbr: string
  max_pbr: string
  min_roe: string
  max_roe: string
  min_dividend_yield: string
  max_debt_ratio: string
  min_revenue_growth: string
  min_earnings_growth: string
  max_distance_from_52w_high: string
  sort_by: string
  sort_order: string
  limit: number
}

const DEFAULT_FILTER: FilterState = {
  market: '',
  min_per: '',
  max_per: '',
  min_pbr: '',
  max_pbr: '',
  min_roe: '',
  max_roe: '',
  min_dividend_yield: '',
  max_debt_ratio: '',
  min_revenue_growth: '',
  min_earnings_growth: '',
  max_distance_from_52w_high: '',
  sort_by: 'market_cap',
  sort_order: 'desc',
  limit: 50,
}

// 프리셋 ID -> 표시 이름 매핑
const PRESET_LABELS: Record<string, { name: string; icon: typeof DollarSign; description: string }> = {
  value: { name: '가치주', icon: DollarSign, description: '저 PER, 저 PBR 종목' },
  dividend: { name: '배당주', icon: Percent, description: '고배당 수익률 종목' },
  growth: { name: '성장주', icon: TrendingUp, description: '높은 매출/이익 성장률' },
  snowball: { name: '스노우볼', icon: Sparkles, description: '저 PBR + 고배당' },
  large_cap: { name: '대형주', icon: Building2, description: '시가총액 상위 종목' },
  near_52w_low: { name: '52주 저점', icon: TrendingDown, description: '52주 저점 근접 종목' },
}

// ==================== 메인 컴포넌트 ====================

export function Screening() {
  const toast = useToast()

  // ==================== 상태 ====================
  const [activeTab, setActiveTab] = createSignal<ScreeningTab>('preset')
  const [selectedPreset, setSelectedPreset] = createSignal<string>('value')
  const [presetMarket, setPresetMarket] = createSignal<string>('')
  const [filter, setFilter] = createSignal<FilterState>({ ...DEFAULT_FILTER })

  // 모멘텀 스크리닝 상태
  const [momentumDays, setMomentumDays] = createSignal(5)
  const [momentumMinChange, setMomentumMinChange] = createSignal('5')
  const [momentumMarket, setMomentumMarket] = createSignal<string>('')

  // 결과 정렬 상태
  const [sortField, setSortField] = createSignal<SortField>('market_cap')
  const [sortOrder, setSortOrder] = createSignal<SortOrder>('desc')

  // 페이지네이션
  const [currentPage, setCurrentPage] = createSignal(1)
  const pageSize = 20

  // ==================== 쿼리 ====================

  // 프리셋 목록 조회
  const presetsQuery = createQuery(() => ({
    queryKey: ['screening-presets'],
    queryFn: getScreeningPresets,
    staleTime: 1000 * 60 * 5, // 5분
  }))

  // 프리셋 스크리닝 결과
  const presetScreeningQuery = createQuery(() => ({
    queryKey: ['screening-preset', selectedPreset(), presetMarket()],
    queryFn: () => runPresetScreening(selectedPreset(), presetMarket() || undefined, 100),
    enabled: activeTab() === 'preset',
  }))

  // 커스텀 스크리닝 뮤테이션
  const customScreeningMutation = createMutation(() => ({
    mutationFn: (request: ScreeningRequest) => runScreening(request),
    onSuccess: () => {
      toast.success('스크리닝 완료', '필터 조건에 맞는 종목을 조회했습니다.')
    },
    onError: (error: Error) => {
      toast.error('스크리닝 실패', error.message)
    },
  }))

  // 모멘텀 스크리닝 쿼리
  const momentumQuery = createQuery(() => ({
    queryKey: ['screening-momentum', momentumDays(), momentumMinChange(), momentumMarket()],
    queryFn: () => runMomentumScreening({
      days: momentumDays(),
      min_change_pct: momentumMinChange(),
      market: momentumMarket() || undefined,
      limit: 100,
    }),
    enabled: activeTab() === 'momentum',
  }))

  // ==================== 계산된 값 ====================

  // 현재 활성 데이터
  const currentResults = createMemo((): ScreeningResultDto[] => {
    if (activeTab() === 'preset') {
      return presetScreeningQuery.data?.results || []
    } else if (activeTab() === 'custom') {
      return customScreeningMutation.data?.results || []
    }
    return []
  })

  // 정렬된 결과
  const sortedResults = createMemo(() => {
    const results = [...currentResults()]
    const field = sortField()
    const order = sortOrder()

    results.sort((a, b) => {
      let aVal: number | string = 0
      let bVal: number | string = 0

      switch (field) {
        case 'ticker':
          aVal = a.ticker
          bVal = b.ticker
          break
        case 'name':
          aVal = a.name
          bVal = b.name
          break
        case 'market_cap':
          aVal = parseFloat(a.market_cap || '0')
          bVal = parseFloat(b.market_cap || '0')
          break
        case 'per':
          aVal = parseFloat(a.per || '9999')
          bVal = parseFloat(b.per || '9999')
          break
        case 'pbr':
          aVal = parseFloat(a.pbr || '9999')
          bVal = parseFloat(b.pbr || '9999')
          break
        case 'roe':
          aVal = parseFloat(a.roe || '-9999')
          bVal = parseFloat(b.roe || '-9999')
          break
        case 'dividend_yield':
          aVal = parseFloat(a.dividend_yield || '0')
          bVal = parseFloat(b.dividend_yield || '0')
          break
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return order === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })

    return results
  })

  // 페이지네이션된 결과
  const paginatedResults = createMemo(() => {
    const start = (currentPage() - 1) * pageSize
    return sortedResults().slice(start, start + pageSize)
  })

  const totalPages = createMemo(() => Math.ceil(sortedResults().length / pageSize))

  // 로딩 상태
  const isLoading = createMemo(() => {
    if (activeTab() === 'preset') return presetScreeningQuery.isLoading
    if (activeTab() === 'custom') return customScreeningMutation.isPending
    if (activeTab() === 'momentum') return momentumQuery.isLoading
    return false
  })

  // ==================== 핸들러 ====================

  const handleSort = (field: SortField) => {
    if (sortField() === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
    setCurrentPage(1)
  }

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset)
    setCurrentPage(1)
  }

  const handleCustomScreening = () => {
    const f = filter()
    const request: ScreeningRequest = {
      market: f.market || undefined,
      min_per: f.min_per || undefined,
      max_per: f.max_per || undefined,
      min_pbr: f.min_pbr || undefined,
      max_pbr: f.max_pbr || undefined,
      min_roe: f.min_roe || undefined,
      max_roe: f.max_roe || undefined,
      min_dividend_yield: f.min_dividend_yield || undefined,
      max_debt_ratio: f.max_debt_ratio || undefined,
      min_revenue_growth: f.min_revenue_growth || undefined,
      min_earnings_growth: f.min_earnings_growth || undefined,
      max_distance_from_52w_high: f.max_distance_from_52w_high || undefined,
      sort_by: f.sort_by || undefined,
      sort_order: f.sort_order || undefined,
      limit: f.limit,
    }
    customScreeningMutation.mutate(request)
    setCurrentPage(1)
  }

  const resetFilter = () => {
    setFilter({ ...DEFAULT_FILTER })
  }

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilter(prev => ({ ...prev, [key]: value }))
  }

  // 숫자 포맷팅
  const formatNumber = (value: string | null | undefined, decimals: number = 2): string => {
    if (!value) return '-'
    const num = parseFloat(value)
    if (isNaN(num)) return '-'
    return num.toLocaleString('ko-KR', { maximumFractionDigits: decimals })
  }

  const formatMarketCap = (value: string | null | undefined): string => {
    if (!value) return '-'
    const num = parseFloat(value)
    if (isNaN(num)) return '-'
    if (num >= 1e12) return `${(num / 1e12).toFixed(1)}조`
    if (num >= 1e8) return `${(num / 1e8).toFixed(0)}억`
    if (num >= 1e4) return `${(num / 1e4).toFixed(0)}만`
    return num.toLocaleString()
  }

  const formatPercent = (value: string | null | undefined): string => {
    if (!value) return '-'
    const num = parseFloat(value)
    if (isNaN(num)) return '-'
    return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`
  }

  // ==================== 렌더링 ====================

  return (
    <div class="h-full flex flex-col">
      {/* 헤더 */}
      <div class="flex items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-3">
          <h1 class="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
            <ListFilter class="w-5 h-5" />
            종목 스크리닝
          </h1>
        </div>
      </div>

      {/* 탭 선택 */}
      <div class="flex gap-1 bg-[var(--color-surface)] rounded-lg p-1 mb-4 w-fit">
        <button
          onClick={() => setActiveTab('preset')}
          class={`px-4 py-2 text-sm rounded-md flex items-center gap-2 transition
                  ${activeTab() === 'preset'
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-light)]'}`}
        >
          <Sparkles class="w-4 h-4" />
          프리셋
        </button>
        <button
          onClick={() => setActiveTab('custom')}
          class={`px-4 py-2 text-sm rounded-md flex items-center gap-2 transition
                  ${activeTab() === 'custom'
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-light)]'}`}
        >
          <ListFilter class="w-4 h-4" />
          커스텀 필터
        </button>
        <button
          onClick={() => setActiveTab('momentum')}
          class={`px-4 py-2 text-sm rounded-md flex items-center gap-2 transition
                  ${activeTab() === 'momentum'
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-light)]'}`}
        >
          <Zap class="w-4 h-4" />
          모멘텀
        </button>
      </div>

      {/* 프리셋 탭 */}
      <Show when={activeTab() === 'preset'}>
        <div class="bg-[var(--color-surface)] rounded-xl p-4 mb-4">
          <div class="flex items-center gap-4 mb-4">
            <span class="text-sm text-[var(--color-text-muted)]">프리셋 선택:</span>
            <div class="flex flex-wrap gap-2">
              <For each={presetsQuery.data?.presets || Object.keys(PRESET_LABELS).map(id => ({ id, name: PRESET_LABELS[id].name, description: PRESET_LABELS[id].description }))}>
                {(preset) => {
                  const info = PRESET_LABELS[preset.id] || { name: preset.name, icon: Target, description: preset.description }
                  const Icon = info.icon
                  return (
                    <button
                      onClick={() => handlePresetChange(preset.id)}
                      class={`px-4 py-2 rounded-lg flex items-center gap-2 transition text-sm
                              ${selectedPreset() === preset.id
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'bg-[var(--color-surface-light)] text-[var(--color-text)] hover:bg-[var(--color-primary)]/20'}`}
                      title={info.description}
                    >
                      <Icon class="w-4 h-4" />
                      {info.name}
                    </button>
                  )
                }}
              </For>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <span class="text-sm text-[var(--color-text-muted)]">시장:</span>
            <select
              value={presetMarket()}
              onChange={(e) => setPresetMarket(e.currentTarget.value)}
              style={{ "background-color": "#1a1a2e" }}
              class="px-3 py-1.5 text-sm text-[var(--color-text)] rounded-lg border border-[var(--color-surface-light)]"
            >
              <option value="">전체</option>
              <option value="KR">한국</option>
              <option value="US">미국</option>
            </select>
            <button
              onClick={() => presetScreeningQuery.refetch()}
              disabled={presetScreeningQuery.isFetching}
              class="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-lg text-sm
                     hover:bg-[var(--color-primary-dark)] transition flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw class={`w-4 h-4 ${presetScreeningQuery.isFetching ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
          <Show when={presetScreeningQuery.data}>
            <div class="mt-3 text-sm text-[var(--color-text-muted)]">
              {presetScreeningQuery.data?.filter_summary}
            </div>
          </Show>
        </div>
      </Show>

      {/* 커스텀 필터 탭 */}
      <Show when={activeTab() === 'custom'}>
        <div class="bg-[var(--color-surface)] rounded-xl p-4 mb-4">
          <div class="grid grid-cols-6 gap-4 mb-4">
            {/* 시장 */}
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">시장</label>
              <select
                value={filter().market}
                onChange={(e) => updateFilter('market', e.currentTarget.value)}
                style={{ "background-color": "#1a1a2e" }}
                class="w-full px-3 py-2 text-sm text-[var(--color-text)] rounded-lg border border-[var(--color-surface-light)]"
              >
                <option value="">전체</option>
                <option value="KR">한국</option>
                <option value="US">미국</option>
              </select>
            </div>

            {/* PER */}
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">PER (최소~최대)</label>
              <div class="flex gap-1">
                <input
                  type="number"
                  value={filter().min_per}
                  onInput={(e) => updateFilter('min_per', e.currentTarget.value)}
                  placeholder="0"
                  class="w-1/2 px-2 py-2 text-sm bg-[var(--color-bg)] text-[var(--color-text)]
                         rounded-lg border border-[var(--color-surface-light)]"
                />
                <input
                  type="number"
                  value={filter().max_per}
                  onInput={(e) => updateFilter('max_per', e.currentTarget.value)}
                  placeholder="20"
                  class="w-1/2 px-2 py-2 text-sm bg-[var(--color-bg)] text-[var(--color-text)]
                         rounded-lg border border-[var(--color-surface-light)]"
                />
              </div>
            </div>

            {/* PBR */}
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">PBR (최소~최대)</label>
              <div class="flex gap-1">
                <input
                  type="number"
                  step="0.1"
                  value={filter().min_pbr}
                  onInput={(e) => updateFilter('min_pbr', e.currentTarget.value)}
                  placeholder="0"
                  class="w-1/2 px-2 py-2 text-sm bg-[var(--color-bg)] text-[var(--color-text)]
                         rounded-lg border border-[var(--color-surface-light)]"
                />
                <input
                  type="number"
                  step="0.1"
                  value={filter().max_pbr}
                  onInput={(e) => updateFilter('max_pbr', e.currentTarget.value)}
                  placeholder="1.5"
                  class="w-1/2 px-2 py-2 text-sm bg-[var(--color-bg)] text-[var(--color-text)]
                         rounded-lg border border-[var(--color-surface-light)]"
                />
              </div>
            </div>

            {/* ROE */}
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">ROE 최소 (%)</label>
              <input
                type="number"
                step="0.1"
                value={filter().min_roe}
                onInput={(e) => updateFilter('min_roe', e.currentTarget.value)}
                placeholder="10"
                class="w-full px-2 py-2 text-sm bg-[var(--color-bg)] text-[var(--color-text)]
                       rounded-lg border border-[var(--color-surface-light)]"
              />
            </div>

            {/* 배당수익률 */}
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">배당수익률 최소 (%)</label>
              <input
                type="number"
                step="0.1"
                value={filter().min_dividend_yield}
                onInput={(e) => updateFilter('min_dividend_yield', e.currentTarget.value)}
                placeholder="3"
                class="w-full px-2 py-2 text-sm bg-[var(--color-bg)] text-[var(--color-text)]
                       rounded-lg border border-[var(--color-surface-light)]"
              />
            </div>

            {/* 부채비율 */}
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">부채비율 최대 (%)</label>
              <input
                type="number"
                value={filter().max_debt_ratio}
                onInput={(e) => updateFilter('max_debt_ratio', e.currentTarget.value)}
                placeholder="100"
                class="w-full px-2 py-2 text-sm bg-[var(--color-bg)] text-[var(--color-text)]
                       rounded-lg border border-[var(--color-surface-light)]"
              />
            </div>
          </div>

          <div class="grid grid-cols-6 gap-4 mb-4">
            {/* 매출성장률 */}
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">매출성장률 최소 (%)</label>
              <input
                type="number"
                value={filter().min_revenue_growth}
                onInput={(e) => updateFilter('min_revenue_growth', e.currentTarget.value)}
                placeholder="10"
                class="w-full px-2 py-2 text-sm bg-[var(--color-bg)] text-[var(--color-text)]
                       rounded-lg border border-[var(--color-surface-light)]"
              />
            </div>

            {/* 이익성장률 */}
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">이익성장률 최소 (%)</label>
              <input
                type="number"
                value={filter().min_earnings_growth}
                onInput={(e) => updateFilter('min_earnings_growth', e.currentTarget.value)}
                placeholder="10"
                class="w-full px-2 py-2 text-sm bg-[var(--color-bg)] text-[var(--color-text)]
                       rounded-lg border border-[var(--color-surface-light)]"
              />
            </div>

            {/* 52주 고점 이격 */}
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">52주 고점 이격 최대 (%)</label>
              <input
                type="number"
                value={filter().max_distance_from_52w_high}
                onInput={(e) => updateFilter('max_distance_from_52w_high', e.currentTarget.value)}
                placeholder="20"
                class="w-full px-2 py-2 text-sm bg-[var(--color-bg)] text-[var(--color-text)]
                       rounded-lg border border-[var(--color-surface-light)]"
              />
            </div>

            {/* 정렬 기준 */}
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">정렬 기준</label>
              <select
                value={filter().sort_by}
                onChange={(e) => updateFilter('sort_by', e.currentTarget.value)}
                style={{ "background-color": "#1a1a2e" }}
                class="w-full px-2 py-2 text-sm text-[var(--color-text)] rounded-lg border border-[var(--color-surface-light)]"
              >
                <option value="market_cap">시가총액</option>
                <option value="per">PER</option>
                <option value="pbr">PBR</option>
                <option value="roe">ROE</option>
                <option value="dividend_yield">배당수익률</option>
              </select>
            </div>

            {/* 결과 수 */}
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">결과 수</label>
              <select
                value={filter().limit}
                onChange={(e) => updateFilter('limit', parseInt(e.currentTarget.value))}
                style={{ "background-color": "#1a1a2e" }}
                class="w-full px-2 py-2 text-sm text-[var(--color-text)] rounded-lg border border-[var(--color-surface-light)]"
              >
                <option value={20}>20개</option>
                <option value={50}>50개</option>
                <option value={100}>100개</option>
              </select>
            </div>

            {/* 액션 버튼 */}
            <div class="flex items-end gap-2">
              <button
                onClick={handleCustomScreening}
                disabled={customScreeningMutation.isPending}
                class="flex-1 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm
                       hover:bg-[var(--color-primary-dark)] transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Show when={customScreeningMutation.isPending} fallback={<Search class="w-4 h-4" />}>
                  <Loader2 class="w-4 h-4 animate-spin" />
                </Show>
                스크리닝
              </button>
              <button
                onClick={resetFilter}
                class="px-3 py-2 bg-[var(--color-surface-light)] text-[var(--color-text)] rounded-lg text-sm
                       hover:bg-[var(--color-surface)] transition"
                title="필터 초기화"
              >
                <RefreshCw class="w-4 h-4" />
              </button>
            </div>
          </div>

          <Show when={customScreeningMutation.data}>
            <div class="text-sm text-[var(--color-text-muted)]">
              {customScreeningMutation.data?.filter_summary}
            </div>
          </Show>
        </div>
      </Show>

      {/* 모멘텀 탭 */}
      <Show when={activeTab() === 'momentum'}>
        <div class="bg-[var(--color-surface)] rounded-xl p-4 mb-4">
          <div class="flex items-center gap-4 flex-wrap">
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">시장</label>
              <select
                value={momentumMarket()}
                onChange={(e) => setMomentumMarket(e.currentTarget.value)}
                style={{ "background-color": "#1a1a2e" }}
                class="px-3 py-2 text-sm text-[var(--color-text)] rounded-lg border border-[var(--color-surface-light)]"
              >
                <option value="">전체</option>
                <option value="KR">한국</option>
                <option value="US">미국</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">기간 (일)</label>
              <select
                value={momentumDays()}
                onChange={(e) => setMomentumDays(parseInt(e.currentTarget.value))}
                style={{ "background-color": "#1a1a2e" }}
                class="px-3 py-2 text-sm text-[var(--color-text)] rounded-lg border border-[var(--color-surface-light)]"
              >
                <option value={1}>1일</option>
                <option value={3}>3일</option>
                <option value={5}>5일</option>
                <option value={10}>10일</option>
                <option value={20}>20일</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-[var(--color-text-muted)] mb-1">최소 변동률 (%)</label>
              <input
                type="number"
                value={momentumMinChange()}
                onInput={(e) => setMomentumMinChange(e.currentTarget.value)}
                class="w-20 px-3 py-2 text-sm bg-[var(--color-bg)] text-[var(--color-text)]
                       rounded-lg border border-[var(--color-surface-light)]"
              />
            </div>
            <div class="flex items-end">
              <button
                onClick={() => momentumQuery.refetch()}
                disabled={momentumQuery.isFetching}
                class="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm
                       hover:bg-[var(--color-primary-dark)] transition flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw class={`w-4 h-4 ${momentumQuery.isFetching ? 'animate-spin' : ''}`} />
                조회
              </button>
            </div>
          </div>
          <Show when={momentumQuery.data}>
            <div class="mt-3 text-sm text-[var(--color-text-muted)]">
              {momentumQuery.data?.days}일간 {momentumQuery.data?.min_change_pct}% 이상 변동 종목: {momentumQuery.data?.total}개
            </div>
          </Show>
        </div>
      </Show>

      {/* 결과 테이블 */}
      <div class="flex-1 bg-[var(--color-surface)] rounded-xl overflow-hidden flex flex-col min-h-0">
        {/* 로딩 상태 */}
        <Show when={isLoading()}>
          <div class="flex-1 flex items-center justify-center">
            <div class="flex flex-col items-center gap-3">
              <Loader2 class="w-8 h-8 animate-spin text-[var(--color-primary)]" />
              <span class="text-sm text-[var(--color-text-muted)]">스크리닝 중...</span>
            </div>
          </div>
        </Show>

        {/* 결과 없음 */}
        <Show when={!isLoading() && (activeTab() !== 'momentum' ? currentResults().length === 0 : (momentumQuery.data?.results?.length || 0) === 0)}>
          <div class="flex-1 flex items-center justify-center">
            <div class="flex flex-col items-center gap-3 text-[var(--color-text-muted)]">
              <AlertCircle class="w-12 h-12 opacity-50" />
              <span class="text-sm">
                <Show when={activeTab() === 'custom' && !customScreeningMutation.data}>
                  필터를 설정하고 스크리닝 버튼을 클릭하세요.
                </Show>
                <Show when={activeTab() !== 'custom' || customScreeningMutation.data}>
                  조건에 맞는 종목이 없습니다.
                </Show>
              </span>
            </div>
          </div>
        </Show>

        {/* 펀더멘털 결과 테이블 (프리셋/커스텀) */}
        <Show when={!isLoading() && activeTab() !== 'momentum' && currentResults().length > 0}>
          <div class="overflow-auto flex-1">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-[var(--color-surface-light)]">
                <tr>
                  <th class="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                    <button onClick={() => handleSort('ticker')} class="flex items-center gap-1 hover:text-[var(--color-text)]">
                      티커
                      <Show when={sortField() === 'ticker'}>
                        {sortOrder() === 'asc' ? <ChevronUp class="w-3 h-3" /> : <ChevronDown class="w-3 h-3" />}
                      </Show>
                    </button>
                  </th>
                  <th class="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                    <button onClick={() => handleSort('name')} class="flex items-center gap-1 hover:text-[var(--color-text)]">
                      종목명
                      <Show when={sortField() === 'name'}>
                        {sortOrder() === 'asc' ? <ChevronUp class="w-3 h-3" /> : <ChevronDown class="w-3 h-3" />}
                      </Show>
                    </button>
                  </th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">
                    <button onClick={() => handleSort('market_cap')} class="flex items-center gap-1 justify-end hover:text-[var(--color-text)]">
                      시가총액
                      <Show when={sortField() === 'market_cap'}>
                        {sortOrder() === 'asc' ? <ChevronUp class="w-3 h-3" /> : <ChevronDown class="w-3 h-3" />}
                      </Show>
                    </button>
                  </th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">
                    <button onClick={() => handleSort('per')} class="flex items-center gap-1 justify-end hover:text-[var(--color-text)]">
                      PER
                      <Show when={sortField() === 'per'}>
                        {sortOrder() === 'asc' ? <ChevronUp class="w-3 h-3" /> : <ChevronDown class="w-3 h-3" />}
                      </Show>
                    </button>
                  </th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">
                    <button onClick={() => handleSort('pbr')} class="flex items-center gap-1 justify-end hover:text-[var(--color-text)]">
                      PBR
                      <Show when={sortField() === 'pbr'}>
                        {sortOrder() === 'asc' ? <ChevronUp class="w-3 h-3" /> : <ChevronDown class="w-3 h-3" />}
                      </Show>
                    </button>
                  </th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">
                    <button onClick={() => handleSort('roe')} class="flex items-center gap-1 justify-end hover:text-[var(--color-text)]">
                      ROE
                      <Show when={sortField() === 'roe'}>
                        {sortOrder() === 'asc' ? <ChevronUp class="w-3 h-3" /> : <ChevronDown class="w-3 h-3" />}
                      </Show>
                    </button>
                  </th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">
                    <button onClick={() => handleSort('dividend_yield')} class="flex items-center gap-1 justify-end hover:text-[var(--color-text)]">
                      배당률
                      <Show when={sortField() === 'dividend_yield'}>
                        {sortOrder() === 'asc' ? <ChevronUp class="w-3 h-3" /> : <ChevronDown class="w-3 h-3" />}
                      </Show>
                    </button>
                  </th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">영업이익률</th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">부채비율</th>
                </tr>
              </thead>
              <tbody>
                <For each={paginatedResults()}>
                  {(result, idx) => (
                    <tr class={`border-t border-[var(--color-surface-light)] hover:bg-[var(--color-surface-light)]/50 transition
                                ${idx() % 2 === 0 ? '' : 'bg-[var(--color-surface-light)]/20'}`}>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                          <span class="font-mono font-medium text-[var(--color-text)]">{result.ticker}</span>
                          <span class="text-xs px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                            {result.market}
                          </span>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-[var(--color-text)]">{result.name}</td>
                      <td class="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                        {formatMarketCap(result.market_cap)}
                      </td>
                      <td class="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                        {formatNumber(result.per, 1)}
                      </td>
                      <td class="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                        {formatNumber(result.pbr, 2)}
                      </td>
                      <td class="px-4 py-3 text-right font-mono">
                        <span class={parseFloat(result.roe || '0') >= 15 ? 'text-green-400' : 'text-[var(--color-text)]'}>
                          {result.roe ? `${formatNumber(result.roe, 1)}%` : '-'}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-right font-mono">
                        <span class={parseFloat(result.dividend_yield || '0') >= 3 ? 'text-blue-400' : 'text-[var(--color-text)]'}>
                          {result.dividend_yield ? `${formatNumber(result.dividend_yield, 2)}%` : '-'}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                        {result.operating_margin ? `${formatNumber(result.operating_margin, 1)}%` : '-'}
                      </td>
                      <td class="px-4 py-3 text-right font-mono">
                        <span class={parseFloat(result.debt_ratio || '0') > 100 ? 'text-red-400' : 'text-[var(--color-text)]'}>
                          {result.debt_ratio ? `${formatNumber(result.debt_ratio, 0)}%` : '-'}
                        </span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          <Show when={totalPages() > 1}>
            <div class="flex items-center justify-between px-4 py-3 border-t border-[var(--color-surface-light)]">
              <span class="text-sm text-[var(--color-text-muted)]">
                총 {sortedResults().length}개 중 {(currentPage() - 1) * pageSize + 1}-{Math.min(currentPage() * pageSize, sortedResults().length)}
              </span>
              <div class="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage() === 1}
                  class="px-3 py-1 rounded bg-[var(--color-surface-light)] text-[var(--color-text)]
                         disabled:opacity-50 hover:bg-[var(--color-primary)]/20 transition"
                >
                  이전
                </button>
                <span class="text-sm text-[var(--color-text)]">
                  {currentPage()} / {totalPages()}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages(), p + 1))}
                  disabled={currentPage() === totalPages()}
                  class="px-3 py-1 rounded bg-[var(--color-surface-light)] text-[var(--color-text)]
                         disabled:opacity-50 hover:bg-[var(--color-primary)]/20 transition"
                >
                  다음
                </button>
              </div>
            </div>
          </Show>
        </Show>

        {/* 모멘텀 결과 테이블 */}
        <Show when={!isLoading() && activeTab() === 'momentum' && (momentumQuery.data?.results?.length || 0) > 0}>
          <div class="overflow-auto flex-1">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-[var(--color-surface-light)]">
                <tr>
                  <th class="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">티커</th>
                  <th class="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">종목명</th>
                  <th class="px-4 py-3 text-center font-medium text-[var(--color-text-muted)]">시장</th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">시작가</th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">종가</th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">변동률</th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">평균거래량</th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">현재거래량</th>
                  <th class="px-4 py-3 text-right font-medium text-[var(--color-text-muted)]">거래량 배율</th>
                </tr>
              </thead>
              <tbody>
                <For each={momentumQuery.data?.results || []}>
                  {(result, idx) => (
                    <tr class={`border-t border-[var(--color-surface-light)] hover:bg-[var(--color-surface-light)]/50 transition
                                ${idx() % 2 === 0 ? '' : 'bg-[var(--color-surface-light)]/20'}`}>
                      <td class="px-4 py-3">
                        <span class="font-mono font-medium text-[var(--color-text)]">{result.symbol}</span>
                      </td>
                      <td class="px-4 py-3 text-[var(--color-text)]">{result.name}</td>
                      <td class="px-4 py-3 text-center">
                        <span class="text-xs px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                          {result.market}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                        {formatNumber(result.start_price)}
                      </td>
                      <td class="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                        {formatNumber(result.end_price)}
                      </td>
                      <td class="px-4 py-3 text-right font-mono">
                        <span class={parseFloat(result.change_pct) >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(result.change_pct)}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                        {formatNumber(result.avg_volume, 0)}
                      </td>
                      <td class="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                        {formatNumber(result.current_volume, 0)}
                      </td>
                      <td class="px-4 py-3 text-right font-mono">
                        <span class={parseFloat(result.volume_ratio) >= 2 ? 'text-yellow-400' : 'text-[var(--color-text)]'}>
                          {formatNumber(result.volume_ratio, 1)}x
                        </span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>
    </div>
  )
}
