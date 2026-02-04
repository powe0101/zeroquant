//! KRX API를 활용한 Fundamental 데이터 수집 모듈.
//!
//! KRX OPEN API를 통해 다음 데이터를 수집합니다:
//! - 가치 지표: PER, PBR, 배당수익률, EPS, BPS
//! - 시가총액, 상장주식수
//! - 섹터 정보 업데이트

use chrono::Utc;
use sqlx::PgPool;
use std::collections::HashMap;
use tracing::{debug, info, warn};
use uuid::Uuid;

use trader_core::CredentialEncryptor;
use trader_data::provider::krx_api::{KrxApiClient, KrxDailyTrade, KrxValuation};

use crate::{config::FundamentalCollectConfig, error::CollectorError, Result};

/// Fundamental 동기화 통계.
#[derive(Debug, Default)]
pub struct FundamentalSyncStats {
    /// 처리된 종목 수
    pub processed: usize,
    /// PER/PBR 업데이트된 종목 수
    pub valuation_updated: usize,
    /// 시가총액 업데이트된 종목 수
    pub market_cap_updated: usize,
    /// 섹터 업데이트된 종목 수
    pub sector_updated: usize,
    /// 실패 수
    pub failed: usize,
}

/// KRX fundamental 데이터 동기화.
///
/// KOSPI/KOSDAQ 종목의 가치 지표, 시가총액, 섹터 정보를 KRX API에서 수집하여
/// symbol_fundamental 및 symbol_info 테이블에 저장합니다.
pub async fn sync_krx_fundamentals(
    pool: &PgPool,
    config: &FundamentalCollectConfig,
) -> Result<FundamentalSyncStats> {
    info!("KRX Fundamental 데이터 동기화 시작");

    // KRX API 클라이언트 생성
    let master_key = match std::env::var("ENCRYPTION_MASTER_KEY") {
        Ok(key) => key,
        Err(_) => {
            warn!("ENCRYPTION_MASTER_KEY 환경변수가 설정되지 않았습니다. 동기화를 건너뜁니다.");
            return Ok(FundamentalSyncStats::default());
        }
    };

    let encryptor = CredentialEncryptor::new(&master_key)
        .map_err(|e| CollectorError::DataSource(format!("암호화키 로드 실패: {}", e)))?;

    let client = match KrxApiClient::from_credential(pool, &encryptor).await {
        Ok(Some(client)) => client,
        Ok(None) => {
            warn!("KRX API credential이 등록되지 않았습니다. 동기화를 건너뜁니다.");
            return Ok(FundamentalSyncStats::default());
        }
        Err(e) => {
            return Err(CollectorError::DataSource(format!(
                "KRX API 클라이언트 생성 실패: {}",
                e
            )))
        }
    };

    let today = Utc::now().format("%Y%m%d").to_string();
    let mut stats = FundamentalSyncStats::default();

    // 1. 가치 지표 수집 (PER, PBR, 배당수익률, EPS, BPS)
    info!("가치 지표 수집 중 (PER, PBR, 배당수익률)...");
    let valuation_stats = sync_valuation(pool, &client, &today, config).await?;
    stats.valuation_updated = valuation_stats;

    // API 호출 간 딜레이
    tokio::time::sleep(config.request_delay()).await;

    // 2. 일별 매매정보에서 시가총액, 섹터 정보 수집
    info!("시가총액 및 섹터 정보 수집 중...");
    let (market_cap_stats, sector_stats) =
        sync_market_data(pool, &client, &today, config).await?;
    stats.market_cap_updated = market_cap_stats;
    stats.sector_updated = sector_stats;

    stats.processed = stats.valuation_updated + stats.market_cap_updated;

    info!(
        processed = stats.processed,
        valuation = stats.valuation_updated,
        market_cap = stats.market_cap_updated,
        sector = stats.sector_updated,
        failed = stats.failed,
        "KRX Fundamental 데이터 동기화 완료"
    );

    Ok(stats)
}

/// 가치 지표(PER, PBR, 배당수익률, EPS, BPS) 동기화.
async fn sync_valuation(
    pool: &PgPool,
    client: &KrxApiClient,
    base_date: &str,
    _config: &FundamentalCollectConfig,
) -> Result<usize> {
    // KOSPI 가치 지표 조회
    let kospi_valuation = match client.fetch_valuation(base_date, "STK").await {
        Ok(v) => v,
        Err(e) => {
            warn!(error = %e, "KOSPI 가치 지표 조회 실패");
            Vec::new()
        }
    };

    // API 호출 간 딜레이
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // KOSDAQ 가치 지표 조회
    let kosdaq_valuation = match client.fetch_valuation(base_date, "KSQ").await {
        Ok(v) => v,
        Err(e) => {
            warn!(error = %e, "KOSDAQ 가치 지표 조회 실패");
            Vec::new()
        }
    };

    let all_valuations: Vec<KrxValuation> = kospi_valuation
        .into_iter()
        .chain(kosdaq_valuation.into_iter())
        .collect();

    info!(count = all_valuations.len(), "가치 지표 데이터 조회 완료");

    // DB에 저장
    let mut updated = 0;
    for valuation in &all_valuations {
        if let Err(e) = upsert_valuation(pool, valuation).await {
            debug!(ticker = %valuation.ticker, error = %e, "가치 지표 저장 실패");
        } else {
            updated += 1;
        }
    }

    Ok(updated)
}

/// 가치 지표를 symbol_fundamental 테이블에 저장 (Upsert).
async fn upsert_valuation(pool: &PgPool, valuation: &KrxValuation) -> Result<()> {
    // symbol_info에서 ID 조회
    let symbol_info: Option<(Uuid,)> = sqlx::query_as(
        r#"
        SELECT id
        FROM symbol_info
        WHERE ticker = $1 AND market = 'KR' AND is_active = true
        LIMIT 1
        "#,
    )
    .bind(&valuation.ticker)
    .fetch_optional(pool)
    .await
    ?;

    let symbol_info_id = match symbol_info {
        Some((id,)) => id,
        None => return Ok(()), // 심볼이 없으면 건너뜀
    };

    // symbol_fundamental에 Upsert
    sqlx::query(
        r#"
        INSERT INTO symbol_fundamental (
            symbol_info_id, per, pbr, dividend_yield, eps, bps,
            data_source, currency, fetched_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'KRX', 'KRW', NOW(), NOW())
        ON CONFLICT (symbol_info_id)
        DO UPDATE SET
            per = COALESCE(EXCLUDED.per, symbol_fundamental.per),
            pbr = COALESCE(EXCLUDED.pbr, symbol_fundamental.pbr),
            dividend_yield = COALESCE(EXCLUDED.dividend_yield, symbol_fundamental.dividend_yield),
            eps = COALESCE(EXCLUDED.eps, symbol_fundamental.eps),
            bps = COALESCE(EXCLUDED.bps, symbol_fundamental.bps),
            data_source = 'KRX',
            fetched_at = NOW(),
            updated_at = NOW()
        "#,
    )
    .bind(symbol_info_id)
    .bind(valuation.per)
    .bind(valuation.pbr)
    .bind(valuation.dividend_yield)
    .bind(valuation.eps)
    .bind(valuation.bps)
    .execute(pool)
    .await
    ?;

    Ok(())
}

/// 시가총액 및 섹터 정보 동기화.
async fn sync_market_data(
    pool: &PgPool,
    client: &KrxApiClient,
    base_date: &str,
    _config: &FundamentalCollectConfig,
) -> Result<(usize, usize)> {
    // KOSPI 일별 매매정보 조회
    let kospi_trades = match client.fetch_kospi_daily_trades(base_date).await {
        Ok(t) => t,
        Err(e) => {
            warn!(error = %e, "KOSPI 일별 매매정보 조회 실패");
            Vec::new()
        }
    };

    // API 호출 간 딜레이
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // KOSDAQ 일별 매매정보 조회
    let kosdaq_trades = match client.fetch_kosdaq_daily_trades(base_date).await {
        Ok(t) => t,
        Err(e) => {
            warn!(error = %e, "KOSDAQ 일별 매매정보 조회 실패");
            Vec::new()
        }
    };

    let all_trades: Vec<KrxDailyTrade> = kospi_trades
        .into_iter()
        .chain(kosdaq_trades.into_iter())
        .collect();

    info!(count = all_trades.len(), "일별 매매정보 조회 완료");

    // DB에 저장
    let mut market_cap_updated = 0;
    let mut sector_updated = 0;

    for trade in &all_trades {
        // 시가총액 업데이트
        if let Err(e) = upsert_market_cap(pool, trade).await {
            debug!(ticker = %trade.code, error = %e, "시가총액 저장 실패");
        } else {
            market_cap_updated += 1;
        }

        // 섹터 정보 업데이트
        if let Some(sector) = &trade.sector {
            if !sector.is_empty() {
                if let Err(e) = update_sector(pool, &trade.code, sector).await {
                    debug!(ticker = %trade.code, error = %e, "섹터 업데이트 실패");
                } else {
                    sector_updated += 1;
                }
            }
        }
    }

    Ok((market_cap_updated, sector_updated))
}

/// 시가총액 및 상장주식수를 symbol_fundamental 테이블에 저장.
async fn upsert_market_cap(pool: &PgPool, trade: &KrxDailyTrade) -> Result<()> {
    // 종목코드에서 티커 추출 (KR7005930003 → 005930)
    let ticker = extract_ticker(&trade.code);

    // symbol_info에서 ID 조회
    let symbol_info: Option<(Uuid,)> = sqlx::query_as(
        r#"
        SELECT id
        FROM symbol_info
        WHERE ticker = $1 AND market = 'KR' AND is_active = true
        LIMIT 1
        "#,
    )
    .bind(&ticker)
    .fetch_optional(pool)
    .await
    ?;

    let symbol_info_id = match symbol_info {
        Some((id,)) => id,
        None => return Ok(()), // 심볼이 없으면 건너뜀
    };

    // symbol_fundamental에 시가총액 Upsert
    sqlx::query(
        r#"
        INSERT INTO symbol_fundamental (
            symbol_info_id, market_cap, shares_outstanding,
            data_source, currency, fetched_at, updated_at
        )
        VALUES ($1, $2, $3, 'KRX', 'KRW', NOW(), NOW())
        ON CONFLICT (symbol_info_id)
        DO UPDATE SET
            market_cap = COALESCE(EXCLUDED.market_cap, symbol_fundamental.market_cap),
            shares_outstanding = COALESCE(EXCLUDED.shares_outstanding, symbol_fundamental.shares_outstanding),
            fetched_at = NOW(),
            updated_at = NOW()
        "#,
    )
    .bind(symbol_info_id)
    .bind(trade.market_cap)
    .bind(trade.shares_outstanding)
    .execute(pool)
    .await
    ?;

    Ok(())
}

/// 섹터 정보를 symbol_info 테이블에 업데이트.
async fn update_sector(pool: &PgPool, code: &str, sector: &str) -> Result<()> {
    let ticker = extract_ticker(code);

    sqlx::query(
        r#"
        UPDATE symbol_info
        SET sector = $2, updated_at = NOW()
        WHERE ticker = $1 AND market = 'KR'
        "#,
    )
    .bind(&ticker)
    .bind(sector)
    .execute(pool)
    .await
    ?;

    Ok(())
}

/// KRX 종목코드에서 티커 추출.
///
/// KR7005930003 → 005930
/// 005930 → 005930 (이미 티커인 경우 그대로 반환)
fn extract_ticker(code: &str) -> String {
    // KR7XXXXXX003 형식에서 6자리 티커 추출
    if code.len() == 12 && code.starts_with("KR") {
        code[3..9].to_string()
    } else if code.len() == 6 {
        code.to_string()
    } else {
        // 기타 형식은 그대로 반환
        code.to_string()
    }
}

/// 섹터별 통계 조회.
pub async fn get_sector_statistics(pool: &PgPool) -> Result<HashMap<String, usize>> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        r#"
        SELECT
            COALESCE(sector, '미분류') as sector,
            COUNT(*) as count
        FROM symbol_info
        WHERE market = 'KR' AND is_active = true
        GROUP BY sector
        ORDER BY count DESC
        "#,
    )
    .fetch_all(pool)
    .await
    ?;

    let stats: HashMap<String, usize> = rows
        .into_iter()
        .map(|(sector, count)| (sector, count as usize))
        .collect();

    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_ticker() {
        assert_eq!(extract_ticker("KR7005930003"), "005930");
        assert_eq!(extract_ticker("005930"), "005930");
        assert_eq!(extract_ticker("KR7000660001"), "000660");
    }
}
