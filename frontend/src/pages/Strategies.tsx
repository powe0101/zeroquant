import { createSignal, createResource, For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Play, Pause, Settings, TrendingUp, TrendingDown, AlertCircle, RefreshCw, X, BarChart3, Activity, Trash2, Copy } from 'lucide-solid'
import { getStrategies, startStrategy, stopStrategy, getBacktestStrategies, deleteStrategy, cloneStrategy } from '../api/client'
import type { Strategy } from '../types'
import { useToast } from '../components/Toast'
import { formatCurrency, getDefaultTimeframe } from '../utils/format'
import { AddStrategyModal } from '../components/AddStrategyModal'
import { EditStrategyModal } from '../components/EditStrategyModal'
import { SymbolDisplay } from '../components/SymbolDisplay'

export function Strategies() {
  const toast = useToast()
  const navigate = useNavigate()
  const [filter, setFilter] = createSignal<'all' | 'running' | 'stopped'>('all')
  const [togglingId, setTogglingId] = createSignal<string | null>(null)

  // ==================== 전략 추가 모달 상태 ====================
  const [showAddModal, setShowAddModal] = createSignal(false)

  // ==================== 전략 삭제 모달 상태 ====================
  const [showDeleteModal, setShowDeleteModal] = createSignal(false)
  const [deletingStrategy, setDeletingStrategy] = createSignal<Strategy | null>(null)
  const [isDeleting, setIsDeleting] = createSignal(false)

  // ==================== 전략 복제 모달 상태 ====================
  const [showCloneModal, setShowCloneModal] = createSignal(false)
  const [cloningStrategy, setCloningStrategy] = createSignal<Strategy | null>(null)
  const [cloneName, setCloneName] = createSignal('')
  const [isCloning, setIsCloning] = createSignal(false)

  // ==================== 전략 편집 모달 상태 ====================
  const [showEditModal, setShowEditModal] = createSignal(false)
  const [editingStrategyId, setEditingStrategyId] = createSignal<string | null>(null)
  const [editingStrategyType, setEditingStrategyType] = createSignal<string | null>(null)

  // 전략 템플릿 목록 가져오기
  const [strategyTemplates] = createResource(async () => {
    const response = await getBacktestStrategies()
    return response.strategies
  })

  // 전략 목록 가져오기
  const [strategies, { refetch }] = createResource(getStrategies)

  // ==================== 전략 편집 기능 ====================

  // 편집 모달 열기
  const handleEditStrategy = (strategy: Strategy) => {
    setEditingStrategyId(strategy.id)
    setEditingStrategyType(strategy.strategyType)
    setShowEditModal(true)
  }

  // 편집 모달 닫기
  const closeEditModal = () => {
    setShowEditModal(false)
    setEditingStrategyId(null)
    setEditingStrategyType(null)
  }

  // ==================== 전략 삭제 기능 ====================

  // 삭제 모달 열기
  const handleDeleteClick = (strategy: Strategy) => {
    setDeletingStrategy(strategy)
    setShowDeleteModal(true)
  }

  // 삭제 확인
  const handleConfirmDelete = async () => {
    const strategy = deletingStrategy()
    if (!strategy) return

    setIsDeleting(true)
    try {
      await deleteStrategy(strategy.id)
      toast.success('전략 삭제 완료', `"${strategy.name}" 전략이 삭제되었습니다`)
      setShowDeleteModal(false)
      setDeletingStrategy(null)
      refetch()
    } catch (error) {
      console.error('Failed to delete strategy:', error)
      const errorMsg = error instanceof Error ? error.message : '전략 삭제에 실패했습니다'
      toast.error('전략 삭제 실패', errorMsg)
    } finally {
      setIsDeleting(false)
    }
  }

  // 삭제 모달 닫기
  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setDeletingStrategy(null)
  }

  // ==================== 전략 복제 기능 ====================

  // 복제 모달 열기
  const handleCloneClick = (strategy: Strategy) => {
    setCloningStrategy(strategy)
    setCloneName(`${strategy.name} (복사본)`)
    setShowCloneModal(true)
  }

  // 복제 확인
  const handleConfirmClone = async () => {
    const strategy = cloningStrategy()
    const name = cloneName().trim()
    if (!strategy || !name) return

    setIsCloning(true)
    try {
      const result = await cloneStrategy(strategy.id, name)
      toast.success('전략 복제 완료', `"${result.name || name}" 전략이 생성되었습니다`)
      setShowCloneModal(false)
      setCloningStrategy(null)
      setCloneName('')
      refetch()
    } catch (error) {
      console.error('Failed to clone strategy:', error)
      const errorMsg = error instanceof Error ? error.message : '전략 복제에 실패했습니다'
      toast.error('전략 복제 실패', errorMsg)
    } finally {
      setIsCloning(false)
    }
  }

  // 복제 모달 닫기
  const closeCloneModal = () => {
    setShowCloneModal(false)
    setCloningStrategy(null)
    setCloneName('')
  }

  const filteredStrategies = () => {
    const data = strategies()
    if (!data) return []
    const f = filter()
    if (f === 'all') return data
    if (f === 'running') return data.filter((s) => s.status === 'Running')
    return data.filter((s) => s.status === 'Stopped' || s.status === 'Error')
  }

  const toggleStrategy = async (strategy: Strategy) => {
    setTogglingId(strategy.id)
    const isRunning = strategy.status === 'Running'
    try {
      if (isRunning) {
        await stopStrategy(strategy.id)
        toast.info('전략 중지됨', `"${strategy.name}" 전략이 중지되었습니다`)
      } else {
        await startStrategy(strategy.id)
        toast.success('전략 시작됨', `"${strategy.name}" 전략이 실행되었습니다`)
      }
      // 목록 새로고침
      refetch()
    } catch (error) {
      console.error('Failed to toggle strategy:', error)
      const errorMsg = error instanceof Error ? error.message : '전략 상태 변경에 실패했습니다'
      toast.error(isRunning ? '전략 중지 실패' : '전략 시작 실패', errorMsg)
    } finally {
      setTogglingId(null)
    }
  }

  const runningCount = () => strategies()?.filter((s) => s.status === 'Running').length || 0
  const stoppedCount = () => strategies()?.filter((s) => s.status !== 'Running').length || 0

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex gap-2">
          <button
            class={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter() === 'all'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
            onClick={() => setFilter('all')}
          >
            전체 ({strategies()?.length || 0})
          </button>
          <button
            class={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter() === 'running'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
            onClick={() => setFilter('running')}
          >
            실행 중 ({runningCount()})
          </button>
          <button
            class={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter() === 'stopped'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
            onClick={() => setFilter('stopped')}
          >
            중지됨 ({stoppedCount()})
          </button>
        </div>

        <div class="flex gap-2">
          <button
            class="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg font-medium hover:bg-[var(--color-primary)]/90 transition-colors"
            onClick={() => setShowAddModal(true)}
          >
            + 전략 추가
          </button>
          <button
            class="px-4 py-2 bg-[var(--color-surface)] text-[var(--color-text-muted)] rounded-lg font-medium hover:text-[var(--color-text)] transition-colors flex items-center gap-2"
            onClick={() => refetch()}
          >
            <RefreshCw class={`w-4 h-4 ${strategies.loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* Loading State */}
      <Show when={strategies.loading && !strategies()}>
        <div class="flex items-center justify-center py-12">
          <RefreshCw class="w-8 h-8 animate-spin text-[var(--color-primary)]" />
        </div>
      </Show>

      {/* Error State */}
      <Show when={strategies.error}>
        <div class="flex items-center justify-center py-12 text-red-500">
          <AlertCircle class="w-6 h-6 mr-2" />
          전략 목록을 불러오는데 실패했습니다
        </div>
      </Show>

      {/* Empty State */}
      <Show when={!strategies.loading && !strategies.error && (!strategies() || strategies()?.length === 0)}>
        <div class="flex flex-col items-center justify-center py-12 text-[var(--color-text-muted)]">
          <Settings class="w-12 h-12 mb-4 opacity-50" />
          <p class="text-lg mb-2">등록된 전략이 없습니다</p>
          <p class="text-sm">새로운 전략을 추가해 자동 매매를 시작하세요</p>
        </div>
      </Show>

      {/* Strategies Grid */}
      <Show when={filteredStrategies().length > 0}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <For each={filteredStrategies()}>
            {(strategy) => (
              <div class="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-light)] p-6">
                {/* Header */}
                <div class="flex items-start justify-between mb-4">
                  <div>
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="text-lg font-semibold text-[var(--color-text)]">
                        {strategy.name}
                      </h3>
                      <span
                        class={`px-2 py-0.5 text-xs rounded ${
                          strategy.market === 'KR'
                            ? 'bg-blue-500/20 text-blue-400'
                            : strategy.market === 'US'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-orange-500/20 text-orange-400'
                        }`}
                      >
                        {strategy.market}
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <div
                        class={`w-2 h-2 rounded-full ${
                          strategy.status === 'Running'
                            ? 'bg-green-500 animate-pulse'
                            : strategy.status === 'Error'
                            ? 'bg-red-500'
                            : 'bg-gray-500'
                        }`}
                      />
                      <span class="text-sm text-[var(--color-text-muted)]">
                        {strategy.status === 'Running'
                          ? '실행 중'
                          : strategy.status === 'Error'
                          ? '오류'
                          : '중지됨'}
                      </span>
                    </div>
                  </div>
                  <div class="flex gap-1">
                    <button
                      class="p-2 rounded-lg hover:bg-[var(--color-surface-light)] transition-colors disabled:opacity-50"
                      onClick={() => toggleStrategy(strategy)}
                      disabled={togglingId() === strategy.id}
                      title={strategy.status === 'Running' ? '전략 중지' : '전략 시작'}
                    >
                      <Show when={togglingId() === strategy.id}>
                        <RefreshCw class="w-5 h-5 animate-spin text-[var(--color-text-muted)]" />
                      </Show>
                      <Show when={togglingId() !== strategy.id}>
                        <Show
                          when={strategy.status === 'Running'}
                          fallback={<Play class="w-5 h-5 text-green-500" />}
                        >
                          <Pause class="w-5 h-5 text-yellow-500" />
                        </Show>
                      </Show>
                    </button>
                    <button
                      class="p-2 rounded-lg hover:bg-[var(--color-surface-light)] transition-colors"
                      onClick={() => handleEditStrategy(strategy)}
                      title="전략 설정"
                    >
                      <Settings class="w-5 h-5 text-[var(--color-text-muted)]" />
                    </button>
                    <button
                      class="p-2 rounded-lg hover:bg-blue-500/10 transition-colors"
                      onClick={() => handleCloneClick(strategy)}
                      title="전략 복제"
                    >
                      <Copy class="w-5 h-5 text-blue-400" />
                    </button>
                    <button
                      class="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                      onClick={() => handleDeleteClick(strategy)}
                      title="전략 삭제"
                    >
                      <Trash2 class="w-5 h-5 text-red-400" />
                    </button>
                  </div>
                </div>

                {/* Symbols & Timeframe */}
                <div class="flex flex-wrap items-center gap-2 mb-4">
                  {/* 타임프레임 배지 */}
                  <span class="px-2 py-0.5 text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded font-medium">
                    {strategy.timeframe || getDefaultTimeframe(strategy.strategyType)}
                  </span>
                  {/* 심볼 목록 */}
                  <For each={strategy.symbols}>
                    {(symbol) => (
                      <div class="px-2 py-1 text-xs bg-[var(--color-surface-light)] rounded">
                        <SymbolDisplay
                          ticker={symbol}
                          mode="full"
                          size="sm"
                          autoFetch={true}
                        />
                      </div>
                    )}
                  </For>
                </div>

                {/* Stats */}
                <Show
                  when={strategy.status !== 'Error'}
                  fallback={
                    <div class="flex items-center gap-2 p-3 bg-red-500/10 rounded-lg">
                      <AlertCircle class="w-5 h-5 text-red-500" />
                      <span class="text-sm text-red-500">
                        전략 실행 중 오류가 발생했습니다
                      </span>
                    </div>
                  }
                >
                  <div class="grid grid-cols-3 gap-4">
                    <div>
                      <div class="text-sm text-[var(--color-text-muted)] mb-1">손익</div>
                      <div
                        class={`font-semibold flex items-center gap-1 ${
                          strategy.pnl >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}
                      >
                        <Show
                          when={strategy.pnl >= 0}
                          fallback={<TrendingDown class="w-4 h-4" />}
                        >
                          <TrendingUp class="w-4 h-4" />
                        </Show>
                        {formatCurrency(strategy.pnl)}
                      </div>
                    </div>
                    <div>
                      <div class="text-sm text-[var(--color-text-muted)] mb-1">승률</div>
                      <div class="font-semibold text-[var(--color-text)]">
                        {strategy.winRate.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div class="text-sm text-[var(--color-text-muted)] mb-1">거래</div>
                      <div class="font-semibold text-[var(--color-text)]">
                        {strategy.tradesCount}회
                      </div>
                    </div>
                  </div>
                </Show>

                {/* 빠른 액션 버튼 */}
                <div class="flex gap-2 mt-4 pt-4 border-t border-[var(--color-surface-light)]">
                  <button
                    class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-[var(--color-surface-light)] hover:bg-[var(--color-primary)]/20 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] rounded-lg transition-colors"
                    onClick={() => navigate(`/backtest?strategy=${strategy.id}`)}
                    title="이 전략으로 백테스트"
                  >
                    <BarChart3 class="w-4 h-4" />
                    백테스트
                  </button>
                  <button
                    class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-[var(--color-surface-light)] hover:bg-purple-500/20 text-[var(--color-text-muted)] hover:text-purple-400 rounded-lg transition-colors"
                    onClick={() => navigate(`/simulation?strategy=${strategy.id}`)}
                    title="이 전략으로 시뮬레이션"
                  >
                    <Activity class="w-4 h-4" />
                    시뮬레이션
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* ==================== 전략 편집 모달 ==================== */}
      <EditStrategyModal
        open={showEditModal()}
        strategyId={editingStrategyId()}
        strategyType={editingStrategyType()}
        onClose={closeEditModal}
        onSuccess={refetch}
        templates={strategyTemplates() || []}
      />

      {/* ==================== 전략 추가 모달 ==================== */}
      <AddStrategyModal
        open={showAddModal()}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => refetch()}
        templates={strategyTemplates() || []}
        templatesLoading={strategyTemplates.loading}
      />

      {/* ==================== 전략 삭제 확인 모달 ==================== */}
      <Show when={showDeleteModal()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 배경 오버레이 */}
          <div
            class="absolute inset-0 bg-black/50"
            onClick={closeDeleteModal}
          />

          {/* 모달 컨텐츠 */}
          <div class="relative w-full max-w-md bg-[var(--color-bg)] rounded-2xl shadow-2xl overflow-hidden">
            {/* 헤더 */}
            <div class="flex items-center justify-between p-6 border-b border-[var(--color-surface-light)]">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 flex items-center justify-center bg-red-500/20 rounded-full">
                  <Trash2 class="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h2 class="text-lg font-semibold text-[var(--color-text)]">
                    전략 삭제
                  </h2>
                </div>
              </div>
              <button
                onClick={closeDeleteModal}
                class="p-2 hover:bg-[var(--color-surface)] rounded-lg transition-colors"
              >
                <X class="w-5 h-5" />
              </button>
            </div>

            {/* 본문 */}
            <div class="p-6">
              <p class="text-[var(--color-text)]">
                <span class="font-semibold">"{deletingStrategy()?.name}"</span> 전략을 삭제하시겠습니까?
              </p>
              <p class="mt-2 text-sm text-[var(--color-text-muted)]">
                이 작업은 되돌릴 수 없습니다. 전략과 관련된 모든 설정이 영구적으로 삭제됩니다.
              </p>
            </div>

            {/* 푸터 */}
            <div class="flex items-center justify-end gap-3 p-6 border-t border-[var(--color-surface-light)]">
              <button
                onClick={closeDeleteModal}
                class="px-4 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                disabled={isDeleting()}
              >
                취소
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting()}
                class="px-6 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Show when={isDeleting()}>
                  <RefreshCw class="w-4 h-4 animate-spin" />
                </Show>
                {isDeleting() ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* ==================== 전략 복제 모달 ==================== */}
      <Show when={showCloneModal()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 배경 오버레이 */}
          <div
            class="absolute inset-0 bg-black/50"
            onClick={closeCloneModal}
          />

          {/* 모달 컨텐츠 */}
          <div class="relative w-full max-w-md bg-[var(--color-bg)] rounded-2xl shadow-2xl overflow-hidden">
            {/* 헤더 */}
            <div class="flex items-center justify-between p-6 border-b border-[var(--color-surface-light)]">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 flex items-center justify-center bg-blue-500/20 rounded-full">
                  <Copy class="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h2 class="text-lg font-semibold text-[var(--color-text)]">
                    전략 복제
                  </h2>
                </div>
              </div>
              <button
                onClick={closeCloneModal}
                class="p-2 hover:bg-[var(--color-surface)] rounded-lg transition-colors"
              >
                <X class="w-5 h-5" />
              </button>
            </div>

            {/* 본문 */}
            <div class="p-6 space-y-4">
              <p class="text-[var(--color-text-muted)]">
                <span class="font-semibold text-[var(--color-text)]">"{cloningStrategy()?.name}"</span> 전략을 복제합니다.
                모든 설정이 새 전략으로 복사됩니다.
              </p>

              <div>
                <label class="block text-sm font-medium text-[var(--color-text)] mb-2">
                  새 전략 이름
                </label>
                <input
                  type="text"
                  value={cloneName()}
                  onInput={(e) => setCloneName(e.currentTarget.value)}
                  placeholder="전략 이름을 입력하세요"
                  class="w-full px-4 py-2.5 bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>

            {/* 푸터 */}
            <div class="flex items-center justify-end gap-3 p-6 border-t border-[var(--color-surface-light)]">
              <button
                onClick={closeCloneModal}
                class="px-4 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                disabled={isCloning()}
              >
                취소
              </button>
              <button
                onClick={handleConfirmClone}
                disabled={isCloning() || !cloneName().trim()}
                class="px-6 py-2 bg-[var(--color-primary)] text-white rounded-lg font-medium hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Show when={isCloning()}>
                  <RefreshCw class="w-4 h-4 animate-spin" />
                </Show>
                {isCloning() ? '복제 중...' : '복제'}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
