/**
 * 체결 내역 테이블 컴포넌트
 */
import { createSignal, For, Show } from 'solid-js'
import { BarChart3, Edit3, Check, X } from 'lucide-solid'
import { SymbolDisplay } from '../SymbolDisplay'
import { formatCurrency, formatQuantity, formatDateTime, getPnLColor } from '../../utils/format'
import type { JournalExecution, ExecutionFilter } from '../../api/client'
import { updateJournalExecution } from '../../api/client'

interface ExecutionsTableProps {
  executions: JournalExecution[]
  onRefetch: () => void
  symbolFilter: string
  setSymbolFilter: (value: string) => void
  sideFilter: string
  setSideFilter: (value: string) => void
}

export function ExecutionsTable(props: ExecutionsTableProps) {
  // 메모 편집 상태
  const [editingMemoId, setEditingMemoId] = createSignal<string | null>(null)
  const [editingMemoText, setEditingMemoText] = createSignal('')
  const [isSavingMemo, setIsSavingMemo] = createSignal(false)

  // 메모 편집 시작
  const startEditingMemo = (id: string, currentMemo: string | null) => {
    setEditingMemoId(id)
    setEditingMemoText(currentMemo || '')
  }

  // 메모 편집 취소
  const cancelEditingMemo = () => {
    setEditingMemoId(null)
    setEditingMemoText('')
  }

  // 메모 저장
  const saveMemo = async (id: string) => {
    setIsSavingMemo(true)
    try {
      await updateJournalExecution(id, { memo: editingMemoText() })
      setEditingMemoId(null)
      setEditingMemoText('')
      props.onRefetch()
    } catch (error) {
      console.error('Failed to save memo:', error)
    } finally {
      setIsSavingMemo(false)
    }
  }

  return (
    <div>
      {/* 필터 */}
      <div class="mb-4 flex gap-4 flex-wrap">
        <input
          type="text"
          placeholder="종목 검색..."
          value={props.symbolFilter}
          onInput={(e) => props.setSymbolFilter(e.currentTarget.value)}
          class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <select
          value={props.sideFilter}
          onChange={(e) => props.setSideFilter(e.currentTarget.value)}
          class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">전체</option>
          <option value="buy">매수</option>
          <option value="sell">매도</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-700">
              <th class="text-left py-3 px-4 font-medium text-gray-400">시간</th>
              <th class="text-left py-3 px-4 font-medium text-gray-400">종목</th>
              <th class="text-center py-3 px-4 font-medium text-gray-400">매매</th>
              <th class="text-right py-3 px-4 font-medium text-gray-400">수량</th>
              <th class="text-right py-3 px-4 font-medium text-gray-400">가격</th>
              <th class="text-right py-3 px-4 font-medium text-gray-400">거래대금</th>
              <th class="text-right py-3 px-4 font-medium text-gray-400">수수료</th>
              <th class="text-right py-3 px-4 font-medium text-gray-400">실현손익</th>
              <th class="text-left py-3 px-4 font-medium text-gray-400 min-w-48">메모</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.executions}>
              {(exec: JournalExecution) => (
                <tr class="border-b border-gray-800 hover:bg-gray-800/50">
                  <td class="py-3 px-4 text-gray-400 text-xs">
                    {formatDateTime(exec.executed_at)}
                  </td>
                  <td class="py-3 px-4">
                    <SymbolDisplay
                      ticker={exec.symbol}
                      symbolName={exec.symbol_name}
                      exchange={exec.exchange}
                      mode="full"
                      size="sm"
                      autoFetch={true}
                    />
                  </td>
                  <td class="text-center py-3 px-4">
                    <span
                      class={`px-2 py-1 rounded text-xs font-medium ${
                        exec.side === 'buy'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {exec.side === 'buy' ? '매수' : '매도'}
                    </span>
                  </td>
                  <td class="text-right py-3 px-4 text-gray-300">
                    {formatQuantity(exec.quantity)}
                  </td>
                  <td class="text-right py-3 px-4 text-gray-300">
                    {formatCurrency(exec.price)}
                  </td>
                  <td class="text-right py-3 px-4 text-gray-300">
                    {formatCurrency(exec.notional_value)}
                  </td>
                  <td class="text-right py-3 px-4 text-gray-500">
                    {exec.fee ? formatCurrency(exec.fee) : '-'}
                  </td>
                  <td class={`text-right py-3 px-4 font-medium ${getPnLColor(exec.realized_pnl)}`}>
                    {exec.realized_pnl ? formatCurrency(exec.realized_pnl) : '-'}
                  </td>
                  <td class="py-3 px-4 min-w-48">
                    <Show when={editingMemoId() === exec.id} fallback={
                      <div class="flex items-center gap-2 group">
                        <Show when={exec.memo}>
                          <span class="text-xs text-gray-400 truncate max-w-32" title={exec.memo || ''}>
                            {exec.memo}
                          </span>
                        </Show>
                        <Show when={exec.tags && exec.tags.length > 0}>
                          <div class="flex gap-1">
                            <For each={exec.tags}>
                              {(tag: string) => (
                                <span class="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                                  {tag}
                                </span>
                              )}
                            </For>
                          </div>
                        </Show>
                        <button
                          onClick={() => startEditingMemo(exec.id, exec.memo)}
                          class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded transition-opacity"
                          title="메모 편집"
                        >
                          <Edit3 class="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                    }>
                      <div class="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingMemoText()}
                          onInput={(e) => setEditingMemoText(e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveMemo(exec.id)
                            if (e.key === 'Escape') cancelEditingMemo()
                          }}
                          class="flex-1 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                          placeholder="메모 입력..."
                          autofocus
                        />
                        <button
                          onClick={() => saveMemo(exec.id)}
                          disabled={isSavingMemo()}
                          class="p-1 hover:bg-green-600/20 rounded text-green-400 disabled:opacity-50"
                          title="저장"
                        >
                          <Check class="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEditingMemo}
                          class="p-1 hover:bg-red-600/20 rounded text-red-400"
                          title="취소"
                        >
                          <X class="w-4 h-4" />
                        </button>
                      </div>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={props.executions.length === 0}>
          <div class="py-12 text-center text-gray-500">
            <BarChart3 class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>체결 내역이 없습니다</p>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default ExecutionsTable
