//! OHLCV 데이터 수집 모듈.
//!
//! OHLCV 데이터 수집과 동시에 분석 지표(RouteState, MarketRegime, TTM Squeeze, GlobalScore)를
//! 계산하여 symbol_fundamental 및 symbol_global_score 테이블에 저장합니다.
//!
//! # 데이터 소스 이원화
//!
//! - **국내 (KR)**: KRX API 우선 사용, 실패 시 Yahoo Finance fallback
//! - **해외 (US, JP 등)**: Yahoo Finance 사용

use crate::{CollectionStats, CollectorConfig, Result};
use chrono::{NaiveDate, Utc};
use rust_decimal::Decimal;
use serde_json;
use sqlx::PgPool;
use std::collections::HashSet;
use std::time::Instant;
use trader_analytics::{
    indicators::IndicatorEngine,
    GlobalScorer, GlobalScorerParams, MarketRegimeCalculator, RouteStateCalculator,
};
use trader_core::{CredentialEncryptor, Kline, Symbol, Timeframe};
use trader_data::cache::historical::CachedHistoricalDataProvider;
use trader_data::provider::krx_api::KrxApiClient;
use uuid::Uuid;

use super::utils::{calculate_ttm_squeeze, market_to_market_type, to_screaming_snake_case};

/// OHLCV 데이터 수집 및 지표 동시 업데이트
///
/// OHLCV 데이터를 수집하고, 성공한 심볼에 대해 즉시 분석 지표를 계산합니다.
/// - RouteState (매매 단계)
/// - MarketRegime (시장 레짐)
/// - TTM Squeeze (에너지 응축)
///
/// # Arguments
///
/// * `pool` - DB 연결 풀
/// * `config` - 수집 설정
/// * `symbols` - 특정 심볼 지정 (쉼표 구분), None이면 전체
/// * `stale_hours` - 이 시간보다 오래된 심볼만 수집 (증분 수집), None이면 전체
pub async fn collect_ohlcv(
    pool: &PgPool,
    config: &CollectorConfig,
    symbols: Option<String>,
    stale_hours: Option<u32>,
) -> Result<CollectionStats> {
    let start = Instant::now();
    let mut stats = CollectionStats::new();

    tracing::info!("OHLCV 수집 및 지표 업데이트 시작");

    // 지표 계산기 초기화
    let route_state_calc = RouteStateCalculator::new();
    let market_regime_calc = MarketRegimeCalculator::new();
    let indicator_engine = IndicatorEngine::new();
    let global_scorer = GlobalScorer::new();

    // 수집할 심볼 목록 결정 (symbol_info_id, ticker, market 포함)
    let target_symbols = match symbols {
        Some(ref s) => {
            // 쉼표로 구분된 심볼 파싱
            let tickers: Vec<&str> = s.split(',').map(|s| s.trim()).collect();
            let rows: Vec<(Uuid, String, String)> = sqlx::query_as(
                "SELECT id, ticker, market FROM symbol_info
                 WHERE ticker = ANY($1)
                   AND is_active = true",
            )
            .bind(&tickers)
            .fetch_all(pool)
            .await?;
            tracing::info!(count = rows.len(), "특정 심볼 수집");
            rows
        }
        None => {
            // DB에서 활성화된 심볼 조회 (STOCK, ETF만)
            // target_markets가 설정된 경우 해당 시장만, 아니면 전체 시장
            // stale_hours가 지정되면 해당 시간 이전에 업데이트된 심볼만 선택 (증분 수집)
            let target_markets = &config.ohlcv_collect.target_markets;
            let market_filter = if target_markets.is_empty() {
                None
            } else {
                Some(target_markets.clone())
            };

            // 증분 수집: OHLCV 테이블의 최신 데이터 기준
            // stale_threshold 이후 1d OHLCV가 없는 심볼만 선택
            let rows: Vec<(Uuid, String, String)> = if let Some(hours) = stale_hours {
                let stale_threshold = Utc::now() - chrono::Duration::hours(hours as i64);
                if let Some(ref markets) = market_filter {
                    sqlx::query_as(
                        r#"
                        SELECT si.id, si.ticker, si.market
                        FROM symbol_info si
                        WHERE si.is_active = true
                          AND si.symbol_type IN ('STOCK', 'ETF')
                          AND si.market = ANY($1)
                          AND NOT EXISTS (
                              SELECT 1 FROM ohlcv o
                              WHERE o.symbol = si.ticker
                                AND o.timeframe = '1d'
                                AND o.open_time >= $2
                          )
                        ORDER BY
                          CASE si.market WHEN 'KR' THEN 1 WHEN 'US' THEN 2 ELSE 3 END,
                          si.ticker
                        "#,
                    )
                    .bind(markets)
                    .bind(stale_threshold)
                    .fetch_all(pool)
                    .await?
                } else {
                    sqlx::query_as(
                        r#"
                        SELECT si.id, si.ticker, si.market
                        FROM symbol_info si
                        WHERE si.is_active = true
                          AND si.symbol_type IN ('STOCK', 'ETF')
                          AND NOT EXISTS (
                              SELECT 1 FROM ohlcv o
                              WHERE o.symbol = si.ticker
                                AND o.timeframe = '1d'
                                AND o.open_time >= $1
                          )
                        ORDER BY si.market, si.ticker
                        "#,
                    )
                    .bind(stale_threshold)
                    .fetch_all(pool)
                    .await?
                }
            } else if let Some(ref markets) = market_filter {
                sqlx::query_as(
                    r#"
                    SELECT id, ticker, market FROM symbol_info
                    WHERE is_active = true
                      AND symbol_type IN ('STOCK', 'ETF')
                      AND market = ANY($1)
                    ORDER BY
                      CASE market WHEN 'KR' THEN 1 WHEN 'US' THEN 2 ELSE 3 END,
                      ticker
                    "#,
                )
                .bind(markets)
                .fetch_all(pool)
                .await?
            } else {
                sqlx::query_as(
                    r#"
                    SELECT id, ticker, market FROM symbol_info
                    WHERE is_active = true
                      AND symbol_type IN ('STOCK', 'ETF')
                    ORDER BY market, ticker
                    "#,
                )
                .fetch_all(pool)
                .await?
            };

            let market_desc = if target_markets.is_empty() {
                "전체 시장".to_string()
            } else {
                target_markets.join(", ")
            };

            if stale_hours.is_some() {
                tracing::info!(
                    count = rows.len(),
                    stale_hours = stale_hours,
                    markets = %market_desc,
                    "증분 수집: 업데이트 필요한 심볼 조회 완료"
                );
            } else {
                tracing::info!(count = rows.len(), markets = %market_desc, "활성 심볼 조회 완료 (STOCK/ETF)");
            }
            rows
        }
    };

    if target_symbols.is_empty() {
        tracing::warn!("수집할 심볼이 없습니다");
        stats.elapsed = start.elapsed();
        return Ok(stats);
    }

    // 수집할 타임프레임 목록
    let timeframes = if config.ohlcv_collect.timeframes.is_empty() {
        vec!["1d".to_string()]
    } else {
        config.ohlcv_collect.timeframes.clone()
    };

    // 기본 타임프레임 (D1) 기준 날짜 범위 계산
    let primary_timeframe = timeframes.first().map(|s| s.as_str()).unwrap_or("1d");
    let (start_date, end_date) = determine_date_range(config, primary_timeframe);

    tracing::info!(
        timeframes = ?timeframes,
        start = %start_date,
        end = %end_date,
        "타임프레임별 수집 설정"
    );

    // 시장별 심볼 분류
    let kr_symbols: Vec<_> = target_symbols
        .iter()
        .filter(|(_, _, m)| m == "KR")
        .collect();
    let foreign_symbols: Vec<_> = target_symbols
        .iter()
        .filter(|(_, _, m)| m != "KR")
        .collect();

    tracing::info!(
        total = target_symbols.len(),
        kr = kr_symbols.len(),
        foreign = foreign_symbols.len(),
        start_date = ?start_date,
        end_date = ?end_date,
        "수집 범위 설정 완료 (시장별 분류)"
    );

    // 데이터 제공자 초기화
    // Yahoo Finance (해외 + KR fallback)
    let yahoo_provider = CachedHistoricalDataProvider::new(pool.clone());

    // KRX API 클라이언트 (국내 전용) - 설정에서 활성화된 경우에만
    let krx_client = if config.providers.krx_api_enabled {
        init_krx_client(pool).await
    } else {
        tracing::info!("KRX API 비활성화됨 (PROVIDER_KRX_API_ENABLED=false)");
        None
    };

    // =========================================================================
    // KRX API 일괄 수집 (국내 전 종목)
    // =========================================================================
    // KRX API가 활성화된 경우, 먼저 전 종목 일괄 수집 후 개별 fallback
    let mut kr_collected_tickers: HashSet<String> = HashSet::new();

    if let Some(ref client) = krx_client {
        // KRX API는 T+1 데이터 제공 (당일 데이터 없음)
        // 따라서 전일 날짜로 조회해야 데이터가 존재함
        let krx_query_date = end_date - chrono::Duration::days(1);
        let base_date = krx_query_date.format("%Y%m%d").to_string();
        tracing::info!(
            base_date = %base_date,
            original_end_date = %end_date,
            kr_symbols = kr_symbols.len(),
            "KRX API 일괄 수집 시작 (KOSPI + KOSDAQ, T-1 날짜 사용)"
        );

        match client.fetch_all_daily_trades(&base_date).await {
            Ok(daily_trades) => {
                tracing::info!(
                    count = daily_trades.len(),
                    "KRX API 일괄 조회 완료 - DB 저장 시작"
                );

                // 종목코드 → symbol_info_id 매핑 생성
                let kr_ticker_map: std::collections::HashMap<String, Uuid> = kr_symbols
                    .iter()
                    .map(|(id, ticker, _)| (ticker.clone(), *id))
                    .collect();

                let mut saved_count = 0;
                for trade in &daily_trades {
                    // 6자리 단축코드 추출 (표준코드에서)
                    let short_code = if trade.code.len() >= 6 {
                        trade.code.chars().take(6).collect::<String>()
                    } else {
                        trade.code.clone()
                    };

                    // symbol_info에 등록된 종목만 처리
                    if let Some(&symbol_info_id) = kr_ticker_map.get(&short_code) {
                        // OHLCV 데이터 저장
                        if let (Some(open), Some(high), Some(low)) = (trade.open, trade.high, trade.low) {
                            let save_result = save_krx_ohlcv(
                                pool,
                                &short_code,
                                symbol_info_id,
                                trade.date,
                                open,
                                high,
                                low,
                                trade.close,
                                trade.volume,
                                trade.trading_value,
                            ).await;

                            if save_result.is_ok() {
                                kr_collected_tickers.insert(short_code.clone());
                                saved_count += 1;
                                stats.total_klines += 1;
                            }
                        }

                        // 시가총액, 상장주식수 업데이트
                        if trade.market_cap.is_some() || trade.shares_outstanding.is_some() {
                            let _ = update_market_info(
                                pool,
                                symbol_info_id,
                                trade.market_cap,
                                trade.shares_outstanding,
                            ).await;
                        }
                    }
                }

                tracing::info!(
                    saved = saved_count,
                    unique_tickers = kr_collected_tickers.len(),
                    "KRX API 일괄 수집 완료"
                );
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "KRX API 일괄 수집 실패 - 개별 수집으로 fallback"
                );
            }
        }
    }

    // 진행률 출력 설정
    let total_count = target_symbols.len();
    let _progress_interval = std::cmp::max(1, total_count / 20); // 5%마다 출력

    tracing::info!(
        total = total_count,
        "OHLCV 수집 시작 - 총 {}개 심볼", total_count
    );

    // 심볼별 수집 (KRX API로 이미 수집된 종목은 fallback 대상에서 제외)
    let fallback_symbols: Vec<_> = target_symbols
        .iter()
        .filter(|(_, ticker, market)| {
            // KR 종목 중 이미 KRX API로 수집된 종목은 스킵
            if market == "KR" && kr_collected_tickers.contains(ticker) {
                false
            } else {
                true
            }
        })
        .collect();

    let fallback_count = fallback_symbols.len();
    if !kr_collected_tickers.is_empty() {
        tracing::info!(
            kr_collected = kr_collected_tickers.len(),
            fallback_needed = fallback_count,
            "KRX 일괄 수집 완료 - 나머지 종목 개별 수집"
        );
    }

    for (idx, (symbol_info_id, ticker, market)) in fallback_symbols.iter().enumerate() {
        stats.total += 1;
        let current = idx + 1;
        let percent = (current * 100) / fallback_count.max(1);
        let remaining = fallback_count - current;

        // 진행률 출력 (매 5%마다 또는 마지막)
        let progress_interval = std::cmp::max(1, fallback_count / 20);
        if idx % progress_interval == 0 || current == fallback_count {
            tracing::info!(
                "[{}/{}] ({}%) 남은 수: {} - 현재: {} ({})",
                current, fallback_count, percent, remaining, ticker, market
            );
        }

        // 증분 수집: 기존 데이터 범위 확인
        let (existing_start, existing_end) = get_existing_date_range(pool, ticker, "1d").await;

        // 누락 구간 계산
        let (past_range, future_range) = calculate_missing_ranges(
            start_date,
            end_date,
            existing_start,
            existing_end,
        );

        // 누락 구간이 없으면 스킵
        if past_range.is_none() && future_range.is_none() {
            tracing::debug!(
                ticker = ticker,
                existing = ?existing_start.map(|d| d.to_string()),
                "이미 수집된 데이터 - 스킵"
            );
            stats.success += 1;
            continue;
        }

        // 수집할 구간 결정 (과거 방향 우선)
        let (fetch_start, fetch_end) = if let Some((ps, pe)) = past_range {
            tracing::info!(
                ticker = ticker,
                range = format!("{} ~ {}", ps, pe),
                "과거 방향 증분 수집"
            );
            (ps, pe)
        } else if let Some((fs, fe)) = future_range {
            tracing::debug!(
                ticker = ticker,
                range = format!("{} ~ {}", fs, fe),
                "최신 방향 증분 수집"
            );
            (fs, fe)
        } else {
            continue;
        };

        // 시장에 따라 데이터 소스 선택
        // - KR: KRX API 우선, 실패 시 Yahoo fallback
        // - 해외 (US, JP 등): Yahoo Finance
        let klines_result = if market == "KR" {
            // 국내: KRX API 시도 후 Yahoo fallback
            fetch_kr_klines(&krx_client, &yahoo_provider, ticker, fetch_start, fetch_end).await
        } else {
            // 해외: Yahoo Finance
            yahoo_provider
                .get_klines_range(ticker, Timeframe::D1, fetch_start, fetch_end)
                .await
                .map_err(|e| e.to_string())
        };

        // OHLCV 데이터 처리
        match klines_result {
            Ok(klines) if !klines.is_empty() => {
                stats.success += 1;
                stats.total_klines += klines.len();

                // 지표 계산 및 업데이트 (충분한 데이터가 있을 때만)
                if klines.len() >= 40 {
                    update_indicators_for_symbol(
                        pool,
                        *symbol_info_id,
                        ticker,
                        market,
                        &klines,
                        &route_state_calc,
                        &market_regime_calc,
                        &indicator_engine,
                        &global_scorer,
                    )
                    .await;
                }

                tracing::info!(
                    ticker = ticker,
                    klines = klines.len(),
                    "수집 및 지표 업데이트 완료"
                );
            }
            Ok(_) => {
                // 데이터 없음
                stats.empty += 1;
                tracing::debug!(ticker = ticker, "데이터 없음");
            }
            Err(e) => {
                let error_str = e.to_string();

                // 상장폐지/데이터 없음 에러 감지 및 자동 비활성화
                if error_str.contains("may be delisted")
                    || error_str.contains("No data found")
                    || error_str.contains("empty data set")
                {
                    stats.errors += 1;
                    tracing::warn!(ticker = ticker, "상장폐지 감지 - 자동 비활성화");

                    // is_active = false로 업데이트
                    if let Err(update_err) = sqlx::query(
                        "UPDATE symbol_info SET is_active = false, updated_at = NOW() WHERE id = $1"
                    )
                    .bind(symbol_info_id)
                    .execute(pool)
                    .await
                    {
                        tracing::error!(
                            ticker = ticker,
                            error = %update_err,
                            "상장폐지 심볼 비활성화 실패"
                        );
                    }
                } else {
                    stats.errors += 1;
                    tracing::error!(
                        ticker = ticker,
                        error = %e,
                        "조회 실패"
                    );
                }
            }
        }

        // Rate limiting
        tokio::time::sleep(config.ohlcv_collect.request_delay()).await;
    }

    stats.elapsed = start.elapsed();
    Ok(stats)
}

/// 개별 심볼의 지표 계산 및 DB 업데이트 (RouteState, MarketRegime, TTM Squeeze, GlobalScore)
#[allow(clippy::too_many_arguments)]
async fn update_indicators_for_symbol(
    pool: &PgPool,
    symbol_info_id: Uuid,
    ticker: &str,
    market: &str,
    candles: &[Kline],
    route_state_calc: &RouteStateCalculator,
    market_regime_calc: &MarketRegimeCalculator,
    indicator_engine: &IndicatorEngine,
    global_scorer: &GlobalScorer,
) {
    // RouteState 계산
    let route_state = match route_state_calc.calculate(candles) {
        Ok(state) => Some(format!("{:?}", state).to_uppercase()),
        Err(e) => {
            tracing::debug!(ticker = ticker, error = %e, "RouteState 계산 실패");
            None
        }
    };

    // MarketRegime 계산 (70개 이상 필요)
    let regime = if candles.len() >= 70 {
        match market_regime_calc.calculate(candles) {
            Ok(result) => {
                let regime_str = format!("{:?}", result.regime);
                Some(to_screaming_snake_case(&regime_str))
            }
            Err(e) => {
                tracing::debug!(ticker = ticker, error = %e, "MarketRegime 계산 실패");
                None
            }
        }
    } else {
        None
    };

    // TTM Squeeze 계산 (20개 이상 필요)
    let (ttm_squeeze, ttm_squeeze_cnt) = if candles.len() >= 20 {
        calculate_ttm_squeeze(indicator_engine, candles)
    } else {
        (None, None)
    };

    // symbol_fundamental DB 업데이트
    if let Err(e) = sqlx::query(
        r#"
        INSERT INTO symbol_fundamental (symbol_info_id, route_state, regime, ttm_squeeze, ttm_squeeze_cnt, fetched_at)
        VALUES ($1, $2::route_state, $3, $4, $5, NOW())
        ON CONFLICT (symbol_info_id) DO UPDATE SET
            route_state = COALESCE(EXCLUDED.route_state, symbol_fundamental.route_state),
            regime = COALESCE(EXCLUDED.regime, symbol_fundamental.regime),
            ttm_squeeze = COALESCE(EXCLUDED.ttm_squeeze, symbol_fundamental.ttm_squeeze),
            ttm_squeeze_cnt = COALESCE(EXCLUDED.ttm_squeeze_cnt, symbol_fundamental.ttm_squeeze_cnt),
            updated_at = NOW()
        "#,
    )
    .bind(symbol_info_id)
    .bind(route_state.as_deref())
    .bind(regime.as_deref())
    .bind(ttm_squeeze)
    .bind(ttm_squeeze_cnt)
    .execute(pool)
    .await
    {
        tracing::warn!(ticker = ticker, error = %e, "지표 DB 업데이트 실패");
    }

    // GlobalScore 계산 (30개 이상 필요)
    if candles.len() >= 30 {
        update_global_score(pool, symbol_info_id, ticker, market, candles, global_scorer).await;
    }
}

/// GlobalScore 계산 및 DB 업데이트
async fn update_global_score(
    pool: &PgPool,
    symbol_info_id: Uuid,
    ticker: &str,
    market: &str,
    candles: &[Kline],
    global_scorer: &GlobalScorer,
) {
    // MarketType 변환 (utils.rs 사용)
    let market_type = market_to_market_type(market);

    let symbol = Symbol::new(ticker, "", market_type);

    let params = GlobalScorerParams {
        symbol: Some(symbol.to_string()),
        market_type: Some(market_type),
        ..Default::default()
    };

    // GlobalScore 계산
    let result = match global_scorer.calculate(candles, params) {
        Ok(r) => r,
        Err(e) => {
            tracing::debug!(ticker = ticker, error = %e, "GlobalScore 계산 실패");
            return;
        }
    };

    // component_scores에서 penalties 분리
    let mut component_scores_map = result.component_scores.clone();
    let penalties_value = component_scores_map
        .remove("penalties")
        .unwrap_or(Decimal::ZERO);

    let component_scores = match serde_json::to_value(&component_scores_map) {
        Ok(v) => v,
        Err(e) => {
            tracing::debug!(ticker = ticker, error = %e, "JSON 변환 실패");
            return;
        }
    };

    let penalties = serde_json::json!({ "total": penalties_value.to_string() });

    let grade = &result.recommendation;

    let confidence_str = if result.confidence >= Decimal::new(8, 1) {
        Some("HIGH".to_string())
    } else if result.confidence >= Decimal::new(6, 1) {
        Some("MEDIUM".to_string())
    } else {
        Some("LOW".to_string())
    };

    // DB 저장 (UPSERT)
    if let Err(e) = sqlx::query(r#"SELECT upsert_global_score($1, $2, $3, $4, $5, $6, $7, $8)"#)
        .bind(symbol_info_id)
        .bind(result.overall_score)
        .bind(grade)
        .bind(confidence_str)
        .bind(component_scores)
        .bind(penalties)
        .bind(market)
        .bind(ticker)
        .execute(pool)
        .await
    {
        tracing::debug!(ticker = ticker, error = %e, "GlobalScore DB 업데이트 실패");
    }
}

// to_screaming_snake_case, calculate_ttm_squeeze는 utils.rs로 이동됨

/// 타임프레임별 기본 수집 기간 (일 단위)
fn get_default_retention_days(timeframe: &str) -> i64 {
    match timeframe.to_lowercase().as_str() {
        "1m" | "m1" => 7,       // 1분봉: 7일
        "5m" | "m5" => 14,      // 5분봉: 14일
        "15m" | "m15" => 30,    // 15분봉: 30일
        "1h" | "h1" => 90,      // 1시간봉: 90일
        "4h" | "h4" => 180,     // 4시간봉: 180일
        "1d" | "d1" => 365 * 3, // 일봉: 3년
        "1w" | "w1" => 365 * 5, // 주봉: 5년
        _ => 365,               // 기본: 1년
    }
}

/// 날짜 범위 결정 (타임프레임 기반)
fn determine_date_range(config: &CollectorConfig, timeframe: &str) -> (NaiveDate, NaiveDate) {
    let end_date = match &config.ohlcv_collect.end_date {
        Some(date) => NaiveDate::parse_from_str(date, "%Y%m%d")
            .unwrap_or_else(|_| Utc::now().date_naive()),
        None => Utc::now().date_naive(),
    };

    let start_date = match &config.ohlcv_collect.start_date {
        Some(date) => NaiveDate::parse_from_str(date, "%Y%m%d")
            .unwrap_or_else(|_| end_date - chrono::Duration::days(get_default_retention_days(timeframe))),
        None => {
            // 타임프레임별 기본 수집 기간 적용
            let retention_days = get_default_retention_days(timeframe);
            // 최대 보존 기간 제한 (config에서 설정)
            let max_days = config.ohlcv_collect.max_retention_years as i64 * 365;
            let actual_days = retention_days.min(max_days);
            end_date - chrono::Duration::days(actual_days)
        }
    };

    (start_date, end_date)
}

// ============================================================================
// 데이터 소스 이원화 헬퍼 함수
// ============================================================================

/// KRX API 클라이언트 초기화 (credential 시스템 사용).
///
/// credential이 없으면 None 반환 (Yahoo fallback 사용).
async fn init_krx_client(pool: &PgPool) -> Option<KrxApiClient> {
    let master_key = match std::env::var("ENCRYPTION_MASTER_KEY") {
        Ok(key) => key,
        Err(_) => {
            tracing::debug!("ENCRYPTION_MASTER_KEY 없음 - KRX API 비활성화");
            return None;
        }
    };

    let encryptor = match CredentialEncryptor::new(&master_key) {
        Ok(e) => e,
        Err(e) => {
            tracing::debug!(error = %e, "암호화키 초기화 실패 - KRX API 비활성화");
            return None;
        }
    };

    match KrxApiClient::from_credential(pool, &encryptor).await {
        Ok(Some(client)) => {
            tracing::info!("KRX API 클라이언트 초기화 성공 (국내 데이터 이원화 활성화)");
            Some(client)
        }
        Ok(None) => {
            tracing::debug!("KRX credential 미등록 - Yahoo fallback 사용");
            None
        }
        Err(e) => {
            tracing::warn!(error = %e, "KRX API 클라이언트 초기화 실패 - Yahoo fallback 사용");
            None
        }
    }
}

/// 국내(KR) 시장 OHLCV 데이터 수집.
///
/// KRX API를 먼저 시도하고, 실패하거나 데이터가 없으면 Yahoo Finance로 fallback.
async fn fetch_kr_klines(
    krx_client: &Option<KrxApiClient>,
    yahoo_provider: &CachedHistoricalDataProvider,
    ticker: &str,
    start_date: NaiveDate,
    end_date: NaiveDate,
) -> std::result::Result<Vec<Kline>, String> {
    // KRX API가 활성화된 경우 먼저 시도
    if let Some(client) = krx_client {
        let start_str = start_date.format("%Y%m%d").to_string();
        let end_str = end_date.format("%Y%m%d").to_string();

        match client.fetch_daily_ohlcv(ticker, &start_str, &end_str).await {
            Ok(krx_data) if !krx_data.is_empty() => {
                // KRX 데이터를 Kline으로 변환
                let klines: Vec<Kline> = krx_data
                    .into_iter()
                    .map(|k| Kline {
                        ticker: ticker.to_string(),
                        timeframe: Timeframe::D1,
                        open_time: k.date.and_hms_opt(0, 0, 0).unwrap().and_utc(),
                        open: k.open,
                        high: k.high,
                        low: k.low,
                        close: k.close,
                        volume: Decimal::from(k.volume),
                        close_time: k.date.and_hms_opt(23, 59, 59).unwrap().and_utc(),
                        quote_volume: k.trading_value,
                        num_trades: None,
                    })
                    .collect();

                tracing::debug!(
                    ticker = ticker,
                    source = "KRX",
                    count = klines.len(),
                    "국내 데이터 수집 성공"
                );
                return Ok(klines);
            }
            Ok(_) => {
                tracing::debug!(ticker = ticker, "KRX API 데이터 없음 - Yahoo fallback");
            }
            Err(e) => {
                tracing::debug!(
                    ticker = ticker,
                    error = %e,
                    "KRX API 실패 - Yahoo fallback"
                );
            }
        }
    }

    // Yahoo Finance fallback
    yahoo_provider
        .get_klines_range(ticker, Timeframe::D1, start_date, end_date)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// 증분 수집 헬퍼 함수
// ============================================================================

/// 심볼별 기존 OHLCV 데이터 범위 조회
///
/// ohlcv 테이블에서 해당 심볼의 가장 오래된/최신 캔들 날짜를 반환합니다.
/// 데이터가 없으면 (None, None)을 반환합니다.
async fn get_existing_date_range(
    pool: &PgPool,
    ticker: &str,
    timeframe: &str,
) -> (Option<NaiveDate>, Option<NaiveDate>) {
    let result: Option<(Option<chrono::DateTime<Utc>>, Option<chrono::DateTime<Utc>>)> = sqlx::query_as(
        r#"
        SELECT MIN(open_time), MAX(open_time)
        FROM ohlcv
        WHERE symbol = $1 AND timeframe = $2
        "#,
    )
    .bind(ticker)
    .bind(timeframe)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match result {
        Some((Some(min), Some(max))) => (Some(min.date_naive()), Some(max.date_naive())),
        _ => (None, None),
    }
}

/// 증분 수집 구간 계산
///
/// 요청 범위와 기존 데이터 범위를 비교하여 수집해야 할 구간을 반환합니다.
///
/// # 반환
/// - `past_range`: 과거 방향 누락 구간 (요청 시작일 ~ 기존 데이터 시작일 - 1일)
/// - `future_range`: 최신 방향 누락 구간 (기존 데이터 종료일 + 1일 ~ 요청 종료일)
/// - `gaps`: 중간 갭 (현재 미구현)
fn calculate_missing_ranges(
    requested_start: NaiveDate,
    requested_end: NaiveDate,
    existing_start: Option<NaiveDate>,
    existing_end: Option<NaiveDate>,
) -> (Option<(NaiveDate, NaiveDate)>, Option<(NaiveDate, NaiveDate)>) {
    match (existing_start, existing_end) {
        (None, None) => {
            // 데이터 없음 - 전체 구간 수집 필요
            (Some((requested_start, requested_end)), None)
        }
        (Some(ex_start), Some(ex_end)) => {
            let mut past_range = None;
            let mut future_range = None;

            // 1. 과거 방향 누락 (요청 시작일 < 기존 시작일)
            if requested_start < ex_start {
                past_range = Some((requested_start, ex_start - chrono::Duration::days(1)));
            }

            // 2. 최신 방향 누락 (요청 종료일 > 기존 종료일)
            if requested_end > ex_end {
                future_range = Some((ex_end + chrono::Duration::days(1), requested_end));
            }

            (past_range, future_range)
        }
        _ => (Some((requested_start, requested_end)), None),
    }
}


// ============================================================================
// KRX API 일괄 수집 헬퍼 함수
// ============================================================================

/// KRX API에서 수집한 OHLCV 데이터를 DB에 저장.
#[allow(clippy::too_many_arguments)]
async fn save_krx_ohlcv(
    pool: &PgPool,
    ticker: &str,
    symbol_info_id: Uuid,
    date: NaiveDate,
    open: Decimal,
    high: Decimal,
    low: Decimal,
    close: Decimal,
    volume: i64,
    _trading_value: Option<Decimal>,
) -> std::result::Result<(), sqlx::Error> {
    let open_time = date.and_hms_opt(0, 0, 0)
        .map(|dt| chrono::DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc))
        .unwrap_or_else(Utc::now);

    sqlx::query(
        r#"
        INSERT INTO ohlcv (symbol, symbol_info_id, timeframe, open_time, open, high, low, close, volume)
        VALUES ($1, $2, '1d', $3, $4, $5, $6, $7, $8)
        ON CONFLICT (symbol, timeframe, open_time) DO UPDATE SET
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume,
            updated_at = NOW()
        "#,
    )
    .bind(ticker)
    .bind(symbol_info_id)
    .bind(open_time)
    .bind(open)
    .bind(high)
    .bind(low)
    .bind(close)
    .bind(volume)
    .execute(pool)
    .await?;

    Ok(())
}

/// KRX API에서 수집한 시가총액, 상장주식수 업데이트.
async fn update_market_info(
    pool: &PgPool,
    symbol_info_id: Uuid,
    market_cap: Option<Decimal>,
    shares_outstanding: Option<i64>,
) -> std::result::Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO symbol_fundamental (symbol_info_id, market_cap, shares_outstanding, fetched_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (symbol_info_id) DO UPDATE SET
            market_cap = COALESCE(EXCLUDED.market_cap, symbol_fundamental.market_cap),
            shares_outstanding = COALESCE(EXCLUDED.shares_outstanding, symbol_fundamental.shares_outstanding),
            updated_at = NOW()
        "#,
    )
    .bind(symbol_info_id)
    .bind(market_cap)
    .bind(shares_outstanding)
    .execute(pool)
    .await?;

    Ok(())
}
