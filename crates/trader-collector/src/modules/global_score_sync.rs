//! Global Score 동기화 모듈.
//!
//! 모든 활성 심볼에 대해 GlobalScore를 계산하여 symbol_global_score 테이블에 저장합니다.

use rust_decimal::prelude::*;
use rust_decimal::Decimal;
use sqlx::PgPool;
use std::time::Instant;
use tracing::{debug, info, warn};
use uuid::Uuid;

use trader_analytics::{GlobalScorer, GlobalScorerParams};
use trader_core::{MarketType, Symbol, Timeframe};
use trader_data::cache::historical::CachedHistoricalDataProvider;

use crate::config::CollectorConfig;
use crate::error::CollectorError;
use crate::stats::CollectionStats;
use crate::Result;

/// Global Score 동기화 실행.
///
/// # 동작
/// 1. 활성 심볼 목록 조회
/// 2. 각 심볼에 대해 OHLCV 데이터 조회 (60일)
/// 3. GlobalScorer로 점수 계산
/// 4. symbol_global_score 테이블에 UPSERT
///
/// # 인자
/// * `pool` - 데이터베이스 연결 풀
/// * `config` - Collector 설정
/// * `symbols` - 특정 심볼만 처리 (None이면 전체)
pub async fn sync_global_scores(
    pool: &PgPool,
    config: &CollectorConfig,
    symbols: Option<String>,
) -> Result<CollectionStats> {
    let start = Instant::now();
    let mut stats = CollectionStats::new();

    // GlobalScorer 초기화
    let scorer = GlobalScorer::new();
    let data_provider = CachedHistoricalDataProvider::new(pool.clone());

    // 대상 심볼 결정
    let target_symbols = if let Some(ref tickers) = symbols {
        let ticker_list: Vec<&str> = tickers.split(',').map(|s| s.trim()).collect();
        get_symbols_by_tickers(pool, &ticker_list).await?
    } else {
        get_all_active_symbols(pool, config.fundamental_collect.batch_size).await?
    };

    if target_symbols.is_empty() {
        info!("동기화할 심볼이 없습니다");
        stats.elapsed = start.elapsed();
        return Ok(stats);
    }

    info!("GlobalScore 동기화 시작: {} 심볼", target_symbols.len());
    stats.total = target_symbols.len();

    let delay = config.fundamental_collect.request_delay();

    for (symbol_info_id, ticker, market) in target_symbols {
        debug!(ticker = %ticker, market = %market, "GlobalScore 계산 중");

        match calculate_and_save(pool, &scorer, &data_provider, symbol_info_id, &ticker, &market)
            .await
        {
            Ok(true) => {
                stats.success += 1;
                if stats.success % 100 == 0 {
                    info!("진행률: {}/{}", stats.success, stats.total);
                }
            }
            Ok(false) => {
                // 데이터 부족으로 스킵
                stats.skipped += 1;
            }
            Err(e) => {
                warn!(ticker = %ticker, error = %e, "GlobalScore 계산 실패");
                stats.errors += 1;
            }
        }

        // Rate limiting
        tokio::time::sleep(delay).await;
    }

    stats.elapsed = start.elapsed();
    info!(
        "GlobalScore 동기화 완료: {}/{} 성공, {} 스킵, {} 오류",
        stats.success, stats.total, stats.skipped, stats.errors
    );

    Ok(stats)
}

/// 단일 심볼에 대해 GlobalScore 계산 및 저장.
async fn calculate_and_save(
    pool: &PgPool,
    scorer: &GlobalScorer,
    data_provider: &CachedHistoricalDataProvider,
    symbol_info_id: Uuid,
    ticker: &str,
    market: &str,
) -> Result<bool> {
    // 1. MarketType 변환
    let market_type = match market {
        "KR" => MarketType::Stock,
        "US" => MarketType::Stock,
        "CRYPTO" => MarketType::Crypto,
        "FOREX" => MarketType::Forex,
        "FUTURES" => MarketType::Futures,
        _ => MarketType::Stock,
    };

    let symbol = Symbol::new(ticker, "", market_type);

    // 2. OHLCV 데이터 조회 (60일)
    let candles = data_provider
        .get_klines(ticker, Timeframe::D1, 60)
        .await
        .map_err(|e| CollectorError::Other(Box::new(e)))?;

    if candles.len() < 30 {
        debug!(ticker = %ticker, count = candles.len(), "데이터 부족 (최소 30개 필요)");
        return Ok(false);
    }

    // 3. GlobalScore 계산
    let params = GlobalScorerParams {
        symbol: Some(symbol.to_string()),
        market_type: Some(market_type),
        ..Default::default()
    };

    let result = scorer
        .calculate(&candles, params)
        .map_err(|e| CollectorError::Other(Box::new(e)))?;

    // 4. DB 저장 (UPSERT)
    let mut component_scores_map = result.component_scores.clone();
    let penalties_value = component_scores_map
        .remove("penalties")
        .unwrap_or(Decimal::ZERO);

    let component_scores = serde_json::to_value(&component_scores_map)
        .map_err(|e| CollectorError::Other(Box::new(e)))?;

    let penalties = serde_json::json!({ "total": penalties_value.to_string() });

    let grade = &result.recommendation;

    let confidence_str = if result.confidence >= Decimal::new(8, 1) {
        Some("HIGH".to_string())
    } else if result.confidence >= Decimal::new(6, 1) {
        Some("MEDIUM".to_string())
    } else {
        Some("LOW".to_string())
    };

    sqlx::query(r#"SELECT upsert_global_score($1, $2, $3, $4, $5, $6, $7, $8)"#)
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
        .map_err(CollectorError::Database)?;

    debug!(
        ticker = %ticker,
        score = %result.overall_score,
        grade = %grade,
        "GlobalScore 저장 완료"
    );

    Ok(true)
}

/// 특정 티커로 심볼 조회.
async fn get_symbols_by_tickers(
    pool: &PgPool,
    tickers: &[&str],
) -> Result<Vec<(Uuid, String, String)>> {
    let results = sqlx::query_as::<_, (Uuid, String, String)>(
        r#"
        SELECT id, ticker, market
        FROM symbol_info
        WHERE ticker = ANY($1)
          AND is_active = true
        "#,
    )
    .bind(tickers)
    .fetch_all(pool)
    .await
    .map_err(CollectorError::Database)?;

    Ok(results)
}

/// 전체 활성 심볼 조회.
async fn get_all_active_symbols(
    pool: &PgPool,
    limit: i64,
) -> Result<Vec<(Uuid, String, String)>> {
    let results = sqlx::query_as::<_, (Uuid, String, String)>(
        r#"
        SELECT id, ticker, market
        FROM symbol_info
        WHERE is_active = true
          AND market != 'CRYPTO'
        ORDER BY ticker
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(CollectorError::Database)?;

    Ok(results)
}
