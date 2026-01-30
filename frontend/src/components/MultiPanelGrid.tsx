import { createSignal, createEffect, For, Show, onCleanup, type JSXElement } from 'solid-js'
import { Maximize2, Minimize2, X, GripVertical, Columns, Grid2x2, LayoutGrid, Square } from 'lucide-solid'

// ==================== 타입 ====================

export type LayoutMode = '1x1' | '1x2' | '2x1' | '2x2' | '1x3' | '3x1' | '2x3' | '3x2'

export interface PanelConfig {
  id: string
  symbol?: string
  timeframe?: string
  minimized?: boolean
}

export interface GridPanel {
  id: string
  row: number
  col: number
  width: number
  height: number
}

interface MultiPanelGridProps {
  panels: PanelConfig[]
  layoutMode: LayoutMode
  renderPanel: (panel: PanelConfig, index: number) => JSXElement
  onPanelClose?: (id: string) => void
  onPanelMaximize?: (id: string) => void
  onLayoutChange?: (mode: LayoutMode) => void
}

// ==================== 유틸리티 ====================

const layoutConfigs: Record<LayoutMode, { cols: number; rows: number }> = {
  '1x1': { cols: 1, rows: 1 },
  '1x2': { cols: 2, rows: 1 },
  '2x1': { cols: 1, rows: 2 },
  '2x2': { cols: 2, rows: 2 },
  '1x3': { cols: 3, rows: 1 },
  '3x1': { cols: 1, rows: 3 },
  '2x3': { cols: 3, rows: 2 },
  '3x2': { cols: 2, rows: 3 },
}

const layoutIcons: Record<LayoutMode, typeof Square> = {
  '1x1': Square,
  '1x2': Columns,
  '2x1': Columns,
  '2x2': Grid2x2,
  '1x3': LayoutGrid,
  '3x1': LayoutGrid,
  '2x3': LayoutGrid,
  '3x2': LayoutGrid,
}

// ==================== 컴포넌트 ====================

export function MultiPanelGrid(props: MultiPanelGridProps) {
  const [maximizedPanel, setMaximizedPanel] = createSignal<string | null>(null)
  const [draggingPanel, setDraggingPanel] = createSignal<string | null>(null)
  const [dragOverPanel, setDragOverPanel] = createSignal<string | null>(null)

  const config = () => layoutConfigs[props.layoutMode]
  const maxPanels = () => config().cols * config().rows

  // 패널 순서 (드래그로 재정렬 가능)
  const [panelOrder, setPanelOrder] = createSignal<string[]>(props.panels.map(p => p.id))

  // 패널 목록이 변경되면 순서 업데이트
  createEffect(() => {
    const currentIds = props.panels.map(p => p.id)
    const order = panelOrder()

    // 새로운 패널 추가
    const newIds = currentIds.filter(id => !order.includes(id))
    // 삭제된 패널 제거
    const filteredOrder = order.filter(id => currentIds.includes(id))

    if (newIds.length > 0 || filteredOrder.length !== order.length) {
      setPanelOrder([...filteredOrder, ...newIds])
    }
  })

  // 정렬된 패널 목록
  const orderedPanels = () => {
    const order = panelOrder()
    return props.panels
      .slice()
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      .slice(0, maxPanels())
  }

  // 드래그 시작
  const handleDragStart = (e: DragEvent, panelId: string) => {
    if (!e.dataTransfer) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', panelId)
    setDraggingPanel(panelId)
  }

  // 드래그 오버
  const handleDragOver = (e: DragEvent, panelId: string) => {
    e.preventDefault()
    if (draggingPanel() && draggingPanel() !== panelId) {
      setDragOverPanel(panelId)
    }
  }

  // 드래그 종료
  const handleDragEnd = () => {
    setDraggingPanel(null)
    setDragOverPanel(null)
  }

  // 드롭 처리 (패널 순서 변경)
  const handleDrop = (e: DragEvent, targetId: string) => {
    e.preventDefault()
    const sourceId = draggingPanel()
    if (!sourceId || sourceId === targetId) {
      handleDragEnd()
      return
    }

    setPanelOrder(prev => {
      const newOrder = [...prev]
      const sourceIndex = newOrder.indexOf(sourceId)
      const targetIndex = newOrder.indexOf(targetId)

      if (sourceIndex !== -1 && targetIndex !== -1) {
        // 스왑
        newOrder[sourceIndex] = targetId
        newOrder[targetIndex] = sourceId
      }

      return newOrder
    })

    handleDragEnd()
  }

  // 최대화 토글
  const toggleMaximize = (panelId: string) => {
    setMaximizedPanel(prev => prev === panelId ? null : panelId)
    props.onPanelMaximize?.(panelId)
  }

  // 그리드 스타일 계산
  const gridStyle = () => {
    const { cols, rows } = config()
    return {
      display: 'grid',
      'grid-template-columns': `repeat(${cols}, 1fr)`,
      'grid-template-rows': `repeat(${rows}, 1fr)`,
      gap: '12px',
      height: '100%',
    }
  }

  return (
    <div class="h-full flex flex-col">
      {/* 레이아웃 선택 바 */}
      <div class="flex items-center gap-2 mb-3">
        <span class="text-sm text-[var(--color-text-muted)]">레이아웃:</span>
        <div class="flex gap-1 bg-[var(--color-surface)] rounded-lg p-1">
          <For each={['1x1', '1x2', '2x2', '2x3'] as LayoutMode[]}>
            {(mode) => {
              const Icon = layoutIcons[mode]
              return (
                <button
                  onClick={() => props.onLayoutChange?.(mode)}
                  class={`p-1.5 rounded transition ${
                    props.layoutMode === mode
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-light)]'
                  }`}
                  title={mode}
                >
                  <Icon class="w-4 h-4" />
                </button>
              )
            }}
          </For>
        </div>
        <span class="text-xs text-[var(--color-text-muted)] ml-2">
          {orderedPanels().length}/{maxPanels()} 패널
        </span>
      </div>

      {/* 그리드 컨테이너 */}
      <div class="flex-1 min-h-0" style={maximizedPanel() ? undefined : gridStyle()}>
        <Show when={maximizedPanel()}>
          {/* 최대화된 패널 */}
          {(() => {
            const panel = props.panels.find(p => p.id === maximizedPanel())
            if (!panel) return null
            const index = props.panels.indexOf(panel)
            return (
              <div class="h-full bg-[var(--color-surface)] rounded-xl overflow-hidden flex flex-col">
                <div class="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-light)] border-b border-[var(--color-bg)]">
                  <span class="text-sm font-medium text-[var(--color-text)]">
                    {panel.symbol || '심볼 없음'}
                  </span>
                  <div class="flex items-center gap-1">
                    <button
                      onClick={() => toggleMaximize(panel.id)}
                      class="p-1 hover:bg-[var(--color-surface)] rounded"
                    >
                      <Minimize2 class="w-4 h-4 text-[var(--color-text-muted)]" />
                    </button>
                  </div>
                </div>
                <div class="flex-1 overflow-auto p-3">
                  {props.renderPanel(panel, index)}
                </div>
              </div>
            )
          })()}
        </Show>

        <Show when={!maximizedPanel()}>
          {/* 그리드 패널들 */}
          <For each={orderedPanels()}>
            {(panel, index) => (
              <div
                class={`bg-[var(--color-surface)] rounded-xl overflow-hidden flex flex-col transition-all
                        ${draggingPanel() === panel.id ? 'opacity-50 scale-95' : ''}
                        ${dragOverPanel() === panel.id ? 'ring-2 ring-[var(--color-primary)]' : ''}`}
                onDragOver={(e) => handleDragOver(e, panel.id)}
                onDrop={(e) => handleDrop(e, panel.id)}
                onDragLeave={() => setDragOverPanel(null)}
              >
                {/* 패널 헤더 */}
                <div
                  class="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-light)]
                         border-b border-[var(--color-bg)] cursor-move"
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, panel.id)}
                  onDragEnd={handleDragEnd}
                >
                  <div class="flex items-center gap-2">
                    <GripVertical class="w-4 h-4 text-[var(--color-text-muted)]" />
                    <span class="text-sm font-medium text-[var(--color-text)]">
                      {panel.symbol || '심볼 선택...'}
                    </span>
                    <Show when={panel.timeframe}>
                      <span class="text-xs px-1.5 py-0.5 bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded">
                        {panel.timeframe}
                      </span>
                    </Show>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      onClick={() => toggleMaximize(panel.id)}
                      class="p-1 hover:bg-[var(--color-surface)] rounded"
                      title="최대화"
                    >
                      <Maximize2 class="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                    </button>
                    <Show when={props.onPanelClose}>
                      <button
                        onClick={() => props.onPanelClose?.(panel.id)}
                        class="p-1 hover:bg-red-500/20 rounded"
                        title="닫기"
                      >
                        <X class="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </Show>
                  </div>
                </div>

                {/* 패널 컨텐츠 */}
                <div class="flex-1 overflow-auto p-2 min-h-0">
                  {props.renderPanel(panel, index())}
                </div>
              </div>
            )}
          </For>

          {/* 빈 슬롯 */}
          <For each={Array(Math.max(0, maxPanels() - orderedPanels().length)).fill(null)}>
            {() => (
              <div class="bg-[var(--color-surface)]/50 rounded-xl border-2 border-dashed border-[var(--color-surface-light)]
                          flex items-center justify-center text-[var(--color-text-muted)]">
                <div class="text-center">
                  <Grid2x2 class="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p class="text-sm">빈 패널</p>
                  <p class="text-xs opacity-70">심볼을 추가하세요</p>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

// ==================== 리사이즈 핸들 컴포넌트 ====================

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical' | 'both'
  onResize: (deltaX: number, deltaY: number) => void
}

export function ResizeHandle(props: ResizeHandleProps) {
  const [isDragging, setIsDragging] = createSignal(false)
  let startX = 0
  let startY = 0

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    startX = e.clientX
    startY = e.clientY

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging()) return
    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY
    props.onResize(deltaX, deltaY)
    startX = e.clientX
    startY = e.clientY
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  onCleanup(() => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  })

  const cursorClass = () => {
    switch (props.direction) {
      case 'horizontal': return 'cursor-col-resize'
      case 'vertical': return 'cursor-row-resize'
      case 'both': return 'cursor-nwse-resize'
    }
  }

  return (
    <div
      class={`absolute bg-transparent hover:bg-[var(--color-primary)]/30 transition ${cursorClass()}
              ${props.direction === 'horizontal' ? 'w-2 h-full right-0 top-0' : ''}
              ${props.direction === 'vertical' ? 'h-2 w-full bottom-0 left-0' : ''}
              ${props.direction === 'both' ? 'w-4 h-4 right-0 bottom-0' : ''}`}
      onMouseDown={handleMouseDown}
    />
  )
}
