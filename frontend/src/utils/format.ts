/**
 * 통화 포맷 (KRW 또는 USD)
 * @param value - 숫자 또는 문자열 값
 * @param currency - 통화 유형 (기본값: KRW)
 * @returns 포맷된 통화 문자열 (예: "₩1,234,567")
 */
export function formatCurrency(value: string | number, currency: 'KRW' | 'USD' = 'KRW'): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return currency === 'KRW' ? '₩0' : '$0'

  if (currency === 'KRW') {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(numValue)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numValue)
}

/**
 * 퍼센트 포맷 (+/- 부호 포함)
 */
export function formatPercent(value: string | number): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '+0.00%'
  const sign = numValue >= 0 ? '+' : ''
  return `${sign}${numValue.toFixed(2)}%`
}

/**
 * 수량 포맷 (천 단위 구분자 + 최대 4자리 소수점)
 */
export function formatQuantity(value: string | number): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '0'
  return numValue.toLocaleString('ko-KR', { maximumFractionDigits: 4 })
}

/**
 * 날짜 포맷 (YYYY.MM.DD)
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/**
 * 날짜시간 포맷 (YYYY.MM.DD HH:mm)
 */
export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 손익 색상 클래스 반환
 */
export function getPnLColor(value: string | number | null): string {
  if (value === null) return 'text-gray-500'
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (numValue > 0) return 'text-green-500'
  if (numValue < 0) return 'text-red-500'
  return 'text-gray-500'
}

/**
 * Get the default timeframe for a given strategy type
 * @param strategyType - The strategy type identifier
 * @returns Default timeframe string (e.g., "1m", "15m", "1d")
 */
export function getDefaultTimeframe(strategyType: string): string {
  switch (strategyType) {
    // Real-time strategies: 1m
    case 'grid':
    case 'grid_trading':
    case 'magic_split':
    case 'split':
    case 'infinity_bot':
    case 'trailing_stop':
      return '1m'
    // Minute-based strategies: 15m
    case 'rsi':
    case 'rsi_mean_reversion':
    case 'bollinger':
    case 'bollinger_bands':
    case 'sma':
    case 'sma_crossover':
    case 'ma_crossover':
    case 'candle_pattern':
      return '15m'
    // Daily strategies: 1d
    case 'volatility_breakout':
    case 'volatility':
    case 'snow':
    case 'snow_us':
    case 'snow_kr':
    case 'stock_rotation':
    case 'rotation':
    case 'market_interest_day':
    case 'simple_power':
    case 'haa':
    case 'xaa':
    case 'all_weather':
    case 'all_weather_us':
    case 'all_weather_kr':
    case 'market_cap_top':
      return '1d'
    default:
      return '1d'
  }
}
