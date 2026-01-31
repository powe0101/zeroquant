import { createSignal, For, Show } from 'solid-js'
import { X, ChevronRight, Search, RefreshCw, AlertCircle } from 'lucide-solid'
import { createStrategy } from '../api/client'
import type { BacktestStrategy } from '../api/client'
import { DynamicForm } from './DynamicForm'
import { useToast } from './Toast'
import { getDefaultTimeframe } from '../utils/format'

export interface AddStrategyModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  templates: BacktestStrategy[]
  templatesLoading?: boolean
}

export function AddStrategyModal(props: AddStrategyModalProps) {
  const toast = useToast()

  // 모달 상태
  const [modalStep, setModalStep] = createSignal<'select' | 'configure'>('select')
  const [selectedStrategy, setSelectedStrategy] = createSignal<BacktestStrategy | null>(null)
  const [strategyParams, setStrategyParams] = createSignal<Record<string, unknown>>({})
  const [formErrors, setFormErrors] = createSignal<Record<string, string>>({})
  const [customName, setCustomName] = createSignal('')
  const [searchQuery, setSearchQuery] = createSignal('')
  const [selectedCategory, setSelectedCategory] = createSignal<string | null>(null)

  // 생성 상태
  const [isCreating, setIsCreating] = createSignal(false)
  const [createError, setCreateError] = createSignal<string | null>(null)

  // 카테고리 목록
  const categories = () => {
    const cats = new Set<string>()
    props.templates?.forEach(s => {
      if (s.category) cats.add(s.category)
    })
    return Array.from(cats)
  }

  // 필터링된 템플릿
  const filteredTemplates = () => {
    let templates = props.templates || []

    // 카테고리 필터
    if (selectedCategory()) {
      templates = templates.filter(s => s.category === selectedCategory())
    } else {
      // "전체" 탭 선택 시 "사용자정의" 카테고리 제외
      templates = templates.filter(s => s.category !== '사용자정의')
    }

    // 검색 필터
    const query = searchQuery().toLowerCase()
    if (query) {
      templates = templates.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.tags?.some(t => t.toLowerCase().includes(query))
      )
    }

    return templates
  }

  // 전략 선택
  const selectStrategy = (template: BacktestStrategy) => {
    setSelectedStrategy(template)

    // 기본값으로 파라미터 초기화
    const initialParams: Record<string, unknown> = { ...(template.default_params || {}) }

    // ui_schema의 default_value도 적용 (default_params에 없는 필드의 경우)
    if (template.ui_schema) {
      for (const field of template.ui_schema.fields) {
        if (initialParams[field.key] === undefined && field.default_value !== undefined) {
          initialParams[field.key] = field.default_value
        }
      }
    }

    setStrategyParams(initialParams)
    setFormErrors({})
    setCustomName(template.name)
    setModalStep('configure')
  }

  // 파라미터 변경 처리
  const handleParamChange = (key: string, value: unknown) => {
    setStrategyParams(prev => ({ ...prev, [key]: value }))
    // 에러 초기화
    setFormErrors(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // 폼 유효성 검사
  const validateForm = (): boolean => {
    const template = selectedStrategy()
    if (!template?.ui_schema) return true

    const errors: Record<string, string> = {}
    const params = strategyParams()

    for (const field of template.ui_schema.fields) {
      const value = params[field.key]

      // 필수 필드 검사
      if (field.validation.required) {
        if (value === undefined || value === null || value === '') {
          errors[field.key] = '필수 항목입니다'
          continue
        }
        if (Array.isArray(value) && value.length === 0) {
          errors[field.key] = '최소 하나 이상 선택해주세요'
          continue
        }
      }

      // 숫자 범위 검사
      if (field.field_type === 'number' || field.field_type === 'range') {
        const numValue = value as number
        if (field.validation.min !== undefined && numValue < field.validation.min) {
          errors[field.key] = `최소값은 ${field.validation.min}입니다`
        }
        if (field.validation.max !== undefined && numValue > field.validation.max) {
          errors[field.key] = `최대값은 ${field.validation.max}입니다`
        }
      }

      // 심볼 개수 검사
      if (field.field_type === 'symbol_picker' && Array.isArray(value)) {
        if (field.validation.min_items && value.length < field.validation.min_items) {
          errors[field.key] = `최소 ${field.validation.min_items}개를 선택해주세요`
        }
        if (field.validation.max_items && value.length > field.validation.max_items) {
          errors[field.key] = `최대 ${field.validation.max_items}개까지 선택 가능합니다`
        }
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // 전략 생성
  const handleCreateStrategy = async () => {
    if (!validateForm()) return

    const template = selectedStrategy()
    if (!template) return

    setIsCreating(true)
    setCreateError(null)

    try {
      const response = await createStrategy({
        strategy_type: template.id,
        name: customName() || template.name,
        parameters: strategyParams(),
      })

      console.log('Strategy created:', response)

      // 모달 닫기 및 상태 초기화
      closeModal()
      // 부모에게 전략 목록 새로고침 알림
      props.onSuccess()
      // 성공 토스트
      toast.success('전략 생성 완료', `"${customName() || template.name}" 전략이 생성되었습니다`)
    } catch (error) {
      console.error('Failed to create strategy:', error)
      const errorMsg = error instanceof Error ? error.message : '전략 생성에 실패했습니다'
      setCreateError(errorMsg)
      toast.error('전략 생성 실패', errorMsg)
    } finally {
      setIsCreating(false)
    }
  }

  // 모달 닫기
  const closeModal = () => {
    props.onClose()
    // 상태 초기화
    setModalStep('select')
    setSelectedStrategy(null)
    setStrategyParams({})
    setFormErrors({})
    setCustomName('')
    setSearchQuery('')
    setSelectedCategory(null)
    setCreateError(null)
  }

  // 선택 단계로 돌아가기
  const goBack = () => {
    setModalStep('select')
    setSelectedStrategy(null)
    setStrategyParams({})
    setFormErrors({})
    setCustomName('')
  }

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* 배경 오버레이 */}
        <div
          class="absolute inset-0 bg-black/50"
          onClick={closeModal}
        />

        {/* 모달 컨텐츠 */}
        <div class="relative w-full max-w-4xl max-h-[90vh] bg-[var(--color-bg)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {/* 헤더 */}
          <div class="flex items-center justify-between p-6 border-b border-[var(--color-surface-light)]">
            <div class="flex items-center gap-3">
              <Show when={modalStep() === 'configure'}>
                <button
                  onClick={goBack}
                  class="p-2 hover:bg-[var(--color-surface)] rounded-lg transition-colors"
                >
                  <ChevronRight class="w-5 h-5 rotate-180" />
                </button>
              </Show>
              <div>
                <h2 class="text-xl font-semibold text-[var(--color-text)]">
                  {modalStep() === 'select' ? '전략 선택' : selectedStrategy()?.name}
                </h2>
                <p class="text-sm text-[var(--color-text-muted)]">
                  {modalStep() === 'select'
                    ? '자동 매매에 사용할 전략을 선택하세요'
                    : '전략 파라미터를 설정하세요'}
                </p>
              </div>
            </div>
            <button
              onClick={closeModal}
              class="p-2 hover:bg-[var(--color-surface)] rounded-lg transition-colors"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          {/* 본문 */}
          <div class="flex-1 overflow-y-auto">
            {/* 1단계: 전략 선택 */}
            <Show when={modalStep() === 'select'}>
              <div class="p-6 space-y-6">
                {/* 검색 및 필터 */}
                <div class="flex gap-4">
                  {/* 검색 */}
                  <div class="flex-1 relative">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)]" />
                    <input
                      type="text"
                      value={searchQuery()}
                      onInput={(e) => setSearchQuery(e.currentTarget.value)}
                      placeholder="전략 검색..."
                      class="w-full pl-10 pr-4 py-2.5 bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                </div>

                {/* 카테고리 필터 */}
                <div class="flex flex-wrap gap-2">
                  <button
                    class={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedCategory() === null
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                    onClick={() => setSelectedCategory(null)}
                  >
                    전체
                  </button>
                  <For each={categories()}>
                    {(category) => (
                      <button
                        class={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          selectedCategory() === category
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                        }`}
                        onClick={() => setSelectedCategory(category)}
                      >
                        {category}
                      </button>
                    )}
                  </For>
                </div>

                {/* 전략 목록 */}
                <Show
                  when={!props.templatesLoading}
                  fallback={
                    <div class="flex items-center justify-center py-12">
                      <RefreshCw class="w-8 h-8 animate-spin text-[var(--color-primary)]" />
                    </div>
                  }
                >
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <For each={filteredTemplates()}>
                      {(template) => (
                        <button
                          class="text-left p-4 bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded-xl hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-light)] transition-all group"
                          onClick={() => selectStrategy(template)}
                        >
                          <div class="flex items-start justify-between mb-2">
                            <h3 class="font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                              {template.name}
                            </h3>
                            <div class="flex gap-1">
                              <Show when={template.execution_schedule}>
                                <span class="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                                  {template.schedule_detail || template.execution_schedule}
                                </span>
                              </Show>
                              <Show when={template.category}>
                                <span class="px-2 py-0.5 text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded">
                                  {template.category}
                                </span>
                              </Show>
                            </div>
                          </div>
                          <p class="text-sm text-[var(--color-text-muted)] mb-3 line-clamp-2">
                            {template.description}
                          </p>
                          <div class="flex flex-wrap gap-1">
                            <For each={template.tags?.slice(0, 3)}>
                              {(tag) => (
                                <span class="px-2 py-0.5 text-xs bg-[var(--color-bg)] text-[var(--color-text-muted)] rounded">
                                  #{tag}
                                </span>
                              )}
                            </For>
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>

                {/* 검색 결과 없음 */}
                <Show when={filteredTemplates().length === 0 && !props.templatesLoading}>
                  <div class="text-center py-12 text-[var(--color-text-muted)]">
                    <p class="mb-2">검색 결과가 없습니다</p>
                    <p class="text-sm">다른 검색어를 시도해보세요</p>
                  </div>
                </Show>
              </div>
            </Show>

            {/* 2단계: 파라미터 설정 */}
            <Show when={modalStep() === 'configure' && selectedStrategy()}>
              <div class="p-6 space-y-6">
                {/* 전략 정보 카드 */}
                <div class="p-4 bg-[var(--color-surface)] rounded-lg space-y-3">
                  {/* 실행 스케줄 배지 */}
                  <Show when={selectedStrategy()?.execution_schedule}>
                    <div class="flex items-center gap-2">
                      <span class="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-lg font-medium">
                        ⏰ {selectedStrategy()?.schedule_detail || selectedStrategy()?.execution_schedule}
                      </span>
                      <Show when={selectedStrategy()?.category}>
                        <span class="px-2 py-1 text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg font-medium">
                          {selectedStrategy()?.category}
                        </span>
                      </Show>
                    </div>
                  </Show>

                  {/* 설명 */}
                  <p class="text-sm text-[var(--color-text-muted)]">
                    {selectedStrategy()?.description}
                  </p>

                  {/* 작동 방식 */}
                  <Show when={selectedStrategy()?.how_it_works}>
                    <div class="pt-3 border-t border-[var(--color-surface-light)]">
                      <h4 class="text-xs font-semibold text-[var(--color-text)] mb-1.5">작동 방식</h4>
                      <p class="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        {selectedStrategy()?.how_it_works}
                      </p>
                    </div>
                  </Show>

                  {/* 태그 */}
                  <Show when={selectedStrategy()?.tags?.length}>
                    <div class="flex flex-wrap gap-1 pt-2">
                      <For each={selectedStrategy()?.tags}>
                        {(tag) => (
                          <span class="px-2 py-0.5 text-xs bg-[var(--color-bg)] text-[var(--color-text-muted)] rounded">
                            #{tag}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>

                {/* 전략 이름 커스터마이징 */}
                <div>
                  <label class="block text-sm font-medium text-[var(--color-text)] mb-2">
                    전략 이름
                  </label>
                  <input
                    type="text"
                    value={customName()}
                    onInput={(e) => setCustomName(e.currentTarget.value)}
                    placeholder="전략 이름을 입력하세요"
                    class="w-full px-4 py-2.5 bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                  <p class="mt-1 text-xs text-[var(--color-text-muted)]">
                    동일한 전략을 다른 종목이나 설정으로 여러 개 등록할 수 있습니다.
                  </p>
                </div>

                {/* 타임프레임 선택 */}
                <div>
                  <label class="block text-sm font-medium text-[var(--color-text)] mb-2">
                    타임프레임
                  </label>
                  <select
                    value={(strategyParams() as Record<string, unknown>).timeframe as string || getDefaultTimeframe(selectedStrategy()?.id || '')}
                    onChange={(e) => handleParamChange('timeframe', e.currentTarget.value)}
                    class="w-full px-4 py-2.5 bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    <optgroup label="실시간/분봉">
                      <option value="1m">1분 (실시간)</option>
                      <option value="5m">5분</option>
                      <option value="15m">15분</option>
                      <option value="30m">30분</option>
                      <option value="1h">1시간</option>
                      <option value="4h">4시간</option>
                    </optgroup>
                    <optgroup label="일봉/주봉">
                      <option value="1d">일봉</option>
                      <option value="1w">주봉</option>
                      <option value="1M">월봉</option>
                    </optgroup>
                  </select>
                  <p class="mt-1 text-xs text-[var(--color-text-muted)]">
                    전략 실행에 사용할 캔들 주기를 선택하세요.
                  </p>
                </div>

                {/* 동적 폼 */}
                <Show
                  when={selectedStrategy()?.ui_schema}
                  fallback={
                    <div class="text-center py-8 text-[var(--color-text-muted)]">
                      <p>이 전략은 추가 설정이 필요하지 않습니다</p>
                    </div>
                  }
                >
                  <DynamicForm
                    schema={selectedStrategy()!.ui_schema!}
                    values={strategyParams()}
                    onChange={handleParamChange}
                    errors={formErrors()}
                  />
                </Show>
              </div>
            </Show>
          </div>

          {/* 푸터 */}
          <div class="flex items-center justify-between p-6 border-t border-[var(--color-surface-light)]">
            {/* 에러 메시지 */}
            <Show when={createError()}>
              <div class="flex items-center gap-2 text-red-500 text-sm">
                <AlertCircle class="w-4 h-4" />
                <span>{createError()}</span>
              </div>
            </Show>
            <Show when={!createError()}>
              <div />
            </Show>

            <div class="flex items-center gap-3">
              <button
                onClick={closeModal}
                class="px-4 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                disabled={isCreating()}
              >
                취소
              </button>
              <Show when={modalStep() === 'configure'}>
                <button
                  onClick={handleCreateStrategy}
                  disabled={isCreating()}
                  class="px-6 py-2 bg-[var(--color-primary)] text-white rounded-lg font-medium hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Show when={isCreating()}>
                    <RefreshCw class="w-4 h-4 animate-spin" />
                  </Show>
                  {isCreating() ? '생성 중...' : '전략 생성'}
                </button>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}
