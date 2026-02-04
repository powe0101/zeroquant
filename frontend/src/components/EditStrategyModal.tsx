/**
 * EditStrategyModal - 전략 편집 모달 컴포넌트
 *
 * Strategies.tsx에서 추출된 재사용 가능한 컴포넌트입니다.
 * 전략 설정 로드, 편집, 업데이트 기능을 담당합니다.
 */
import { createSignal, Show, For } from 'solid-js'
import { X, RefreshCw, AlertCircle, Clock } from 'lucide-solid'
import {
  getStrategy,
  updateStrategyConfig,
  getStrategyTimeframeConfig,
  updateStrategyTimeframeConfig,
} from '../api/client'
import type { BacktestStrategy, MultiTimeframeConfig, Timeframe } from '../api/client'
import { DynamicForm } from './DynamicForm'
import { useToast } from './Toast'
import { MultiTimeframeSelector } from './strategy/MultiTimeframeSelector'

export interface EditStrategyModalProps {
  /** 모달 열림 여부 */
  open: boolean
  /** 편집할 전략 ID */
  strategyId: string | null
  /** 전략 유형 (템플릿 조회에 사용) */
  strategyType: string | null
  /** 모달 닫기 콜백 */
  onClose: () => void
  /** 전략 업데이트 성공 시 콜백 */
  onSuccess: () => void
  /** UI 스키마 조회를 위한 전략 템플릿 목록 */
  templates: BacktestStrategy[]
}

export function EditStrategyModal(props: EditStrategyModalProps) {
  const toast = useToast()

  // 내부 상태
  const [editingStrategyName, setEditingStrategyName] = createSignal('')
  const [editingParams, setEditingParams] = createSignal<Record<string, unknown>>({})
  const [editFormErrors, setEditFormErrors] = createSignal<Record<string, string>>({})
  const [isLoadingStrategy, setIsLoadingStrategy] = createSignal(false)
  const [isUpdating, setIsUpdating] = createSignal(false)
  const [updateError, setUpdateError] = createSignal<string | null>(null)
  const [loadedStrategyType, setLoadedStrategyType] = createSignal<string | null>(null)

  // 다중 타임프레임 설정 상태
  const [multiTfConfig, setMultiTfConfig] = createSignal<MultiTimeframeConfig | null>(null)
  const [enableMultiTf, setEnableMultiTf] = createSignal(false)
  const [originalMultiTfConfig, setOriginalMultiTfConfig] = createSignal<MultiTimeframeConfig | null>(null)

  // 현재 전략 유형에 해당하는 템플릿 조회
  const getEditingTemplate = () => {
    const strategyType = loadedStrategyType() || props.strategyType
    if (!strategyType) return null
    return props.templates.find(t => t.id === strategyType) || null
  }

  // 파라미터 변경 처리
  const handleEditParamChange = (key: string, value: unknown) => {
    setEditingParams(prev => ({ ...prev, [key]: value }))
    setEditFormErrors(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // 편집 폼 유효성 검사
  const validateEditForm = (): boolean => {
    const template = getEditingTemplate()
    if (!template?.ui_schema) return true

    const errors: Record<string, string> = {}
    const params = editingParams()

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

    setEditFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // 전략 업데이트
  const handleUpdateStrategy = async () => {
    if (!validateEditForm()) return

    const strategyId = props.strategyId
    if (!strategyId) return

    setIsUpdating(true)
    setUpdateError(null)

    try {
      // 설정에 이름 포함
      const configWithName = {
        ...editingParams(),
        name: editingStrategyName(),
      }

      const response = await updateStrategyConfig(strategyId, configWithName)
      console.log('Strategy updated:', response)

      // 다중 타임프레임 설정 변경 여부 확인 후 업데이트
      const currentConfig = enableMultiTf() ? multiTfConfig() : null
      const originalConfig = originalMultiTfConfig()
      const configChanged = JSON.stringify(currentConfig) !== JSON.stringify(originalConfig)

      if (configChanged) {
        try {
          await updateStrategyTimeframeConfig(strategyId, currentConfig)
          console.log('Timeframe config updated')
        } catch (tfError) {
          console.error('Failed to update timeframe config:', tfError)
          // 타임프레임 설정 실패 시 경고 (기본 설정은 저장되었으므로)
          toast.warning('타임프레임 설정 일부 실패', '전략 설정은 저장되었지만 타임프레임 설정 저장에 실패했습니다')
        }
      }

      // 모달 닫기 및 성공 알림
      handleClose()
      props.onSuccess()
      toast.success('전략 업데이트 완료', `"${editingStrategyName()}" 설정이 저장되었습니다`)
    } catch (error) {
      console.error('Failed to update strategy:', error)
      const errorMsg = error instanceof Error ? error.message : '전략 업데이트에 실패했습니다'
      setUpdateError(errorMsg)
      toast.error('전략 업데이트 실패', errorMsg)
    } finally {
      setIsUpdating(false)
    }
  }

  // 모달 닫기 및 상태 초기화
  const handleClose = () => {
    setEditingStrategyName('')
    setEditingParams({})
    setEditFormErrors({})
    setUpdateError(null)
    setLoadedStrategyType(null)
    setMultiTfConfig(null)
    setOriginalMultiTfConfig(null)
    setEnableMultiTf(false)
    props.onClose()
  }

  // 모달 열릴 때 전략 데이터 로드
  const loadStrategy = async () => {
    const strategyId = props.strategyId
    if (!strategyId) return

    setIsLoadingStrategy(true)
    setUpdateError(null)
    setEditFormErrors({})

    try {
      // 전략 기본 정보 로드
      const detail = await getStrategy(strategyId)
      setLoadedStrategyType(detail.strategy_type)
      setEditingStrategyName(detail.name)
      setEditingParams(detail.config as Record<string, unknown>)

      // 다중 타임프레임 설정 로드
      try {
        const tfConfig = await getStrategyTimeframeConfig(strategyId)
        if (tfConfig.is_multi_timeframe && tfConfig.multi_timeframe_config) {
          setMultiTfConfig(tfConfig.multi_timeframe_config)
          setOriginalMultiTfConfig(tfConfig.multi_timeframe_config)
          setEnableMultiTf(true)
        } else {
          setMultiTfConfig(null)
          setOriginalMultiTfConfig(null)
          setEnableMultiTf(false)
        }
      } catch (tfError) {
        // 타임프레임 설정 로드 실패는 경고만 (기존 전략 호환성)
        console.warn('Failed to load timeframe config:', tfError)
        setMultiTfConfig(null)
        setOriginalMultiTfConfig(null)
        setEnableMultiTf(false)
      }
    } catch (error) {
      console.error('Failed to load strategy:', error)
      const errorMsg = error instanceof Error ? error.message : '전략 정보를 불러오는데 실패했습니다'
      setUpdateError(errorMsg)
      toast.error('전략 로드 실패', errorMsg)
    } finally {
      setIsLoadingStrategy(false)
    }
  }

  // 모달 열릴 때 전략 로드
  if (props.open && props.strategyId) {
    loadStrategy()
  }

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* 배경 오버레이 */}
        <div
          class="absolute inset-0 bg-black/50"
          onClick={handleClose}
        />

        {/* 모달 콘텐츠 */}
        <div class="relative w-full max-w-2xl max-h-[90vh] bg-[var(--color-bg)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {/* 헤더 */}
          <div class="flex items-center justify-between p-6 border-b border-[var(--color-surface-light)]">
            <div>
              <h2 class="text-xl font-semibold text-[var(--color-text)]">
                전략 설정
              </h2>
              <p class="text-sm text-[var(--color-text-muted)]">
                전략 파라미터를 수정하세요
              </p>
            </div>
            <button
              onClick={handleClose}
              class="p-2 hover:bg-[var(--color-surface)] rounded-lg transition-colors"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          {/* 본문 */}
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 로딩 상태 */}
            <Show when={isLoadingStrategy()}>
              <div class="flex items-center justify-center py-12">
                <RefreshCw class="w-8 h-8 animate-spin text-[var(--color-primary)]" />
              </div>
            </Show>

            {/* 로딩 후 폼 표시 */}
            <Show when={!isLoadingStrategy() && getEditingTemplate()}>
              {/* 전략 정보 카드 */}
              <div class="p-4 bg-[var(--color-surface)] rounded-lg space-y-3">
                {/* 실행 스케줄 뱃지 */}
                <Show when={getEditingTemplate()?.execution_schedule}>
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-lg font-medium">
                      {getEditingTemplate()?.schedule_detail || getEditingTemplate()?.execution_schedule}
                    </span>
                    <Show when={getEditingTemplate()?.category}>
                      <span class="px-2 py-1 text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg font-medium">
                        {getEditingTemplate()?.category}
                      </span>
                    </Show>
                  </div>
                </Show>

                {/* 기본 설명 */}
                <p class="text-sm text-[var(--color-text-muted)]">
                  {getEditingTemplate()?.description}
                </p>

                {/* 작동 방식 상세 설명 */}
                <Show when={getEditingTemplate()?.how_it_works}>
                  <div class="pt-3 border-t border-[var(--color-surface-light)]">
                    <h4 class="text-xs font-semibold text-[var(--color-text)] mb-1.5">작동 방식</h4>
                    <p class="text-xs text-[var(--color-text-muted)] leading-relaxed">
                      {getEditingTemplate()?.how_it_works}
                    </p>
                  </div>
                </Show>

                {/* 태그 */}
                <Show when={getEditingTemplate()?.tags?.length}>
                  <div class="flex flex-wrap gap-1 pt-2">
                    <For each={getEditingTemplate()?.tags}>
                      {(tag) => (
                        <span class="px-2 py-0.5 text-xs bg-[var(--color-bg)] text-[var(--color-text-muted)] rounded">
                          #{tag}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>

              {/* 전략 이름 */}
              <div>
                <label class="block text-sm font-medium text-[var(--color-text)] mb-2">
                  전략 이름
                </label>
                <input
                  type="text"
                  value={editingStrategyName()}
                  onInput={(e) => setEditingStrategyName(e.currentTarget.value)}
                  placeholder="전략 이름을 입력하세요"
                  class="w-full px-4 py-2.5 bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              {/* 다중 타임프레임 설정 (지원 전략만) */}
              <Show when={getEditingTemplate()?.isMultiTimeframe}>
                <div class="p-4 bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded-lg">
                  <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                      <Clock class="w-5 h-5 text-[var(--color-primary)]" />
                      <span class="font-medium text-[var(--color-text)]">다중 타임프레임 설정</span>
                    </div>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableMultiTf()}
                        onChange={(e) => {
                          const enabled = e.currentTarget.checked
                          setEnableMultiTf(enabled)
                          if (enabled && !multiTfConfig()) {
                            // 기본값 설정: 현재 선택된 타임프레임을 Primary로
                            const currentTf = (editingParams().timeframe as Timeframe) || '5m'
                            setMultiTfConfig({
                              primary: currentTf,
                              secondary: [],
                            })
                          }
                        }}
                        class="w-4 h-4 text-[var(--color-primary)] rounded focus:ring-[var(--color-primary)]"
                      />
                      <span class="text-sm text-[var(--color-text-muted)]">활성화</span>
                    </label>
                  </div>
                  <Show when={enableMultiTf()}>
                    <MultiTimeframeSelector
                      primaryTimeframe={multiTfConfig()?.primary || '5m'}
                      secondaryTimeframes={(multiTfConfig()?.secondary || []).map(s => s.timeframe)}
                      onPrimaryChange={(tf) => {
                        setMultiTfConfig(prev => prev ? {
                          ...prev,
                          primary: tf,
                          // Primary보다 작은 Secondary는 제거
                          secondary: prev.secondary.filter(s => {
                            const tfOrder: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']
                            return tfOrder.indexOf(s.timeframe) > tfOrder.indexOf(tf)
                          }),
                        } : { primary: tf, secondary: [] })
                      }}
                      onSecondaryChange={(tfs) => {
                        setMultiTfConfig(prev => prev ? {
                          ...prev,
                          secondary: tfs.map(tf => ({ timeframe: tf, candle_count: 100 })),
                        } : { primary: '5m', secondary: tfs.map(tf => ({ timeframe: tf, candle_count: 100 })) })
                      }}
                      maxSecondary={3}
                    />
                    <p class="mt-3 text-xs text-[var(--color-text-muted)]">
                      Primary 타임프레임으로 전략이 실행되고, Secondary 타임프레임으로 추세를 확인합니다.
                    </p>
                  </Show>
                </div>
              </Show>

              {/* 동적 폼 */}
              <Show
                when={getEditingTemplate()?.ui_schema}
                fallback={
                  <div class="text-center py-8 text-[var(--color-text-muted)]">
                    <p>이 전략은 추가 설정이 필요하지 않습니다</p>
                  </div>
                }
              >
                <DynamicForm
                  schema={getEditingTemplate()!.ui_schema!}
                  values={editingParams()}
                  onChange={handleEditParamChange}
                  errors={editFormErrors()}
                />
              </Show>
            </Show>

            {/* 템플릿을 찾을 수 없는 경우 */}
            <Show when={!isLoadingStrategy() && !getEditingTemplate() && !updateError()}>
              <div class="text-center py-8 text-[var(--color-text-muted)]">
                <AlertCircle class="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>전략 템플릿을 찾을 수 없습니다</p>
              </div>
            </Show>
          </div>

          {/* 푸터 */}
          <div class="flex items-center justify-between p-6 border-t border-[var(--color-surface-light)]">
            {/* 오류 메시지 */}
            <Show when={updateError()}>
              <div class="flex items-center gap-2 text-red-500 text-sm">
                <AlertCircle class="w-4 h-4" />
                <span>{updateError()}</span>
              </div>
            </Show>
            <Show when={!updateError()}>
              <div />
            </Show>

            <div class="flex items-center gap-3">
              <button
                onClick={handleClose}
                class="px-4 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                disabled={isUpdating()}
              >
                취소
              </button>
              <button
                onClick={handleUpdateStrategy}
                disabled={isUpdating() || isLoadingStrategy() || !getEditingTemplate()}
                class="px-6 py-2 bg-[var(--color-primary)] text-white rounded-lg font-medium hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Show when={isUpdating()}>
                  <RefreshCw class="w-4 h-4 animate-spin" />
                </Show>
                {isUpdating() ? '저장 중...' : '변경 저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}
