//! 전략 등록 매크로
//!
//! `register_strategy!` 매크로를 사용하여 전략을 레지스트리에 자동 등록합니다.

/// 전략 등록 매크로
///
/// 전략 메타데이터를 선언적으로 정의하고 inventory에 자동 등록합니다.
///
/// # 필수 필드
/// - `id`: 전략 고유 ID (snake_case, 예: "rsi_mean_reversion")
/// - `name`: 한글 이름 (예: "RSI 평균회귀")
/// - `description`: 전략 설명
/// - `timeframe`: 기본 타임프레임 ("1m", "15m", "1h", "1d" 등)
/// - `category`: 전략 카테고리 (Realtime, Intraday, Daily, Monthly)
/// - `type`: 전략 구조체 타입
///
/// # 선택 필드
/// - `aliases`: 별칭 배열 (기본값: 빈 배열)
/// - `tickers`: 기본 심볼 배열 (기본값: 빈 배열 = 사용자 지정)
/// - `markets`: 지원 시장 배열 (기본값: [Crypto, Kr, Us])
/// - `secondary_timeframes`: 보조 타임프레임 (다중 TF 전략용, 기본값: 빈 배열)
///
/// # 예시 (단일 타임프레임 전략)
/// ```ignore
/// register_strategy! {
///     id: "rsi_mean_reversion",
///     aliases: ["rsi"],
///     name: "RSI 평균회귀",
///     description: "RSI 과매수/과매도 구간에서 평균회귀 매매",
///     timeframe: "15m",
///     tickers: [],
///     category: Intraday,
///     markets: [Crypto, Kr, Us],
///     type: RsiStrategy
/// }
/// ```
///
/// # 예시 (다중 타임프레임 전략)
/// ```ignore
/// register_strategy! {
///     id: "rsi_multi_tf",
///     aliases: ["rsi_mtf"],
///     name: "RSI 다중 타임프레임",
///     description: "일봉/1시간/5분 RSI 조합 전략",
///     timeframe: "5m",
///     secondary_timeframes: ["1h", "1d"],  // 보조 타임프레임 추가
///     tickers: [],
///     category: Intraday,
///     markets: [Crypto, Kr, Us],
///     type: RsiMultiTimeframeStrategy
/// }
/// ```
///
/// # 동작 방식
/// - 컴파일 타임에 StrategyMeta를 생성하여 inventory에 등록
/// - StrategyRegistry::find()로 조회 가능
/// - 별칭을 통한 다중 접근 지원 (하위 호환성)
#[macro_export]
macro_rules! register_strategy {
    // 패턴 1: 다중 타임프레임 전략 (secondary_timeframes 포함)
    (
        id: $id:expr,
        aliases: [$($alias:expr),* $(,)?],
        name: $name:expr,
        description: $desc:expr,
        timeframe: $tf:expr,
        secondary_timeframes: [$($sec_tf:expr),* $(,)?],
        tickers: [$($ticker:expr),* $(,)?],
        category: $cat:ident,
        markets: [$($market:ident),* $(,)?],
        type: $ty:ty
    ) => {
        inventory::submit! {
            $crate::registry::StrategyMeta {
                id: $id,
                aliases: &[$($alias),*],
                name: $name,
                description: $desc,
                default_timeframe: $tf,
                secondary_timeframes: &[$($sec_tf),*],
                default_tickers: &[$($ticker),*],
                category: $crate::registry::StrategyCategory::$cat,
                supported_markets: &[$(trader_core::MarketType::$market),*],
                factory: || Box::new(<$ty>::new()),
            }
        }
    };

    // 패턴 2: 단일 타임프레임 전략 (기존 호환, secondary_timeframes 없음)
    (
        id: $id:expr,
        aliases: [$($alias:expr),* $(,)?],
        name: $name:expr,
        description: $desc:expr,
        timeframe: $tf:expr,
        tickers: [$($ticker:expr),* $(,)?],
        category: $cat:ident,
        markets: [$($market:ident),* $(,)?],
        type: $ty:ty
    ) => {
        inventory::submit! {
            $crate::registry::StrategyMeta {
                id: $id,
                aliases: &[$($alias),*],
                name: $name,
                description: $desc,
                default_timeframe: $tf,
                secondary_timeframes: &[],  // 기본값: 빈 배열 (단일 TF)
                default_tickers: &[$($ticker),*],
                category: $crate::registry::StrategyCategory::$cat,
                supported_markets: &[$(trader_core::MarketType::$market),*],
                factory: || Box::new(<$ty>::new()),
            }
        }
    };
}

#[cfg(test)]
mod tests {
    // 매크로 확장 테스트는 실제 전략에서 수행
}
