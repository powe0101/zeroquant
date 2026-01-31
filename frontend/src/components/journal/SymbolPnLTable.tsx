/**
 * 종목별 손익 테이블 컴포넌트
 */
import { For, Show } from 'solid-js'
import { BarChart3 } from 'lucide-solid'
import { SymbolDisplay } from '../SymbolDisplay'
import { formatCurrency, formatQuantity, getPnLColor } from '../../utils/format'
import type { SymbolPnLItem } from '../../api/client'

interface SymbolPnLTableProps {
  symbols: SymbolPnLItem[]
}

export function SymbolPnLTable(props: SymbolPnLTableProps) {
  return (
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700">
            <th class="text-left py-3 px-4 font-medium text-gray-400">종목</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">거래수</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">매수수량</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">매도수량</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">매수금액</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">매도금액</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">수수료</th>
            <th class="text-right py-3 px-4 font-medium text-gray-400">실현손익</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.symbols}>
            {(item: SymbolPnLItem) => (
              <tr class="border-b border-gray-800 hover:bg-gray-800/50">
                <td class="py-3 px-4">
                  <SymbolDisplay
                    ticker={item.symbol}
                    symbolName={item.symbol_name}
                    mode="full"
                    size="sm"
                    autoFetch={true}
                  />
                </td>
                <td class="text-right py-3 px-4 text-gray-300">{item.total_trades}</td>
                <td class="text-right py-3 px-4 text-green-400">{formatQuantity(item.total_buy_qty)}</td>
                <td class="text-right py-3 px-4 text-red-400">{formatQuantity(item.total_sell_qty)}</td>
                <td class="text-right py-3 px-4 text-gray-300">{formatCurrency(item.total_buy_value)}</td>
                <td class="text-right py-3 px-4 text-gray-300">{formatCurrency(item.total_sell_value)}</td>
                <td class="text-right py-3 px-4 text-gray-500">{formatCurrency(item.total_fees)}</td>
                <td class={`text-right py-3 px-4 font-medium ${getPnLColor(item.realized_pnl)}`}>
                  {formatCurrency(item.realized_pnl)}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={props.symbols.length === 0}>
        <div class="py-12 text-center text-gray-500">
          <BarChart3 class="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>종목별 거래 내역이 없습니다</p>
        </div>
      </Show>
    </div>
  )
}

export default SymbolPnLTable
