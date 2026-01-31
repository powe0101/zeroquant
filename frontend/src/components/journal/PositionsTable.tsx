/**
 * 보유 현황 테이블 컴포넌트
 */
import { For, Show } from 'solid-js'
import { BookOpen } from 'lucide-solid'
import { SymbolDisplay } from '../SymbolDisplay'
import { formatCurrency, formatPercent, formatQuantity, getPnLColor } from '../../utils/format'
import type { JournalPosition } from '../../api/client'

interface PositionsTableProps {
  positions: JournalPosition[]
}

export function PositionsTable(props: PositionsTableProps) {
  return (
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700">
            <th class="text-left py-3 px-4 font-medium text-gray-400">종목</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">수량</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">평균단가</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">현재가</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">평가금액</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">손익</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">수익률</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">비중</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.positions}>
            {(position: JournalPosition) => (
              <tr class="border-b border-gray-800 hover:bg-gray-800/50">
                <td class="py-3 px-4">
                  <SymbolDisplay
                    ticker={position.symbol}
                    symbolName={position.symbol_name}
                    exchange={position.exchange}
                    mode="full"
                    size="sm"
                    autoFetch={false}
                  />
                </td>
                <td class="text-right py-3 px-4 text-gray-300">
                  {formatQuantity(position.quantity)}
                </td>
                <td class="text-right py-3 px-4 text-gray-300">
                  {formatCurrency(position.entry_price)}
                </td>
                <td class="text-right py-3 px-4 text-gray-300">
                  {position.current_price ? formatCurrency(position.current_price) : '-'}
                </td>
                <td class="text-right py-3 px-4 text-gray-300">
                  {position.market_value ? formatCurrency(position.market_value) : '-'}
                </td>
                <td class={`text-right py-3 px-4 font-medium ${getPnLColor(position.unrealized_pnl)}`}>
                  {position.unrealized_pnl ? formatCurrency(position.unrealized_pnl) : '-'}
                </td>
                <td class={`text-right py-3 px-4 font-medium ${getPnLColor(position.unrealized_pnl_pct)}`}>
                  {position.unrealized_pnl_pct ? formatPercent(position.unrealized_pnl_pct) : '-'}
                </td>
                <td class="text-right py-3 px-4 text-gray-400">
                  {position.weight_pct ? `${position.weight_pct}%` : '-'}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={props.positions.length === 0}>
        <div class="py-12 text-center text-gray-500">
          <BookOpen class="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>보유 포지션이 없습니다</p>
        </div>
      </Show>
    </div>
  )
}

export default PositionsTable
