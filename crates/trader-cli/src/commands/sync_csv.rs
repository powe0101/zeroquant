///! CSV 파일에서 종목 정보 동기화.

use anyhow::{Context, Result};
use sqlx::PgPool;
use std::path::Path;
use tracing::{info, warn};

/// CSV 동기화 설정.
pub struct SyncCsvConfig {
    /// 종목 코드 CSV 파일 경로
    pub codes_csv: String,
    /// 섹터 매핑 CSV 파일 경로 (선택적)
    pub sectors_csv: Option<String>,
    /// 데이터베이스 URL
    pub db_url: Option<String>,
}

/// CSV 파일에서 종목 정보를 읽어 DB에 동기화.
///
/// # Arguments
/// * `config` - 동기화 설정
///
/// # Returns
/// (종목 동기화 수, 섹터 업데이트 수) 튜플
pub async fn sync_csv(config: SyncCsvConfig) -> Result<(usize, usize)> {
    // DB URL 가져오기 (환경변수 또는 파라미터)
    let db_url = config
        .db_url
        .or_else(|| std::env::var("DATABASE_URL").ok())
        .ok_or_else(|| {
            anyhow::anyhow!(
                "DATABASE_URL not found. Set DATABASE_URL environment variable or use --db-url flag"
            )
        })?;

    info!("Connecting to database...");
    let pool = PgPool::connect(&db_url)
        .await
        .context("Failed to connect to database")?;

    info!("Database connection established");

    // 종목 코드 CSV 동기화
    info!("Syncing symbols from: {}", config.codes_csv);

    let codes_path = Path::new(&config.codes_csv);
    if !codes_path.exists() {
        anyhow::bail!("Codes CSV file not found: {}", config.codes_csv);
    }

    let symbol_result = sync_krx_from_csv(&pool, codes_path).await?;

    info!(
        "✅ Symbol sync complete: {} symbols upserted",
        symbol_result.upserted
    );

    // 섹터 CSV 동기화 (선택적)
    let sector_count = if let Some(sectors_csv) = &config.sectors_csv {
        info!("Syncing sectors from: {}", sectors_csv);

        let sectors_path = Path::new(sectors_csv);
        if !sectors_path.exists() {
            warn!("Sectors CSV file not found: {}", sectors_csv);
            0
        } else {
            let sector_result = update_sectors_from_csv(&pool, sectors_path).await?;

            info!(
                "✅ Sector sync complete: {} sectors updated",
                sector_result.upserted
            );

            sector_result.upserted
        }
    } else {
        info!("Skipping sector sync (no sectors CSV provided)");
        0
    };

    pool.close().await;

    Ok((symbol_result.upserted, sector_count))
}

/// krx_codes.csv에서 심볼 정보를 읽어 DB에 동기화.
///
/// # Arguments
/// * `pool` - PostgreSQL 연결 풀
/// * `csv_path` - CSV 파일 경로
///
/// # Returns
/// 동기화 결과
async fn sync_krx_from_csv<P: AsRef<Path>>(
    pool: &PgPool,
    csv_path: P,
) -> Result<trader_api::tasks::krx_csv_sync::CsvSyncResult> {
    // trader-api의 krx_csv_sync 모듈 사용
    trader_api::tasks::krx_csv_sync::sync_krx_from_csv(pool, csv_path)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to sync KRX symbols: {}", e))
}

/// krx_sector_map.csv에서 섹터 정보를 읽어 DB 업데이트.
///
/// # Arguments
/// * `pool` - PostgreSQL 연결 풀
/// * `csv_path` - 섹터 매핑 CSV 파일 경로
///
/// # Returns
/// 업데이트 결과
async fn update_sectors_from_csv<P: AsRef<Path>>(
    pool: &PgPool,
    csv_path: P,
) -> Result<trader_api::tasks::krx_csv_sync::CsvSyncResult> {
    // trader-api의 krx_csv_sync 모듈 사용
    trader_api::tasks::krx_csv_sync::update_sectors_from_csv(pool, csv_path)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to update sectors: {}", e))
}
