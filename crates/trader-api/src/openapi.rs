//! OpenAPI 문서화 설정.
//!
//! utoipa를 사용하여 REST API의 OpenAPI 3.0 스펙을 생성합니다.
//! Swagger UI는 `/swagger-ui` 경로에서 사용 가능합니다.
//!
//! # 자동 생성 구조
//!
//! 각 라우트 모듈은 자체 스키마를 정의하고, 중앙 `ApiDoc`에서 자동으로 집계합니다.
//! 새로운 엔드포인트를 추가할 때:
//!
//! 1. 응답/요청 타입에 `#[derive(ToSchema)]` 추가
//! 2. 핸들러에 `#[utoipa::path(...)]` 어노테이션 추가
//! 3. 이 파일의 `components(schemas(...))` 및 `paths(...)` 섹션에 추가
//!
//! # 외부 타입 처리
//!
//! 외부 크레이트의 타입은 두 가지 방법으로 처리:
//! - 해당 크레이트에 `ToSchema` 구현 추가
//! - 또는 `#[schema(value_type = Object)]` 사용하여 JSON 객체로 처리
//!
//! # 사용법
//!
//! ```rust,ignore
//! use trader_api::openapi::swagger_ui_router;
//!
//! let app = Router::new()
//!     .merge(swagger_ui_router());
//! ```

use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use axum::Router;

// ==================== 각 모듈에서 스키마 Import ====================
// 새로운 엔드포인트 추가 시 아래에 import 추가

use crate::routes::{
    // Health 모듈
    HealthResponse, ComponentHealth, ComponentStatus,
    // Strategies 모듈 (기본)
    StrategiesListResponse,
    strategies::StrategyListItem,
    ApiError,
};

// ==================== OpenAPI 문서 정의 ====================

/// Trader API 문서.
///
/// 모든 엔드포인트와 스키마를 포함하는 OpenAPI 3.0 스펙입니다.
/// 새로운 엔드포인트 추가 시 `paths(...)` 섹션에 핸들러 함수 참조를 추가하세요.
#[derive(OpenApi)]
#[openapi(
    info(
        title = "Trader API",
        version = "0.1.0",
        description = r#"
# 트레이딩 봇 REST API

전략 관리, 백테스트, 포트폴리오 분석을 위한 REST API입니다.

## 주요 기능

- **전략 관리**: 트레이딩 전략 생성, 조회, 시작/중지
- **백테스트**: 과거 데이터 기반 전략 성과 분석
- **포트폴리오**: 실시간 포트폴리오 상태 조회
- **시장 데이터**: 실시간 시세 및 차트 데이터

## 인증

대부분의 엔드포인트는 JWT Bearer 토큰 인증이 필요합니다.
`Authorization: Bearer <token>` 헤더를 포함하세요.
"#,
        license(name = "MIT", url = "https://opensource.org/licenses/MIT"),
        contact(
            name = "Trading Bot Team",
            url = "https://github.com/user/trader"
        )
    ),
    servers(
        (url = "http://localhost:3000", description = "로컬 개발 서버"),
    ),
    tags(
        (name = "health", description = "헬스 체크 - 서버 상태 확인"),
        (name = "strategies", description = "전략 관리 - 트레이딩 전략 CRUD"),
        (name = "orders", description = "주문 관리 - 주문 생성/조회/취소"),
        (name = "positions", description = "포지션 - 현재 보유 포지션 조회"),
        (name = "portfolio", description = "포트폴리오 - 계좌 잔고 및 요약"),
        (name = "backtest", description = "백테스트 - 전략 과거 성과 분석"),
        (name = "analytics", description = "분석 - 성과 지표 및 차트"),
        (name = "patterns", description = "패턴 - 캔들/차트 패턴 인식"),
        (name = "market", description = "시장 - 시장 상태 및 시세"),
        (name = "credentials", description = "자격증명 - API 키 관리"),
        (name = "notifications", description = "알림 - 텔레그램 등 알림 설정"),
        (name = "ml", description = "ML - 머신러닝 모델 훈련"),
        (name = "dataset", description = "데이터셋 - 학습 데이터 관리"),
        (name = "simulation", description = "시뮬레이션 - 모의 거래")
    ),
    // ==================== 스키마 등록 ====================
    // 새로운 타입 추가 시 아래에 추가
    components(
        schemas(
            // Health
            HealthResponse,
            ComponentHealth,
            ComponentStatus,
            // Strategies
            StrategiesListResponse,
            StrategyListItem,
            // Common
            ApiError,
        )
    ),
    // ==================== 경로 등록 ====================
    // 새로운 핸들러 추가 시 아래에 추가
    paths(
        // Health
        crate::routes::health::health_check,
        crate::routes::health::health_ready,
        // Strategies
        crate::routes::strategies::list_strategies,
    )
)]
pub struct ApiDoc;

// ==================== Swagger UI 라우터 ====================

/// Swagger UI 라우터 생성.
///
/// 다음 경로에 문서 UI를 마운트합니다:
/// - `/swagger-ui` - Swagger UI 대화형 문서
/// - `/api-docs/openapi.json` - OpenAPI JSON 스펙
///
/// # 사용법
///
/// ```rust,ignore
/// let app = Router::new()
///     .merge(swagger_ui_router());
/// ```
pub fn swagger_ui_router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    SwaggerUi::new("/swagger-ui")
        .url("/api-docs/openapi.json", ApiDoc::openapi())
        .into()
}

// ==================== 테스트 ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_openapi_spec_valid() {
        let spec = ApiDoc::openapi();
        let json = serde_json::to_string_pretty(&spec).unwrap();

        // 기본 정보 확인
        assert!(json.contains("Trader API"));
        assert!(json.contains("0.1.0"));

        // 태그 확인
        assert!(json.contains("health"));
        assert!(json.contains("strategies"));

        // 경로 확인
        assert!(json.contains("/health"));
        assert!(json.contains("/health/ready"));
    }

    #[test]
    fn test_swagger_ui_router_creates() {
        let _router: Router<()> = swagger_ui_router();
    }

    #[test]
    fn test_openapi_contains_schemas() {
        let spec = ApiDoc::openapi();
        let json = serde_json::to_string(&spec).unwrap();

        // 스키마 확인
        assert!(json.contains("HealthResponse"));
        assert!(json.contains("StrategiesListResponse"));
        assert!(json.contains("ApiError"));
    }
}
