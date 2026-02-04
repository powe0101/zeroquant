/**
 * VirtualizedTable - 가상 스크롤 테이블
 *
 * 대용량 데이터(1,000+ 행)에서 60fps 스크롤 성능을 유지합니다.
 * @tanstack/solid-virtual 기반으로 보이는 영역만 렌더링합니다.
 */
import { type JSX, For, Show, createMemo } from 'solid-js'
import { createVirtualizer } from '@tanstack/solid-virtual'

// ==================== 타입 정의 ====================

/** 컬럼 정의 */
export interface VirtualColumn<T> {
  /** 컬럼 식별자 */
  key: string
  /** 헤더 표시 텍스트 */
  header: string
  /** 컬럼 너비 (px 또는 %) */
  width?: string | number
  /** 셀 렌더러 */
  render: (item: T, index: number) => JSX.Element
  /** 헤더 정렬 */
  headerAlign?: 'left' | 'center' | 'right'
  /** 셀 정렬 */
  align?: 'left' | 'center' | 'right'
}

/** VirtualizedTable Props */
export interface VirtualizedTableProps<T> {
  /** 데이터 배열 */
  data: T[]
  /** 컬럼 정의 */
  columns: VirtualColumn<T>[]
  /** 행 높이 (px) - 고정 높이 필수 */
  rowHeight: number
  /** 테이블 높이 (px) */
  height: number
  /** 행 클릭 핸들러 */
  onRowClick?: (item: T, index: number) => void
  /** 행 키 추출 함수 */
  getRowKey?: (item: T, index: number) => string | number
  /** 빈 상태 메시지 */
  emptyMessage?: string
  /** 오버스캔 행 수 (기본: 5) */
  overscan?: number
  /** 추가 클래스 */
  class?: string
  /** 행 클래스 함수 */
  rowClass?: (item: T, index: number) => string
}

// ==================== 컴포넌트 ====================

export function VirtualizedTable<T>(props: VirtualizedTableProps<T>) {
  let parentRef: HTMLDivElement | undefined

  // 가상화 설정
  const virtualizer = createVirtualizer({
    get count() {
      return props.data.length
    },
    getScrollElement: () => parentRef ?? null,
    estimateSize: () => props.rowHeight,
    overscan: props.overscan ?? 5,
  })

  // 컬럼 스타일 계산
  const getColumnStyle = (column: VirtualColumn<T>): JSX.CSSProperties => {
    const width = column.width
    if (typeof width === 'number') {
      return { width: `${width}px`, 'min-width': `${width}px` }
    }
    if (typeof width === 'string') {
      return { width, 'min-width': width }
    }
    return { flex: '1' }
  }

  // 정렬 클래스
  const getAlignClass = (align?: 'left' | 'center' | 'right') => {
    switch (align) {
      case 'center':
        return 'text-center'
      case 'right':
        return 'text-right'
      default:
        return 'text-left'
    }
  }

  // 가상 아이템
  const virtualItems = createMemo(() => virtualizer.getVirtualItems())
  const totalSize = createMemo(() => virtualizer.getTotalSize())

  return (
    <div class={`virtualized-table ${props.class || ''}`}>
      {/* 헤더 */}
      <div class="flex bg-[var(--color-surface-light)] border-b border-[var(--color-surface-light)] sticky top-0 z-10">
        <For each={props.columns}>
          {(column) => (
            <div
              class={`px-4 py-3 font-medium text-sm text-[var(--color-text-muted)] ${getAlignClass(column.headerAlign || column.align)}`}
              style={getColumnStyle(column)}
            >
              {column.header}
            </div>
          )}
        </For>
      </div>

      {/* 가상화 스크롤 영역 */}
      <div
        ref={parentRef}
        class="overflow-auto"
        style={{ height: `${props.height}px` }}
      >
        <Show
          when={props.data.length > 0}
          fallback={
            <div class="flex items-center justify-center h-full text-[var(--color-text-muted)]">
              {props.emptyMessage || '데이터가 없습니다'}
            </div>
          }
        >
          {/* 전체 높이 컨테이너 (스크롤바 크기 유지) */}
          <div
            style={{
              height: `${totalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {/* 가상화된 행들 */}
            <For each={virtualItems()}>
              {(virtualRow) => {
                const item = props.data[virtualRow.index]
                const rowKey = props.getRowKey
                  ? props.getRowKey(item, virtualRow.index)
                  : virtualRow.index

                return (
                  <div
                    data-index={virtualRow.index}
                    class={`
                      flex absolute w-full border-b border-[var(--color-surface-light)]
                      hover:bg-[var(--color-surface-light)] transition-colors
                      ${props.onRowClick ? 'cursor-pointer' : ''}
                      ${props.rowClass?.(item, virtualRow.index) || ''}
                    `}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => props.onRowClick?.(item, virtualRow.index)}
                  >
                    <For each={props.columns}>
                      {(column) => (
                        <div
                          class={`px-4 py-2 flex items-center text-sm text-[var(--color-text)] ${getAlignClass(column.align)}`}
                          style={getColumnStyle(column)}
                        >
                          {column.render(item, virtualRow.index)}
                        </div>
                      )}
                    </For>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default VirtualizedTable
