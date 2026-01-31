/**
 * Format a number as Korean Won currency
 * @param value - The numeric value to format
 * @returns Formatted currency string (e.g., "₩1,234,567")
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value)
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
