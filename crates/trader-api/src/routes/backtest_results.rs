//! 백테스트 결과 저장/조회 API
//!
//! 백테스트 결과를 PostgreSQL에 영구 저장하고 조회하는 기능을 제공합니다.
//!
//! # 엔드포인트
//!
//! - `GET /api/v1/backtest/results` - 저장된 결과 목록 조회
//! - `POST /api/v1/backtest/results` - 결과 저장
//! - `DELETE /api/v1/backtest/results/:id` - 결과 삭제

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::sync::Arc;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::state::AppState;

// ==================== DB 레코드 ====================

/// 백테스트 결과 DB 레코드
#[derive(Debug, Clone, FromRow)]
pub struct BacktestResultRecord {
    pub id: Uuid,
    pub strategy_id: String,
    pub strategy_type: String,
    pub symbol: String,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub initial_capital: Decimal,
    pub slippage_rate: Option<Decimal>,
    pub metrics: serde_json::Value,
    pub config_summary: serde_json::Value,
    pub equity_curve: serde_json::Value,
    pub trades: serde_json::Value,
    pub success: bool,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

// ==================== 요청/응답 타입 ====================

/// 결과 저장 요청
#[derive(Debug, Deserialize)]
pub struct SaveBacktestResultRequest {
    /// 전략 ID (등록된 전략의 고유 ID)
    pub strategy_id: String,
    /// 전략 타입 (sma_crossover, bollinger 등)
    pub strategy_type: String,
    /// 심볼 (다중 자산은 콤마 구분)
    pub symbol: String,
    /// 시작 날짜
    pub start_date: String,
    /// 종료 날짜
    pub end_date: String,
    /// 초기 자본
    pub initial_capital: Decimal,
    /// 슬리피지율
    #[serde(default)]
    pub slippage_rate: Option<Decimal>,
    /// 성과 지표
    pub metrics: serde_json::Value,
    /// 설정 요약
    pub config_summary: serde_json::Value,
    /// 자산 곡선
    pub equity_curve: serde_json::Value,
    /// 거래 내역
    pub trades: serde_json::Value,
    /// 성공 여부
    pub success: bool,
}

/// 저장된 결과 응답
#[derive(Debug, Serialize)]
pub struct BacktestResultResponse {
    pub id: String,
    pub strategy_id: String,
    pub strategy_type: String,
    pub symbol: String,
    pub start_date: String,
    pub end_date: String,
    pub initial_capital: String,
    pub slippage_rate: Option<String>,
    pub metrics: serde_json::Value,
    pub config_summary: serde_json::Value,
    pub equity_curve: serde_json::Value,
    pub trades: serde_json::Value,
    pub success: bool,
    pub created_at: String,
}

impl From<BacktestResultRecord> for BacktestResultResponse {
    fn from(record: BacktestResultRecord) -> Self {
        Self {
            id: record.id.to_string(),
            strategy_id: record.strategy_id,
            strategy_type: record.strategy_type,
            symbol: record.symbol,
            start_date: record.start_date.to_string(),
            end_date: record.end_date.to_string(),
            initial_capital: record.initial_capital.to_string(),
            slippage_rate: record.slippage_rate.map(|r| r.to_string()),
            metrics: record.metrics,
            config_summary: record.config_summary,
            equity_curve: record.equity_curve,
            trades: record.trades,
            success: record.success,
            created_at: record.created_at.to_rfc3339(),
        }
    }
}

/// 결과 목록 조회 쿼리 파라미터
#[derive(Debug, Deserialize)]
pub struct ListResultsQuery {
    /// 전략 ID 필터
    #[serde(default)]
    pub strategy_id: Option<String>,
    /// 전략 타입 필터
    #[serde(default)]
    pub strategy_type: Option<String>,
    /// 결과 수 제한
    #[serde(default = "default_limit")]
    pub limit: i64,
    /// 오프셋
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    50
}

/// 결과 목록 응답
#[derive(Debug, Serialize)]
pub struct ListResultsResponse {
    pub results: Vec<BacktestResultResponse>,
    pub total: i64,
}

/// 저장 성공 응답
#[derive(Debug, Serialize)]
pub struct SaveResultResponse {
    pub id: String,
    pub message: String,
}

// ==================== 핸들러 ====================

/// 저장된 백테스트 결과 목록 조회
pub async fn list_backtest_results(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListResultsQuery>,
) -> impl IntoResponse {
    debug!("백테스트 결과 목록 조회: {:?}", query);

    let pool = match &state.db_pool {
        Some(p) => p,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "error": "데이터베이스가 연결되지 않았습니다"
                })),
            )
                .into_response();
        }
    };

    // 전체 개수 조회
    let count_result: Result<(i64,), sqlx::Error> = sqlx::query_as(
        r#"
        SELECT COUNT(*) as count
        FROM backtest_results
        WHERE deleted_at IS NULL
          AND ($1::text IS NULL OR strategy_id = $1)
          AND ($2::text IS NULL OR strategy_type = $2)
        "#,
    )
    .bind(&query.strategy_id)
    .bind(&query.strategy_type)
    .fetch_one(pool)
    .await;

    let total = match count_result {
        Ok((count,)) => count,
        Err(e) => {
            warn!("결과 개수 조회 실패: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "결과 개수 조회 실패",
                    "details": e.to_string()
                })),
            )
                .into_response();
        }
    };

    // 결과 목록 조회
    let records: Result<Vec<BacktestResultRecord>, sqlx::Error> = sqlx::query_as(
        r#"
        SELECT id, strategy_id, strategy_type, symbol, start_date, end_date,
               initial_capital, slippage_rate, metrics, config_summary,
               equity_curve, trades, success, error_message, created_at, deleted_at
        FROM backtest_results
        WHERE deleted_at IS NULL
          AND ($1::text IS NULL OR strategy_id = $1)
          AND ($2::text IS NULL OR strategy_type = $2)
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4
        "#,
    )
    .bind(&query.strategy_id)
    .bind(&query.strategy_type)
    .bind(query.limit)
    .bind(query.offset)
    .fetch_all(pool)
    .await;

    match records {
        Ok(records) => {
            let results: Vec<BacktestResultResponse> =
                records.into_iter().map(Into::into).collect();

            Json(ListResultsResponse { results, total }).into_response()
        }
        Err(e) => {
            warn!("결과 목록 조회 실패: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "결과 목록 조회 실패",
                    "details": e.to_string()
                })),
            )
                .into_response()
        }
    }
}

/// 백테스트 결과 저장
pub async fn save_backtest_result(
    State(state): State<Arc<AppState>>,
    Json(request): Json<SaveBacktestResultRequest>,
) -> impl IntoResponse {
    debug!("백테스트 결과 저장: strategy_id={}", request.strategy_id);

    let pool = match &state.db_pool {
        Some(p) => p,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "error": "데이터베이스가 연결되지 않았습니다"
                })),
            )
                .into_response();
        }
    };

    // 날짜 파싱
    let start_date = match NaiveDate::parse_from_str(&request.start_date, "%Y-%m-%d") {
        Ok(d) => d,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "시작 날짜 형식이 올바르지 않습니다",
                    "details": e.to_string()
                })),
            )
                .into_response();
        }
    };

    let end_date = match NaiveDate::parse_from_str(&request.end_date, "%Y-%m-%d") {
        Ok(d) => d,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "종료 날짜 형식이 올바르지 않습니다",
                    "details": e.to_string()
                })),
            )
                .into_response();
        }
    };

    // DB에 저장
    let result: Result<(Uuid,), sqlx::Error> = sqlx::query_as(
        r#"
        INSERT INTO backtest_results (
            strategy_id, strategy_type, symbol, start_date, end_date,
            initial_capital, slippage_rate, metrics, config_summary,
            equity_curve, trades, success
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
        "#,
    )
    .bind(&request.strategy_id)
    .bind(&request.strategy_type)
    .bind(&request.symbol)
    .bind(start_date)
    .bind(end_date)
    .bind(request.initial_capital)
    .bind(request.slippage_rate)
    .bind(&request.metrics)
    .bind(&request.config_summary)
    .bind(&request.equity_curve)
    .bind(&request.trades)
    .bind(request.success)
    .fetch_one(pool)
    .await;

    match result {
        Ok((id,)) => {
            info!("백테스트 결과 저장 완료: id={}", id);
            (
                StatusCode::CREATED,
                Json(SaveResultResponse {
                    id: id.to_string(),
                    message: "백테스트 결과가 저장되었습니다".to_string(),
                }),
            )
                .into_response()
        }
        Err(e) => {
            warn!("결과 저장 실패: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "결과 저장 실패",
                    "details": e.to_string()
                })),
            )
                .into_response()
        }
    }
}

/// 백테스트 결과 조회 (단일)
pub async fn get_backtest_result(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    debug!("백테스트 결과 조회: id={}", id);

    let pool = match &state.db_pool {
        Some(p) => p,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "error": "데이터베이스가 연결되지 않았습니다"
                })),
            )
                .into_response();
        }
    };

    let uuid = match Uuid::parse_str(&id) {
        Ok(u) => u,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "유효하지 않은 ID 형식입니다"
                })),
            )
                .into_response();
        }
    };

    let result: Result<BacktestResultRecord, sqlx::Error> = sqlx::query_as(
        r#"
        SELECT id, strategy_id, strategy_type, symbol, start_date, end_date,
               initial_capital, slippage_rate, metrics, config_summary,
               equity_curve, trades, success, error_message, created_at, deleted_at
        FROM backtest_results
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(uuid)
    .fetch_one(pool)
    .await;

    match result {
        Ok(record) => Json(BacktestResultResponse::from(record)).into_response(),
        Err(sqlx::Error::RowNotFound) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": "결과를 찾을 수 없습니다"
            })),
        )
            .into_response(),
        Err(e) => {
            warn!("결과 조회 실패: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "결과 조회 실패",
                    "details": e.to_string()
                })),
            )
                .into_response()
        }
    }
}

/// 백테스트 결과 삭제 (soft delete)
pub async fn delete_backtest_result(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    debug!("백테스트 결과 삭제: id={}", id);

    let pool = match &state.db_pool {
        Some(p) => p,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "error": "데이터베이스가 연결되지 않았습니다"
                })),
            )
                .into_response();
        }
    };

    let uuid = match Uuid::parse_str(&id) {
        Ok(u) => u,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "유효하지 않은 ID 형식입니다"
                })),
            )
                .into_response();
        }
    };

    // Soft delete
    let result: Result<sqlx::postgres::PgQueryResult, sqlx::Error> = sqlx::query(
        r#"
        UPDATE backtest_results
        SET deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(uuid)
    .execute(pool)
    .await;

    match result {
        Ok(ref r) if r.rows_affected() > 0 => {
            info!("백테스트 결과 삭제 완료: id={}", id);
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "message": "백테스트 결과가 삭제되었습니다",
                    "id": id
                })),
            )
                .into_response()
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": "결과를 찾을 수 없습니다"
            })),
        )
            .into_response(),
        Err(e) => {
            warn!("결과 삭제 실패: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "결과 삭제 실패",
                    "details": e.to_string()
                })),
            )
                .into_response()
        }
    }
}

// ==================== 라우터 ====================

/// 백테스트 결과 라우터 생성
pub fn backtest_results_router() -> Router<Arc<AppState>> {
    Router::new()
        // 결과 목록 조회 + 저장 (같은 경로에 GET/POST)
        .route("/", get(list_backtest_results).post(save_backtest_result))
        // 단일 결과 조회 + 삭제 (같은 경로에 GET/DELETE)
        .route("/:id", get(get_backtest_result).delete(delete_backtest_result))
}
