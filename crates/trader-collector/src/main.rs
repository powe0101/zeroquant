//! Standalone data collector CLI.

use clap::{Parser, Subcommand};
use sqlx::PgPool;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use trader_collector::{modules, CollectorConfig};

/// 전체 워크플로우 실행 (에러 시 로깅 후 계속).
async fn run_workflow(pool: &PgPool, config: &CollectorConfig) {
    // 1. 심볼 동기화
    match modules::sync_symbols(pool, config).await {
        Ok(stats) => stats.log_summary("심볼 동기화"),
        Err(e) => tracing::error!("심볼 동기화 실패: {}", e),
    }

    // 2. KRX Fundamental 동기화 (PER, PBR, 섹터 등) - KRX API 활성화 시에만
    if config.providers.krx_api_enabled {
        match modules::sync_krx_fundamentals(pool, &config.fundamental_collect).await {
            Ok(stats) => tracing::info!(
                processed = stats.processed,
                valuation = stats.valuation_updated,
                sector = stats.sector_updated,
                "KRX Fundamental 동기화 완료"
            ),
            Err(e) => tracing::error!("KRX Fundamental 동기화 실패: {}", e),
        }
    } else {
        tracing::info!("KRX Fundamental 동기화 건너뜀 (KRX API 비활성화)");
    }

    // 3. OHLCV 수집 (지표도 함께 계산) - 데몬 모드에서는 24시간 증분 수집
    match modules::collect_ohlcv(pool, config, None, Some(24)).await {
        Ok(stats) => stats.log_summary("OHLCV 수집"),
        Err(e) => tracing::error!("OHLCV 수집 실패: {}", e),
    }

    // 4. 분석 지표 동기화 (누락된 지표 보완)
    match modules::sync_indicators(pool, config, None).await {
        Ok(stats) => stats.log_summary("지표 동기화"),
        Err(e) => tracing::error!("지표 동기화 실패: {}", e),
    }

    // 5. GlobalScore 동기화 (랭킹용)
    match modules::sync_global_scores(pool, config, None).await {
        Ok(stats) => stats.log_summary("GlobalScore 동기화"),
        Err(e) => tracing::error!("GlobalScore 동기화 실패: {}", e),
    }
}

#[derive(Parser)]
#[command(name = "trader-collector")]
#[command(about = "ZeroQuant Standalone Data Collector", long_about = None)]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// 로그 레벨 (trace, debug, info, warn, error)
    #[arg(long, default_value = "info")]
    log_level: String,
}

#[derive(Subcommand)]
enum Commands {
    /// 심볼 정보 동기화 (KRX, Binance, Yahoo)
    SyncSymbols,

    /// OHLCV 데이터 수집 (일봉)
    CollectOhlcv {
        /// 특정 심볼만 수집 (쉼표로 구분, 예: "005930,000660")
        #[arg(long)]
        symbols: Option<String>,

        /// 증분 수집: 이 시간(hours) 이전에 업데이트된 심볼만 수집
        /// 예: --stale-hours 24 (24시간 이상 지난 심볼만)
        #[arg(long)]
        stale_hours: Option<u32>,
    },

    /// 분석 지표 동기화 (RouteState, MarketRegime, TTM Squeeze)
    SyncIndicators {
        /// 특정 심볼만 처리 (쉼표로 구분, 예: "005930,000660")
        #[arg(long)]
        symbols: Option<String>,
    },

    /// GlobalScore 동기화 (랭킹용 종합 점수)
    SyncGlobalScores {
        /// 특정 심볼만 처리 (쉼표로 구분, 예: "005930,000660")
        #[arg(long)]
        symbols: Option<String>,
    },

    /// KRX Fundamental 데이터 동기화 (PER, PBR, 배당수익률, 섹터 등)
    SyncKrxFundamentals,

    /// 전체 워크플로우 실행 (심볼 → OHLCV → 지표 → GlobalScore)
    RunAll,

    /// 데몬 모드: 주기적으로 전체 워크플로우 실행
    Daemon,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    // 로깅 초기화 (trader_collector, trader_data 모두 포함)
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!(
                    "trader_collector={},trader_data={},trader_analytics={}",
                    cli.log_level, cli.log_level, cli.log_level
                )
                .into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("ZeroQuant Data Collector 시작");

    // 설정 로드
    let config = CollectorConfig::from_env()?;
    tracing::debug!(database_url = %config.database_url, "설정 로드 완료");

    // DB 연결
    let pool = sqlx::PgPool::connect(&config.database_url).await?;
    tracing::info!("데이터베이스 연결 성공");

    // 명령 실행
    match cli.command {
        Commands::SyncSymbols => {
            let stats = modules::sync_symbols(&pool, &config).await?;
            stats.log_summary("심볼 동기화");
        }
        Commands::CollectOhlcv { symbols, stale_hours } => {
            let stats = modules::collect_ohlcv(&pool, &config, symbols, stale_hours).await?;
            stats.log_summary("OHLCV 수집");
        }
        Commands::SyncIndicators { symbols } => {
            let stats = modules::sync_indicators(&pool, &config, symbols).await?;
            stats.log_summary("지표 동기화");
        }
        Commands::SyncGlobalScores { symbols } => {
            let stats = modules::sync_global_scores(&pool, &config, symbols).await?;
            stats.log_summary("GlobalScore 동기화");
        }
        Commands::SyncKrxFundamentals => {
            if !config.providers.krx_api_enabled {
                tracing::warn!("KRX API가 비활성화되어 있습니다. PROVIDER_KRX_API_ENABLED=true로 활성화하세요.");
                return Ok(());
            }
            let stats = modules::sync_krx_fundamentals(&pool, &config.fundamental_collect).await?;
            tracing::info!(
                processed = stats.processed,
                valuation = stats.valuation_updated,
                market_cap = stats.market_cap_updated,
                sector = stats.sector_updated,
                "KRX Fundamental 동기화 완료"
            );
        }
        Commands::RunAll => {
            tracing::info!("=== 전체 워크플로우 시작 ===");

            // 1. 심볼 동기화
            tracing::info!("Step 1/5: 심볼 동기화");
            let sync_stats = modules::sync_symbols(&pool, &config).await?;
            sync_stats.log_summary("심볼 동기화");

            // 2. KRX Fundamental 동기화 (PER, PBR, 섹터 등) - KRX API 활성화 시에만
            tracing::info!("Step 2/5: KRX Fundamental 동기화");
            if config.providers.krx_api_enabled {
                let krx_stats = modules::sync_krx_fundamentals(&pool, &config.fundamental_collect).await?;
                tracing::info!(
                    processed = krx_stats.processed,
                    valuation = krx_stats.valuation_updated,
                    sector = krx_stats.sector_updated,
                    "KRX Fundamental 동기화 완료"
                );
            } else {
                tracing::info!("KRX API 비활성화 - 건너뜀 (PROVIDER_KRX_API_ENABLED=true로 활성화)");
            }

            // 3. OHLCV 수집 (지표도 함께 계산) - 전체 수집
            tracing::info!("Step 3/5: OHLCV 수집");
            let ohlcv_stats = modules::collect_ohlcv(&pool, &config, None, None).await?;
            ohlcv_stats.log_summary("OHLCV 수집");

            // 4. 분석 지표 동기화 (누락된 지표 보완)
            tracing::info!("Step 4/5: 분석 지표 동기화");
            let indicator_stats = modules::sync_indicators(&pool, &config, None).await?;
            indicator_stats.log_summary("지표 동기화");

            // 5. GlobalScore 동기화 (랭킹용)
            tracing::info!("Step 5/5: GlobalScore 동기화");
            let global_score_stats = modules::sync_global_scores(&pool, &config, None).await?;
            global_score_stats.log_summary("GlobalScore 동기화");

            tracing::info!("=== 전체 워크플로우 완료 ===");
        }
        Commands::Daemon => {
            tracing::info!(
                "=== 데몬 모드 시작 (주기: {}분) ===",
                config.daemon.interval_minutes
            );

            // 데몬 시작 시 즉시 한 번 실행
            tracing::info!("=== 초기 워크플로우 실행 시작 ===");
            run_workflow(&pool, &config).await;
            tracing::info!(
                "=== 초기 워크플로우 완료, 다음 실행: {}분 후 ===",
                config.daemon.interval_minutes
            );

            let mut interval = tokio::time::interval(config.daemon.interval());
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            // 첫 tick은 즉시 발생하므로 건너뜀 (이미 위에서 실행함)
            interval.tick().await;

            loop {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {
                        tracing::info!("종료 신호 수신, 데몬 종료 중...");
                        break;
                    }
                    _ = interval.tick() => {
                        tracing::info!("=== 워크플로우 실행 시작 ===");
                        run_workflow(&pool, &config).await;
                        tracing::info!(
                            "=== 워크플로우 완료, 다음 실행: {}분 후 ===",
                            config.daemon.interval_minutes
                        );
                    }
                }
            }
        }
    }

    pool.close().await;
    tracing::info!("ZeroQuant Data Collector 종료");

    Ok(())
}
