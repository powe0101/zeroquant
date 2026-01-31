//! 전략 관리 endpoint.
//!
//! 전략 목록 조회, 시작/중지, 설정 변경을 위한 REST API를 제공합니다.
//!
//! # 엔드포인트
//!
//! - `GET /api/v1/strategies` - 전략 목록 조회
//! - `POST /api/v1/strategies` - 전략 생성
//! - `GET /api/v1/strategies/{id}` - 특정 전략 상세 조회
//! - `DELETE /api/v1/strategies/{id}` - 전략 삭제
//! - `POST /api/v1/strategies/{id}/start` - 전략 시작
//! - `POST /api/v1/strategies/{id}/stop` - 전략 중지
//! - `PUT /api/v1/strategies/{id}/config` - 전략 설정 변경

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, put},
    Json, Router,
};
use chrono::Utc;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

use crate::repository::{StrategyRepository, strategies::CreateStrategyInput};
use crate::state::AppState;
use crate::websocket::{ServerMessage, StrategyUpdateData};
use trader_strategy::{
    strategies::{
        AllWeatherStrategy, BaaStrategy, BollingerStrategy, CandlePatternStrategy,
        DualMomentumStrategy, GridStrategy, HaaStrategy, InfinityBotStrategy,
        KosdaqFireRainStrategy, KospiBothSideStrategy, MagicSplitStrategy,
        MarketCapTopStrategy, MarketInterestDayStrategy, PensionBotStrategy,
        RsiStrategy, SectorMomentumStrategy, SectorVbStrategy, SimplePowerStrategy,
        SmallCapQuantStrategy, SmaStrategy, SnowStrategy, StockGuganStrategy,
        StockRotationStrategy, Us3xLeverageStrategy,
        VolatilityBreakoutStrategy, XaaStrategy,
    },
    EngineError, EngineStats, Strategy, StrategyStatus,
};

// ==================== 응답 타입 ====================

/// 전략 목록 응답.
#[derive(Debug, Serialize, Deserialize)]
pub struct StrategiesListResponse {
    /// 전략 목록
    pub strategies: Vec<StrategyListItem>,
    /// 전체 전략 수
    pub total: usize,
    /// 실행 중인 전략 수
    pub running: usize,
}

/// 전략 목록 항목.
#[derive(Debug, Serialize, Deserialize)]
pub struct StrategyListItem {
    /// 전략 ID
    pub id: String,
    /// 전략 타입 (예: "rsi", "grid_trading", "sma" 등)
    #[serde(rename = "strategyType")]
    pub strategy_type: String,
    /// 전략 이름
    pub name: String,
    /// 전략 상태 ("Running", "Stopped", "Error")
    pub status: String,
    /// 시장 ("KR", "US", "CRYPTO")
    pub market: String,
    /// 거래 심볼 목록
    pub symbols: Vec<String>,
    /// 타임프레임 (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M)
    pub timeframe: String,
    /// 손익
    pub pnl: f64,
    /// 승률
    #[serde(rename = "winRate")]
    pub win_rate: f64,
    /// 거래 횟수
    #[serde(rename = "tradesCount")]
    pub trades_count: u64,
    /// 리스크 프로필 (conservative, default, aggressive, custom)
    #[serde(rename = "riskProfile")]
    pub risk_profile: Option<String>,
    /// 할당 자본
    #[serde(rename = "allocatedCapital")]
    pub allocated_capital: Option<f64>,
}

/// 전략 상세 응답.
#[derive(Debug, Serialize)]
pub struct StrategyDetailResponse {
    /// 전략 ID
    pub id: String,
    /// 전략 타입 (예: "grid_trading", "rsi")
    pub strategy_type: String,
    /// 전략 상태 정보
    #[serde(flatten)]
    pub status: StrategyStatus,
    /// 전략 설정 (편집용)
    pub config: Value,
}

/// 전략 시작/중지 응답.
#[derive(Debug, Serialize)]
pub struct StrategyActionResponse {
    /// 성공 여부
    pub success: bool,
    /// 전략 ID
    pub strategy_id: String,
    /// 수행된 액션
    pub action: String,
    /// 메시지
    pub message: String,
}

/// 전략 설정 변경 요청.
#[derive(Debug, Deserialize)]
pub struct UpdateConfigRequest {
    /// 새로운 설정 (JSON)
    pub config: Value,
}

/// 리스크 설정 변경 요청.
#[derive(Debug, Deserialize)]
pub struct UpdateRiskSettingsRequest {
    /// 리스크 설정 (RiskConfig 형식)
    #[serde(default)]
    pub risk_config: Option<Value>,
    /// 할당 자본 (NULL이면 전체 계좌 잔고 사용)
    #[serde(default)]
    pub allocated_capital: Option<f64>,
    /// 리스크 프로필 (conservative, default, aggressive, custom)
    #[serde(default)]
    pub risk_profile: Option<String>,
}

/// 전략 복사 요청.
#[derive(Debug, Deserialize)]
pub struct CloneStrategyRequest {
    /// 새 전략 이름
    pub new_name: String,
    /// 파라미터 오버라이드 (옵션)
    #[serde(default)]
    pub override_params: Option<Value>,
    /// 리스크 설정 오버라이드 (옵션)
    #[serde(default)]
    pub override_risk_config: Option<Value>,
    /// 할당 자본 오버라이드 (옵션)
    #[serde(default)]
    pub override_allocated_capital: Option<f64>,
}

/// 전략 복사 응답.
#[derive(Debug, Serialize)]
pub struct CloneStrategyResponse {
    /// 성공 여부
    pub success: bool,
    /// 원본 전략 ID
    pub source_id: String,
    /// 생성된 전략 ID
    pub new_id: String,
    /// 새 전략 이름
    pub new_name: String,
    /// 메시지
    pub message: String,
}

/// 전략 생성 요청.
#[derive(Debug, Deserialize)]
pub struct CreateStrategyRequest {
    /// 전략 타입 (예: "grid_trading", "rsi", "bollinger" 등)
    pub strategy_type: String,
    /// 전략 이름 (사용자 지정, 옵션)
    pub name: Option<String>,
    /// 전략 파라미터
    pub parameters: Value,
    /// 리스크 설정 (옵션, RiskConfig 형식)
    #[serde(default)]
    pub risk_config: Option<Value>,
    /// 할당 자본 (옵션, NULL이면 전체 계좌 잔고 사용)
    #[serde(default)]
    pub allocated_capital: Option<f64>,
    /// 리스크 프로필 (conservative, default, aggressive, custom)
    #[serde(default)]
    pub risk_profile: Option<String>,
}

/// 전략 생성 응답.
#[derive(Debug, Serialize)]
pub struct CreateStrategyResponse {
    /// 성공 여부
    pub success: bool,
    /// 생성된 전략 ID
    pub strategy_id: String,
    /// 전략 이름
    pub name: String,
    /// 메시지
    pub message: String,
}

/// 엔진 통계 응답.
#[derive(Debug, Serialize, Deserialize)]
pub struct EngineStatsResponse {
    /// 전체 전략 수
    pub total_strategies: usize,
    /// 실행 중인 전략 수
    pub running_strategies: usize,
    /// 총 생성된 신호 수
    pub total_signals_generated: u64,
    /// 총 체결된 주문 수
    pub total_orders_filled: u64,
    /// 총 처리된 시장 데이터 수
    pub total_market_data_processed: u64,
}

impl From<EngineStats> for EngineStatsResponse {
    fn from(stats: EngineStats) -> Self {
        Self {
            total_strategies: stats.total_strategies,
            running_strategies: stats.running_strategies,
            total_signals_generated: stats.total_signals_generated,
            total_orders_filled: stats.total_orders_filled,
            total_market_data_processed: stats.total_market_data_processed,
        }
    }
}

/// API 에러 응답.
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiError {
    /// 에러 코드
    pub code: String,
    /// 에러 메시지
    pub message: String,
}

impl ApiError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

// ==================== 전략 팩토리 ====================

/// 전략 타입에 따라 전략 인스턴스를 생성.
fn create_strategy_instance(strategy_type: &str) -> Result<Box<dyn Strategy>, String> {
    match strategy_type {
        // 단일 종목 전략
        "rsi" | "rsi_mean_reversion" => Ok(Box::new(RsiStrategy::new())),
        "grid" | "grid_trading" => Ok(Box::new(GridStrategy::new())),
        "bollinger" | "bollinger_bands" => Ok(Box::new(BollingerStrategy::new())),
        "volatility_breakout" | "volatility" => Ok(Box::new(VolatilityBreakoutStrategy::new())),
        "magic_split" | "split" => Ok(Box::new(MagicSplitStrategy::new())),
        "sma" | "sma_crossover" | "ma_crossover" => Ok(Box::new(SmaStrategy::new())),
        "candle_pattern" => Ok(Box::new(CandlePatternStrategy::new())),
        "infinity_bot" => Ok(Box::new(InfinityBotStrategy::new())),
        "market_interest_day" => Ok(Box::new(MarketInterestDayStrategy::new())),
        // 자산배분 전략
        "simple_power" => Ok(Box::new(SimplePowerStrategy::new())),
        "haa" => Ok(Box::new(HaaStrategy::new())),
        "xaa" => Ok(Box::new(XaaStrategy::new())),
        "stock_rotation" | "rotation" => Ok(Box::new(StockRotationStrategy::new())),
        "all_weather" | "all_weather_us" | "all_weather_kr" => Ok(Box::new(AllWeatherStrategy::new())),
        "snow" | "snow_us" | "snow_kr" => Ok(Box::new(SnowStrategy::new())),
        "market_cap_top" => Ok(Box::new(MarketCapTopStrategy::new())),
        // 3차 전략
        "baa" => Ok(Box::new(BaaStrategy::new())),
        "sector_momentum" => Ok(Box::new(SectorMomentumStrategy::new())),
        "dual_momentum" => Ok(Box::new(DualMomentumStrategy::new())),
        "small_cap_quant" => Ok(Box::new(SmallCapQuantStrategy::new())),
        "pension_bot" | "pension" => Ok(Box::new(PensionBotStrategy::new())),
        "sector_vb" | "sector_volatility" => Ok(Box::new(SectorVbStrategy::new())),
        "kospi_bothside" | "kospi_both" => Ok(Box::new(KospiBothSideStrategy::new())),
        "kosdaq_fire_rain" | "kosdaq_surge" => Ok(Box::new(KosdaqFireRainStrategy::new())),
        "us_3x_leverage" | "us_leverage" => Ok(Box::new(Us3xLeverageStrategy::new())),
        "stock_gugan" | "gugan" => Ok(Box::new(StockGuganStrategy::new())),
        _ => Err(format!("Unknown strategy type: {}", strategy_type)),
    }
}

/// 전략 타입에서 기본 이름 가져오기.
fn get_strategy_default_name(strategy_type: &str) -> &'static str {
    match strategy_type {
        // 단일 종목 전략
        "rsi" | "rsi_mean_reversion" => "RSI 평균회귀",
        "grid" | "grid_trading" => "그리드 트레이딩",
        "bollinger" | "bollinger_bands" => "볼린저 밴드",
        "volatility_breakout" | "volatility" => "변동성 돌파",
        "magic_split" | "split" => "Magic Split",
        "sma" | "sma_crossover" | "ma_crossover" => "이동평균 크로스오버",
        "candle_pattern" => "캔들 패턴",
        "infinity_bot" => "무한매수",
        "market_interest_day" => "단타 시장관심",
        // 자산배분 전략
        "simple_power" => "Simple Power",
        "haa" => "HAA",
        "xaa" => "XAA",
        "stock_rotation" | "rotation" => "종목 갈아타기",
        "all_weather" | "all_weather_us" | "all_weather_kr" => "올웨더",
        "snow" | "snow_us" | "snow_kr" => "스노우",
        "market_cap_top" => "시총 TOP",
        // 3차 전략
        "baa" => "BAA",
        "sector_momentum" => "섹터 모멘텀",
        "dual_momentum" => "듀얼 모멘텀",
        "small_cap_quant" => "소형주 퀀트",
        "pension_bot" | "pension" => "연금 자동화",
        "sector_vb" | "sector_volatility" => "섹터 변동성 돌파",
        "kospi_bothside" | "kospi_both" => "코스피 양방향",
        "kosdaq_fire_rain" | "kosdaq_surge" => "코스닥 급등주",
        "us_3x_leverage" | "us_leverage" => "미국 3배 레버리지",
        "stock_gugan" | "gugan" => "주식 구간 매매",
        _ => "Unknown Strategy",
    }
}

/// 전략 타입에서 기본 타임프레임 가져오기.
fn get_strategy_default_timeframe(strategy_type: &str) -> &'static str {
    match strategy_type {
        // 실시간 전략: 1m
        "grid" | "grid_trading" => "1m",
        "magic_split" | "split" => "1m",
        "infinity_bot" => "1m",
        "stock_gugan" | "gugan" => "1m",
        // 분봉 전략: 15m
        "rsi" | "rsi_mean_reversion" => "15m",
        "bollinger" | "bollinger_bands" => "15m",
        "sma" | "sma_crossover" | "ma_crossover" => "15m",
        "candle_pattern" => "15m",
        "kospi_bothside" | "kospi_both" => "15m",
        "kosdaq_fire_rain" | "kosdaq_surge" => "15m",
        // 일봉 전략: 1d
        "volatility_breakout" | "volatility" => "1d",
        "snow" | "snow_us" | "snow_kr" => "1d",
        "stock_rotation" | "rotation" => "1d",
        "market_interest_day" => "1d",
        "sector_vb" | "sector_volatility" => "1d",
        "us_3x_leverage" | "us_leverage" => "1d",
        // 자산배분 전략 (월 리밸런싱이지만 일봉 데이터 사용): 1d
        "simple_power" => "1d",
        "haa" => "1d",
        "xaa" => "1d",
        "all_weather" | "all_weather_us" | "all_weather_kr" => "1d",
        "market_cap_top" => "1d",
        "baa" => "1d",
        "sector_momentum" => "1d",
        "dual_momentum" => "1d",
        "small_cap_quant" => "1d",
        "pension_bot" | "pension" => "1d",
        _ => "1d",
    }
}

/// 전략 타입에서 권장 심볼 가져오기.
fn get_strategy_default_symbols(strategy_type: &str) -> Vec<String> {
    match strategy_type {
        // 단일 종목 전략: 빈 배열 (사용자가 지정)
        "rsi" | "rsi_mean_reversion" => vec![],
        "grid" | "grid_trading" => vec![],
        "bollinger" | "bollinger_bands" => vec![],
        "volatility_breakout" | "volatility" => vec![],
        "magic_split" | "split" => vec![],
        "sma" | "sma_crossover" | "ma_crossover" => vec![],
        "candle_pattern" => vec![],
        "infinity_bot" => vec![],
        "market_interest_day" => vec![],
        "stock_gugan" | "gugan" => vec![],
        // 자산배분 전략: 권장 심볼 목록
        "simple_power" => vec!["TQQQ", "SCHD", "PFIX", "TMF"].iter().map(|s| s.to_string()).collect(),
        "haa" => vec!["TIP", "SPY", "IWM", "VEA", "VWO", "TLT", "IEF", "PDBC", "VNQ", "BIL"].iter().map(|s| s.to_string()).collect(),
        "xaa" => vec!["VWO", "BND", "SPY", "EFA", "EEM", "TLT", "IEF", "LQD", "BIL"].iter().map(|s| s.to_string()).collect(),
        "stock_rotation" | "rotation" => vec!["005930", "000660", "035420", "051910", "006400"].iter().map(|s| s.to_string()).collect(),
        "all_weather" | "all_weather_us" => vec!["SPY", "TLT", "IEF", "GLD", "PDBC", "IYK"].iter().map(|s| s.to_string()).collect(),
        "all_weather_kr" => vec!["069500", "148070", "139260", "132030", "130730", "143850"].iter().map(|s| s.to_string()).collect(),
        "snow" | "snow_us" => vec!["TIP", "UPRO", "TLT", "BIL"].iter().map(|s| s.to_string()).collect(),
        "snow_kr" => vec!["140700", "122630", "148070", "272580"].iter().map(|s| s.to_string()).collect(),
        "market_cap_top" => vec!["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B", "JPM", "V"].iter().map(|s| s.to_string()).collect(),
        // 3차 전략
        "baa" => vec!["SPY", "VEA", "VWO", "BND", "QQQ", "IWM", "TIP", "DBC", "BIL", "IEF", "TLT"].iter().map(|s| s.to_string()).collect(),
        "sector_momentum" => vec!["XLK", "XLF", "XLV", "XLE", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE"].iter().map(|s| s.to_string()).collect(),
        "dual_momentum" => vec!["069500", "122630", "IEF", "TLT"].iter().map(|s| s.to_string()).collect(),
        "small_cap_quant" => vec![],  // 동적으로 선정
        "pension_bot" | "pension" => vec!["SPY", "IWM", "VEA", "VWO", "TLT", "IEF", "TIP", "BIL"].iter().map(|s| s.to_string()).collect(),
        "sector_vb" | "sector_volatility" => vec!["091160", "091170", "091180", "091220", "091230"].iter().map(|s| s.to_string()).collect(),
        "kospi_bothside" | "kospi_both" => vec!["122630", "252670"].iter().map(|s| s.to_string()).collect(),
        "kosdaq_fire_rain" | "kosdaq_surge" => vec!["122630", "252670", "233740", "251340"].iter().map(|s| s.to_string()).collect(),
        "us_3x_leverage" | "us_leverage" => vec!["TQQQ", "SQQQ", "UPRO", "SPXU", "TMF", "TMV"].iter().map(|s| s.to_string()).collect(),
        _ => vec![],
    }
}

// ==================== 에러 처리 ====================

/// EngineError를 HTTP 응답으로 변환.
fn engine_error_to_response(err: EngineError) -> (StatusCode, Json<ApiError>) {
    let (status, code) = match &err {
        EngineError::StrategyNotFound(_) => (StatusCode::NOT_FOUND, "STRATEGY_NOT_FOUND"),
        EngineError::StrategyAlreadyExists(_) => (StatusCode::CONFLICT, "STRATEGY_EXISTS"),
        EngineError::InitializationFailed(_) => (StatusCode::INTERNAL_SERVER_ERROR, "INIT_FAILED"),
        EngineError::NotRunning(_) => (StatusCode::BAD_REQUEST, "NOT_RUNNING"),
        EngineError::AlreadyRunning(_) => (StatusCode::BAD_REQUEST, "ALREADY_RUNNING"),
        EngineError::ChannelError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "CHANNEL_ERROR"),
        EngineError::InternalError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR"),
    };

    (status, Json(ApiError::new(code, err.to_string())))
}

// ==================== handler ====================

/// 전략 생성.
///
/// POST /api/v1/strategies
pub async fn create_strategy(
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateStrategyRequest>,
) -> Result<Json<CreateStrategyResponse>, (StatusCode, Json<ApiError>)> {
    // 전략 인스턴스 생성
    let strategy = create_strategy_instance(&request.strategy_type).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ApiError::new("INVALID_STRATEGY_TYPE", e)),
        )
    })?;

    // 전략 ID 생성 (UUID)
    let strategy_id = format!("{}_{}", request.strategy_type, Uuid::new_v4().to_string()[..8].to_string());

    // 전략 이름 (커스텀 이름이 있으면 사용, 없으면 기본 이름)
    let custom_name = request.name.clone();
    let display_name = custom_name
        .clone()
        .unwrap_or_else(|| get_strategy_default_name(&request.strategy_type).to_string());

    // 파라미터에서 symbols 추출 (없으면 권장 심볼 사용)
    let symbols: Vec<String> = request
        .parameters
        .get("symbols")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(|| get_strategy_default_symbols(&request.strategy_type));

    // 파라미터에서 timeframe 추출 (없으면 기본 타임프레임 사용)
    let timeframe = request
        .parameters
        .get("timeframe")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| get_strategy_default_timeframe(&request.strategy_type).to_string());

    // 마켓 타입 추론 (심볼 기반)
    let market = if symbols.first().map(|s| s.chars().all(|c| c.is_numeric())).unwrap_or(false) {
        "KR".to_string()
    } else if symbols.first().map(|s| s.contains('/')).unwrap_or(false) {
        "CRYPTO".to_string()
    } else {
        "US".to_string()
    };

    // 할당 자본을 Decimal로 변환
    let allocated_capital = request.allocated_capital.map(|v| Decimal::try_from(v).unwrap_or(Decimal::ZERO));

    // 데이터베이스에 저장 (DB가 연결된 경우)
    if let Some(ref pool) = state.db_pool {
        let input = CreateStrategyInput {
            id: strategy_id.clone(),
            name: display_name.clone(),
            description: None,
            strategy_type: request.strategy_type.clone(),
            symbols: symbols.clone(),
            market: market.clone(),
            timeframe: timeframe.clone(),
            config: request.parameters.clone(),
            risk_config: request.risk_config.clone(),
            allocated_capital,
            risk_profile: request.risk_profile.clone(),
        };

        StrategyRepository::create(pool, input).await.map_err(|e| {
            tracing::error!("Failed to save strategy to database: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::new("DB_ERROR", format!("Failed to save strategy: {}", e))),
            )
        })?;
    }

    // 엔진에 전략 등록 (커스텀 이름 전달)
    let engine = state.strategy_engine.read().await;
    engine
        .register_strategy(&strategy_id, strategy, request.parameters.clone(), custom_name)
        .await
        .map_err(engine_error_to_response)?;

    // WebSocket 브로드캐스트: 전략 생성 알림
    state.broadcast(ServerMessage::StrategyUpdate(StrategyUpdateData {
        strategy_id: strategy_id.clone(),
        name: display_name.clone(),
        running: false,
        event: "created".to_string(),
        data: Some(serde_json::json!({
            "strategy_type": request.strategy_type
        })),
        timestamp: Utc::now().timestamp_millis(),
    }));

    Ok(Json(CreateStrategyResponse {
        success: true,
        strategy_id: strategy_id.clone(),
        name: display_name,
        message: format!("Strategy '{}' created successfully", strategy_id),
    }))
}

/// 전략 삭제.
///
/// DELETE /api/v1/strategies/{id}
pub async fn delete_strategy(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<StrategyActionResponse>, (StatusCode, Json<ApiError>)> {
    let engine = state.strategy_engine.read().await;

    // 삭제 전 전략 정보 가져오기 (브로드캐스트용)
    let strategy_name = engine
        .get_strategy_status(&id)
        .await
        .map(|s| s.name)
        .unwrap_or_else(|_| id.clone());

    engine
        .unregister_strategy(&id)
        .await
        .map_err(engine_error_to_response)?;

    // 데이터베이스에서 삭제 (DB가 연결된 경우)
    if let Some(ref pool) = state.db_pool {
        if let Err(e) = StrategyRepository::delete(pool, &id).await {
            tracing::warn!("Failed to delete strategy from database: {:?}", e);
            // DB 삭제 실패는 경고만 남기고 계속 진행 (엔진에서는 이미 삭제됨)
        }
    }

    // WebSocket 브로드캐스트: 전략 삭제 알림
    state.broadcast(ServerMessage::StrategyUpdate(StrategyUpdateData {
        strategy_id: id.clone(),
        name: strategy_name,
        running: false,
        event: "deleted".to_string(),
        data: None,
        timestamp: Utc::now().timestamp_millis(),
    }));

    Ok(Json(StrategyActionResponse {
        success: true,
        strategy_id: id.clone(),
        action: "delete".to_string(),
        message: format!("Strategy '{}' deleted successfully", id),
    }))
}

/// 전략 목록 조회.
///
/// GET /api/v1/strategies
pub async fn list_strategies(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let engine = state.strategy_engine.read().await;
    let all_statuses = engine.get_all_statuses().await;

    let mut strategies: Vec<StrategyListItem> = Vec::new();

    for (id, status) in all_statuses {
        // 전략 타입 조회
        let strategy_type = engine
            .get_strategy_type(&id)
            .await
            .unwrap_or_else(|_| "unknown".to_string());

        // 전략 상태 문자열 변환
        let status_str = if status.running {
            "Running".to_string()
        } else {
            "Stopped".to_string()
        };

        // 전략 ID에서 시장 추론 (향후 설정에서 가져오도록 개선 필요)
        let market = if id.contains("kis") || id.contains("kr") {
            "KR".to_string()
        } else if id.contains("binance") || id.contains("crypto") {
            "CRYPTO".to_string()
        } else {
            "KR".to_string() // 기본값
        };

        // 심볼 목록 (권장 심볼 사용)
        let symbols = get_strategy_default_symbols(&strategy_type);
        let symbols = if symbols.is_empty() {
            vec!["005930".to_string()] // 기본값
        } else {
            symbols
        };

        // 타임프레임 (기본값 사용)
        let timeframe = get_strategy_default_timeframe(&strategy_type).to_string();

        strategies.push(StrategyListItem {
            id,
            strategy_type,
            name: status.name,
            status: status_str,
            market,
            symbols,
            timeframe,
            pnl: 0.0, // 향후 실제 PnL 계산 연동
            win_rate: 0.0,
            trades_count: status.stats.signals_generated, // 신호 수를 거래 수로 사용
            risk_profile: None, // 향후 DB에서 조회하여 연동
            allocated_capital: None, // 향후 DB에서 조회하여 연동
        });
    }

    // ID로 정렬
    strategies.sort_by(|a, b| a.id.cmp(&b.id));

    let running_count = strategies.iter().filter(|s| s.status == "Running").count();
    let total = strategies.len();

    Json(StrategiesListResponse {
        strategies,
        total,
        running: running_count,
    })
}

/// 특정 전략 상세 조회.
///
/// GET /api/v1/strategies/{id}
pub async fn get_strategy(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<StrategyDetailResponse>, (StatusCode, Json<ApiError>)> {
    let engine = state.strategy_engine.read().await;

    // 상태 조회
    let status = engine
        .get_strategy_status(&id)
        .await
        .map_err(engine_error_to_response)?;

    // 설정 조회
    let config = engine
        .get_strategy_config(&id)
        .await
        .map_err(engine_error_to_response)?;

    // 전략 타입 조회
    let strategy_type = engine
        .get_strategy_type(&id)
        .await
        .map_err(engine_error_to_response)?;

    Ok(Json(StrategyDetailResponse {
        id,
        strategy_type,
        status,
        config,
    }))
}

/// 전략 시작.
///
/// POST /api/v1/strategies/{id}/start
pub async fn start_strategy(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<StrategyActionResponse>, (StatusCode, Json<ApiError>)> {
    let engine = state.strategy_engine.read().await;

    // 전략 이름 가져오기 (브로드캐스트용)
    let strategy_name = engine
        .get_strategy_status(&id)
        .await
        .map(|s| s.name)
        .unwrap_or_else(|_| id.clone());

    match engine.start_strategy(&id).await {
        Ok(()) => {
            // WebSocket 브로드캐스트: 전략 시작 알림
            state.broadcast(ServerMessage::StrategyUpdate(StrategyUpdateData {
                strategy_id: id.clone(),
                name: strategy_name,
                running: true,
                event: "started".to_string(),
                data: None,
                timestamp: Utc::now().timestamp_millis(),
            }));

            Ok(Json(StrategyActionResponse {
                success: true,
                strategy_id: id.clone(),
                action: "start".to_string(),
                message: format!("Strategy '{}' started successfully", id),
            }))
        }
        Err(err) => Err(engine_error_to_response(err)),
    }
}

/// 전략 중지.
///
/// POST /api/v1/strategies/{id}/stop
pub async fn stop_strategy(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<StrategyActionResponse>, (StatusCode, Json<ApiError>)> {
    let engine = state.strategy_engine.read().await;

    // 전략 이름 가져오기 (브로드캐스트용)
    let strategy_name = engine
        .get_strategy_status(&id)
        .await
        .map(|s| s.name)
        .unwrap_or_else(|_| id.clone());

    match engine.stop_strategy(&id).await {
        Ok(()) => {
            // WebSocket 브로드캐스트: 전략 중지 알림
            state.broadcast(ServerMessage::StrategyUpdate(StrategyUpdateData {
                strategy_id: id.clone(),
                name: strategy_name,
                running: false,
                event: "stopped".to_string(),
                data: None,
                timestamp: Utc::now().timestamp_millis(),
            }));

            Ok(Json(StrategyActionResponse {
                success: true,
                strategy_id: id.clone(),
                action: "stop".to_string(),
                message: format!("Strategy '{}' stopped successfully", id),
            }))
        }
        Err(err) => Err(engine_error_to_response(err)),
    }
}

/// 전략 설정 변경.
///
/// PUT /api/v1/strategies/{id}/config
pub async fn update_config(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(request): Json<UpdateConfigRequest>,
) -> Result<Json<StrategyActionResponse>, (StatusCode, Json<ApiError>)> {
    let engine = state.strategy_engine.read().await;

    // 전략 상태 가져오기 (브로드캐스트용)
    let (strategy_name, is_running) = engine
        .get_strategy_status(&id)
        .await
        .map(|s| (s.name, s.running))
        .unwrap_or_else(|_| (id.clone(), false));

    match engine.update_strategy_config(&id, request.config.clone()).await {
        Ok(()) => {
            // DB에도 설정 저장 (DB가 연결된 경우)
            if let Some(pool) = state.db_pool.as_ref() {
                if let Err(e) = StrategyRepository::update_config(pool, &id, request.config.clone()).await {
                    tracing::warn!(strategy_id = %id, error = %e, "Failed to persist strategy config to DB");
                    // DB 저장 실패해도 메모리 업데이트는 성공했으므로 계속 진행
                }
            }

            // WebSocket 브로드캐스트: 설정 변경 알림
            state.broadcast(ServerMessage::StrategyUpdate(StrategyUpdateData {
                strategy_id: id.clone(),
                name: strategy_name,
                running: is_running,
                event: "config_updated".to_string(),
                data: Some(request.config),
                timestamp: Utc::now().timestamp_millis(),
            }));

            Ok(Json(StrategyActionResponse {
                success: true,
                strategy_id: id.clone(),
                action: "update_config".to_string(),
                message: format!("Strategy '{}' configuration updated successfully", id),
            }))
        }
        Err(err) => Err(engine_error_to_response(err)),
    }
}

/// 전략 리스크 설정 변경.
///
/// PUT /api/v1/strategies/{id}/risk
pub async fn update_risk_settings(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(request): Json<UpdateRiskSettingsRequest>,
) -> Result<Json<StrategyActionResponse>, (StatusCode, Json<ApiError>)> {
    // DB가 연결된 경우에만 동작
    let pool = state.db_pool.as_ref().ok_or_else(|| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::new("DB_NOT_CONNECTED", "Database not connected")),
        )
    })?;

    // 할당 자본을 Decimal로 변환
    let allocated_capital = request.allocated_capital.map(|v| Decimal::try_from(v).unwrap_or(Decimal::ZERO));

    // DB에 리스크 설정 업데이트
    StrategyRepository::update_risk_settings(
        pool,
        &id,
        request.risk_config.clone(),
        allocated_capital,
        request.risk_profile.as_deref(),
    )
    .await
    .map_err(|e| {
        tracing::error!("Failed to update risk settings: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::new("DB_ERROR", format!("Failed to update risk settings: {}", e))),
        )
    })?;

    // 전략 이름 가져오기 (브로드캐스트용)
    let engine = state.strategy_engine.read().await;
    let (strategy_name, is_running) = engine
        .get_strategy_status(&id)
        .await
        .map(|s| (s.name, s.running))
        .unwrap_or_else(|_| (id.clone(), false));

    // WebSocket 브로드캐스트: 리스크 설정 변경 알림
    state.broadcast(ServerMessage::StrategyUpdate(StrategyUpdateData {
        strategy_id: id.clone(),
        name: strategy_name,
        running: is_running,
        event: "risk_updated".to_string(),
        data: Some(serde_json::json!({
            "risk_profile": request.risk_profile,
            "allocated_capital": request.allocated_capital,
        })),
        timestamp: Utc::now().timestamp_millis(),
    }));

    Ok(Json(StrategyActionResponse {
        success: true,
        strategy_id: id.clone(),
        action: "update_risk".to_string(),
        message: format!("Strategy '{}' risk settings updated successfully", id),
    }))
}

/// 전략 복사 (파생 전략 생성).
///
/// POST /api/v1/strategies/{id}/clone
pub async fn clone_strategy(
    State(state): State<Arc<AppState>>,
    Path(source_id): Path<String>,
    Json(request): Json<CloneStrategyRequest>,
) -> Result<Json<CloneStrategyResponse>, (StatusCode, Json<ApiError>)> {
    // DB가 연결된 경우에만 동작
    let pool = state.db_pool.as_ref().ok_or_else(|| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::new("DB_NOT_CONNECTED", "Database not connected")),
        )
    })?;

    // 원본 전략 조회
    let source = StrategyRepository::get_by_id(pool, &source_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::new("DB_ERROR", format!("Failed to get source strategy: {}", e))),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ApiError::new("STRATEGY_NOT_FOUND", format!("Strategy '{}' not found", source_id))),
            )
        })?;

    // 전략 타입 확인
    let strategy_type = source.strategy_type.clone().unwrap_or_else(|| "unknown".to_string());

    // 새 전략 ID 생성
    let new_id = format!("{}_{}", strategy_type, Uuid::new_v4().to_string()[..8].to_string());

    // 파라미터 병합 (원본 + 오버라이드)
    let merged_config = if let Some(override_params) = request.override_params {
        let mut base = source.config.clone();
        if let (Some(base_obj), Some(override_obj)) = (base.as_object_mut(), override_params.as_object()) {
            for (key, value) in override_obj {
                base_obj.insert(key.clone(), value.clone());
            }
        }
        base
    } else {
        source.config.clone()
    };

    // 리스크 설정 병합
    let merged_risk = request.override_risk_config.unwrap_or(source.risk_limits.clone());

    // 할당 자본 설정
    let allocated_capital = request
        .override_allocated_capital
        .map(|v| Decimal::try_from(v).unwrap_or(Decimal::ZERO))
        .or(source.allocated_capital);

    // 심볼 목록 추출
    let symbols: Vec<String> = source
        .symbols
        .as_ref()
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    // 새 전략 생성
    let input = CreateStrategyInput {
        id: new_id.clone(),
        name: request.new_name.clone(),
        description: source.description.clone(),
        strategy_type: strategy_type.clone(),
        symbols,
        market: source.market.clone().unwrap_or_else(|| "KR".to_string()),
        timeframe: source.timeframe.clone().unwrap_or_else(|| "1d".to_string()),
        config: merged_config.clone(),
        risk_config: Some(merged_risk),
        allocated_capital,
        risk_profile: source.risk_profile.clone(),
    };

    StrategyRepository::create(pool, input).await.map_err(|e| {
        tracing::error!("Failed to create cloned strategy: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::new("DB_ERROR", format!("Failed to create cloned strategy: {}", e))),
        )
    })?;

    // 전략 인스턴스 생성 및 엔진에 등록
    if let Ok(strategy) = create_strategy_instance(&strategy_type) {
        let engine = state.strategy_engine.read().await;
        let _ = engine
            .register_strategy(&new_id, strategy, merged_config, Some(request.new_name.clone()))
            .await;
    }

    // WebSocket 브로드캐스트: 전략 복사 알림
    state.broadcast(ServerMessage::StrategyUpdate(StrategyUpdateData {
        strategy_id: new_id.clone(),
        name: request.new_name.clone(),
        running: false,
        event: "cloned".to_string(),
        data: Some(serde_json::json!({
            "source_id": source_id,
            "strategy_type": strategy_type,
        })),
        timestamp: Utc::now().timestamp_millis(),
    }));

    Ok(Json(CloneStrategyResponse {
        success: true,
        source_id: source_id.clone(),
        new_id: new_id.clone(),
        new_name: request.new_name,
        message: format!("Strategy '{}' cloned to '{}' successfully", source_id, new_id),
    }))
}

/// 엔진 통계 조회.
///
/// GET /api/v1/strategies/stats
pub async fn get_engine_stats(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let engine = state.strategy_engine.read().await;
    let stats = engine.get_engine_stats().await;

    Json(EngineStatsResponse::from(stats))
}

// ==================== router ====================

/// 전략 관리 라우터 생성.
pub fn strategies_router() -> Router<Arc<AppState>> {
    Router::new()
        // 목록, 생성, 통계
        .route("/", get(list_strategies).post(create_strategy))
        .route("/stats", get(get_engine_stats))
        // 개별 전략 조작
        .route("/{id}", get(get_strategy).delete(delete_strategy))
        .route("/{id}/start", post(start_strategy))
        .route("/{id}/stop", post(stop_strategy))
        .route("/{id}/config", put(update_config))
        .route("/{id}/risk", put(update_risk_settings))
        .route("/{id}/clone", post(clone_strategy))
}

// ==================== 테스트 ====================

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_list_strategies_empty() {
        use crate::state::create_test_state;

        let state = Arc::new(create_test_state());
        let app = Router::new()
            .route("/strategies", get(list_strategies))
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/strategies")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let list: StrategiesListResponse = serde_json::from_slice(&body).unwrap();

        assert_eq!(list.total, 0);
        assert_eq!(list.running, 0);
        assert!(list.strategies.is_empty());
    }

    #[tokio::test]
    async fn test_get_strategy_not_found() {
        use crate::state::create_test_state;

        let state = Arc::new(create_test_state());
        let app = Router::new()
            .route("/strategies/{id}", get(get_strategy))
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/strategies/nonexistent")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error: ApiError = serde_json::from_slice(&body).unwrap();

        assert_eq!(error.code, "STRATEGY_NOT_FOUND");
    }

    #[tokio::test]
    async fn test_start_strategy_not_found() {
        use crate::state::create_test_state;

        let state = Arc::new(create_test_state());
        let app = Router::new()
            .route("/strategies/{id}/start", post(start_strategy))
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/strategies/nonexistent/start")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_engine_stats() {
        use crate::state::create_test_state;

        let state = Arc::new(create_test_state());
        let app = Router::new()
            .route("/strategies/stats", get(get_engine_stats))
            .with_state(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/strategies/stats")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let stats: EngineStatsResponse = serde_json::from_slice(&body).unwrap();

        assert_eq!(stats.total_strategies, 0);
        assert_eq!(stats.running_strategies, 0);
    }

    #[test]
    fn test_api_error_creation() {
        let error = ApiError::new("TEST_ERROR", "Test message");
        assert_eq!(error.code, "TEST_ERROR");
        assert_eq!(error.message, "Test message");
    }

    #[test]
    fn test_engine_stats_conversion() {
        let stats = EngineStats {
            total_strategies: 5,
            running_strategies: 2,
            total_signals_generated: 100,
            total_orders_filled: 50,
            total_market_data_processed: 1000,
        };

        let response: EngineStatsResponse = stats.into();
        assert_eq!(response.total_strategies, 5);
        assert_eq!(response.running_strategies, 2);
        assert_eq!(response.total_signals_generated, 100);
    }
}
