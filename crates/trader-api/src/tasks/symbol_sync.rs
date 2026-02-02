//! 심볼 정보 자동 동기화 모듈.
//!
//! KRX, Binance, Yahoo Finance 등에서 종목 목록을 자동으로 가져와
//! symbol_info 테이블에 등록합니다.
//!
//! ## 지원 데이터 소스 (권위 있는 소스 원칙)
//!
//! 각 시장별로 "권위 있는 소스(Authoritative Source)"를 정의하고,
//! 해당 소스에서 종목이 없으면 다른 소스에서도 찾지 않습니다.
//!
//! | 시장 | 권위 있는 소스 | 설명 |
//! |------|--------------|------|
//! | **KR** | KRX | KRX에 없으면 Yahoo에서도 찾지 않음 |
//! | **CRYPTO** | Binance | Binance에 없으면 비활성화 |
//! | **US** | Yahoo Finance | Yahoo에서 상장폐지면 비활성화 |
//!
//! Fundamental 데이터 수집 전에 호출하여 수집 대상 심볼이 항상 존재하도록 보장합니다.

use sqlx::PgPool;
use tracing::{debug, error, info, warn};

use trader_data::provider::{KrxSymbolProvider, SymbolInfoProvider, SymbolMetadata, YahooSymbolProvider};

use crate::repository::{NewSymbolInfo, SymbolInfoRepository};

/// 심볼 동기화 설정.
#[derive(Debug, Clone)]
pub struct SymbolSyncConfig {
    /// 최소 심볼 수 (이 수 이하면 동기화 실행)
    pub min_symbol_count: i64,
    /// KRX 동기화 활성화
    pub sync_krx: bool,
    /// Binance 동기화 활성화
    pub sync_binance: bool,
    /// Yahoo Finance 동기화 활성화 (미국 주식)
    pub sync_yahoo: bool,
    /// Yahoo 최대 수집 종목 수
    pub yahoo_max_symbols: usize,
}

impl Default for SymbolSyncConfig {
    fn default() -> Self {
        Self {
            min_symbol_count: 100,
            sync_krx: true,
            sync_binance: false,
            sync_yahoo: true,
            yahoo_max_symbols: 500,
        }
    }
}

impl SymbolSyncConfig {
    /// 환경변수에서 설정 로드.
    ///
    /// # 환경변수
    /// * `SYMBOL_SYNC_MIN_COUNT` - 최소 심볼 수 (기본: 100)
    /// * `SYMBOL_SYNC_KRX` - KRX 동기화 (기본: true)
    /// * `SYMBOL_SYNC_BINANCE` - Binance 동기화 (기본: false)
    /// * `SYMBOL_SYNC_YAHOO` - Yahoo Finance 동기화 (기본: true)
    /// * `SYMBOL_SYNC_YAHOO_MAX` - Yahoo 최대 수집 수 (기본: 500)
    pub fn from_env() -> Self {
        let min_symbol_count: i64 = std::env::var("SYMBOL_SYNC_MIN_COUNT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(100);

        let sync_krx: bool = std::env::var("SYMBOL_SYNC_KRX")
            .map(|v| v != "false" && v != "0")
            .unwrap_or(true);

        let sync_binance: bool = std::env::var("SYMBOL_SYNC_BINANCE")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        let sync_yahoo: bool = std::env::var("SYMBOL_SYNC_YAHOO")
            .map(|v| v != "false" && v != "0")
            .unwrap_or(true);

        let yahoo_max_symbols: usize = std::env::var("SYMBOL_SYNC_YAHOO_MAX")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(500);

        Self {
            min_symbol_count,
            sync_krx,
            sync_binance,
            sync_yahoo,
            yahoo_max_symbols,
        }
    }
}

/// 심볼 목록 동기화 실행.
///
/// 현재 symbol_info 테이블의 심볼 수를 확인하고,
/// 최소 기준 이하면 KRX/Binance에서 종목 목록을 가져와 등록합니다.
///
/// # Arguments
/// * `pool` - PostgreSQL 연결 풀
/// * `config` - 동기화 설정
///
/// # Returns
/// 동기화된 심볼 수
pub async fn sync_symbols(
    pool: &PgPool,
    config: &SymbolSyncConfig,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    // 현재 심볼 수 확인
    let current_count = SymbolInfoRepository::count_all(pool).await?;

    debug!(current = current_count, min = config.min_symbol_count, "심볼 수 확인");

    // 최소 기준 이상이면 스킵
    if current_count >= config.min_symbol_count {
        debug!("충분한 심볼이 등록되어 있음, 동기화 스킵");
        return Ok(0);
    }

    info!(
        current = current_count,
        min = config.min_symbol_count,
        "심볼 수 부족, 동기화 시작"
    );

    let mut total_synced = 0;

    // KRX 동기화
    if config.sync_krx {
        match sync_krx_symbols(pool).await {
            Ok(count) => {
                total_synced += count;
                info!(count = count, "KRX 종목 동기화 완료");
            }
            Err(e) => {
                error!(error = %e, "KRX 종목 동기화 실패");
            }
        }
    }

    // Binance 동기화
    if config.sync_binance {
        match sync_binance_symbols(pool).await {
            Ok(count) => {
                total_synced += count;
                info!(count = count, "Binance 종목 동기화 완료");
            }
            Err(e) => {
                error!(error = %e, "Binance 종목 동기화 실패");
            }
        }
    }

    // Yahoo Finance 동기화 (미국 주식)
    if config.sync_yahoo {
        match sync_yahoo_symbols(pool, config.yahoo_max_symbols).await {
            Ok(count) => {
                total_synced += count;
                info!(count = count, "Yahoo Finance 종목 동기화 완료");
            }
            Err(e) => {
                error!(error = %e, "Yahoo Finance 종목 동기화 실패");
            }
        }
    }

    info!(total = total_synced, "전체 심볼 동기화 완료");

    Ok(total_synced)
}

/// KRX 종목 동기화.
///
/// KRX는 KR 시장의 권위 있는 소스입니다.
/// KRX에서 조회된 종목만 활성화되고, KRX에 없는 KR 종목은 비활성화됩니다.
async fn sync_krx_symbols(pool: &PgPool) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    info!("KRX 종목 목록 조회 중...");

    let provider = KrxSymbolProvider::new();
    let symbols = provider.fetch_all().await?;

    if symbols.is_empty() {
        warn!("KRX에서 종목 목록을 가져오지 못함");
        return Ok(0);
    }

    info!(count = symbols.len(), "KRX 종목 목록 조회 완료");

    // KRX에서 가져온 티커 목록 (권위 있는 소스)
    let krx_tickers: std::collections::HashSet<String> = symbols
        .iter()
        .map(|s| s.ticker.clone())
        .collect();

    // SymbolMetadata → NewSymbolInfo 변환
    let new_symbols: Vec<NewSymbolInfo> = symbols
        .into_iter()
        .map(|s| convert_metadata_to_new_symbol(s))
        .collect();

    // 일괄 upsert (활성화)
    let inserted = SymbolInfoRepository::upsert_batch(pool, &new_symbols).await?;

    // KRX에 없는 KR 종목 비활성화 (권위 있는 소스 원칙)
    let deactivated = deactivate_missing_symbols(pool, "KR", &krx_tickers).await?;
    if deactivated > 0 {
        info!(
            count = deactivated,
            "KRX에 없는 종목 비활성화 (상장폐지 추정)"
        );
    }

    Ok(inserted)
}

/// Binance 종목 동기화.
///
/// Binance는 CRYPTO 시장의 권위 있는 소스입니다.
/// Binance에서 조회된 종목만 활성화되고, Binance에 없는 CRYPTO 종목은 비활성화됩니다.
async fn sync_binance_symbols(pool: &PgPool) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    info!("Binance 종목 목록 조회 중...");

    // Binance API를 통해 USDT 페어 조회
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.binance.com/api/v3/exchangeInfo")
        .send()
        .await?;

    #[derive(serde::Deserialize)]
    struct ExchangeInfo {
        symbols: Vec<BinanceSymbol>,
    }

    #[derive(serde::Deserialize)]
    struct BinanceSymbol {
        symbol: String,
        #[serde(rename = "baseAsset")]
        base_asset: String,
        #[serde(rename = "quoteAsset")]
        quote_asset: String,
        status: String,
    }

    let exchange_info: ExchangeInfo = response.json().await?;

    // USDT 페어만 필터링 - 티커는 정규화된 형식(BTC/USDT)으로 저장
    // Yahoo Finance는 암호화폐를 지원하지 않으므로 yahoo_symbol은 None
    let usdt_pairs: Vec<NewSymbolInfo> = exchange_info
        .symbols
        .iter()
        .filter(|s| s.quote_asset == "USDT" && s.status == "TRADING")
        .map(|s| NewSymbolInfo {
            ticker: format!("{}/USDT", s.base_asset), // 정규화된 형식
            name: format!("{}/USDT", s.base_asset),
            name_en: Some(s.base_asset.clone()),
            market: "CRYPTO".to_string(),
            exchange: Some("BINANCE".to_string()),
            sector: Some("Cryptocurrency".to_string()),
            yahoo_symbol: None, // Yahoo Finance는 암호화폐 미지원
        })
        .collect();

    // Binance에서 가져온 티커 목록 (권위 있는 소스)
    let binance_tickers: std::collections::HashSet<String> = usdt_pairs
        .iter()
        .map(|s| s.ticker.clone())
        .collect();

    if usdt_pairs.is_empty() {
        warn!("Binance에서 USDT 페어를 가져오지 못함");
        return Ok(0);
    }

    info!(count = usdt_pairs.len(), "Binance USDT 페어 조회 완료");

    // 일괄 upsert (활성화)
    let inserted = SymbolInfoRepository::upsert_batch(pool, &usdt_pairs).await?;

    // Binance에 없는 CRYPTO 종목 비활성화 (권위 있는 소스 원칙)
    let deactivated = deactivate_missing_symbols(pool, "CRYPTO", &binance_tickers).await?;
    if deactivated > 0 {
        info!(
            count = deactivated,
            "Binance에 없는 종목 비활성화 (상장폐지 추정)"
        );
    }

    Ok(inserted)
}

/// Yahoo Finance 종목 동기화.
async fn sync_yahoo_symbols(pool: &PgPool, max_symbols: usize) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    info!(max = max_symbols, "Yahoo Finance 종목 목록 조회 중...");

    let provider = YahooSymbolProvider::with_max_symbols(max_symbols);
    let symbols = provider.fetch_all().await?;

    if symbols.is_empty() {
        warn!("Yahoo Finance에서 종목 목록을 가져오지 못함");
        return Ok(0);
    }

    info!(count = symbols.len(), "Yahoo Finance 종목 목록 조회 완료");

    // SymbolMetadata → NewSymbolInfo 변환
    let new_symbols: Vec<NewSymbolInfo> = symbols
        .into_iter()
        .map(convert_metadata_to_new_symbol)
        .collect();

    // 일괄 upsert
    let inserted = SymbolInfoRepository::upsert_batch(pool, &new_symbols).await?;

    Ok(inserted)
}

/// SymbolMetadata를 NewSymbolInfo로 변환.
fn convert_metadata_to_new_symbol(metadata: SymbolMetadata) -> NewSymbolInfo {
    NewSymbolInfo {
        ticker: metadata.ticker,
        name: metadata.name,
        name_en: metadata.name_en,
        market: metadata.market,
        exchange: metadata.exchange,
        sector: metadata.sector,
        yahoo_symbol: metadata.yahoo_symbol,
    }
}

/// 권위 있는 소스에 없는 종목 비활성화.
///
/// 해당 시장의 권위 있는 소스(KRX, Binance 등)에서 조회되지 않은 종목을
/// 비활성화합니다. 이는 상장폐지되거나 거래 중단된 종목입니다.
///
/// # Arguments
/// * `pool` - DB 연결 풀
/// * `market` - 시장 코드 ("KR", "CRYPTO" 등)
/// * `valid_tickers` - 권위 있는 소스에서 조회된 유효한 티커 목록
///
/// # Returns
/// 비활성화된 종목 수
async fn deactivate_missing_symbols(
    pool: &PgPool,
    market: &str,
    valid_tickers: &std::collections::HashSet<String>,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    // 현재 활성화된 해당 시장 종목 조회
    let active_symbols = SymbolInfoRepository::get_active_by_market(pool, market).await?;

    let mut deactivated_count = 0;

    for symbol in active_symbols {
        if !valid_tickers.contains(&symbol.ticker) {
            // 권위 있는 소스에 없음 → 비활성화
            match SymbolInfoRepository::deactivate_symbol(
                pool,
                symbol.id,
                &format!("{}에서 조회되지 않음 (상장폐지 추정)", market),
            ).await {
                Ok(_) => {
                    deactivated_count += 1;
                    debug!(
                        ticker = %symbol.ticker,
                        market = %market,
                        "종목 비활성화됨 (권위 있는 소스에 없음)"
                    );
                }
                Err(e) => {
                    warn!(
                        ticker = %symbol.ticker,
                        error = %e,
                        "종목 비활성화 실패"
                    );
                }
            }
        }
    }

    Ok(deactivated_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = SymbolSyncConfig::default();
        assert_eq!(config.min_symbol_count, 100);
        assert!(config.sync_krx);
        assert!(!config.sync_binance);
        assert!(config.sync_yahoo);
        assert_eq!(config.yahoo_max_symbols, 500);
    }
}
