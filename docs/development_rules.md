# ZeroQuant 개발 규칙

> 최종 업데이트: 2026-01-31
> 버전: 1.0
> 이 문서는 신규 기능 추가 시 반드시 확인해야 하는 규칙과 고려사항을 정의합니다.

---

## 📋 목차

1. [작업 전 필수 확인](#작업-전-필수-확인)
2. [Rust 백엔드 규칙](#rust-백엔드-규칙)
3. [TypeScript 프론트엔드 규칙](#typescript-프론트엔드-규칙)
4. [데이터베이스 규칙](#데이터베이스-규칙)
5. [API 설계 규칙](#api-설계-규칙)
6. [보안 규칙](#보안-규칙)
7. [테스트 규칙](#테스트-규칙)
8. [전략 추가 체크리스트](#전략-추가-체크리스트)

---

## 작업 전 필수 확인

### 라이브러리 API 검증 (Context7 사용)

> **핵심 원칙**: 학습 데이터 기반 추측으로 코드 작성 금지

```
1. resolve-library-id로 라이브러리 ID 획득
2. query-docs로 구체적인 API 패턴 조회
3. 버전 확인: Cargo.toml, package.json
```

**주의해야 할 라이브러리**:
- **Tokio**: select!, spawn, channel API 변경 빈번
- **Axum**: 0.6 → 0.7에서 Router, State API 변경됨
- **SQLx**: query!, query_as! 매크로 동작 확인 필요
- **SolidJS**: reactivity 패턴 확인

### UI-API 필드 매칭

> **모든 작업 시 UI와 API 필드 매칭을 반드시 확인**

```typescript
// 프론트엔드 타입과 백엔드 응답이 일치해야 함
interface BacktestResult {
  total_return: number;  // API 응답 필드명
  sharpe_ratio: number;
  // ...
}
```

---

## Rust 백엔드 규칙

### 1. 에러 핸들링 - unwrap() 금지

> **`unwrap()` 사용 금지** (테스트 코드 제외)

**✅ 안전한 패턴**:

```rust
// 1. let-else 조기 반환
let Some(value) = optional else {
    return Ok(Vec::new());
};

// 2. ok_or() 에러 전파
let value = optional.ok_or(MyError::NotFound)?;

// 3. unwrap_or() 기본값
let value = optional.unwrap_or_default();

// 4. unwrap_or_else() 계산된 기본값
let timestamp = parse_result.unwrap_or_else(|_| Utc::now());
```

**❌ 금지 패턴**:

```rust
// 프로덕션 코드에서 패닉 발생 가능
let value = option.unwrap();
let result = fallible_fn().unwrap();
```

### 2. Repository 패턴 사용

> **새로운 데이터 접근 로직은 Repository로 분리**

```rust
// repository/my_entity.rs
pub struct MyEntityRepository;

impl MyEntityRepository {
    pub async fn find_by_id(pool: &PgPool, id: &str) -> Result<Option<MyEntity>, sqlx::Error> {
        sqlx::query_as!(MyEntity, "SELECT * FROM my_entities WHERE id = $1", id)
            .fetch_optional(pool)
            .await
    }

    pub async fn create(pool: &PgPool, input: &CreateInput) -> Result<MyEntity, sqlx::Error> {
        // 트랜잭션 필요 시 사용
        let mut tx = pool.begin().await?;
        // ... 작업 ...
        tx.commit().await?;
        Ok(entity)
    }
}
```

**Repository 목록 (9개 구현됨)**:
- `backtest_results.rs`
- `equity_history.rs`
- `execution_cache.rs`
- `orders.rs`
- `portfolio.rs`
- `positions.rs`
- `strategies.rs`
- `symbol_info.rs`
- `klines.rs`

### 3. 비동기 패턴

**락 홀드 최소화**:

```rust
// ✅ 좋은 예 - 빠르게 락 해제
let data = {
    let guard = state.data.read().await;
    guard.clone()
};  // 락 해제
// 락 없이 처리
process_data(data);

// ❌ 나쁜 예 - 락을 잡고 I/O 수행
let guard = state.data.read().await;
let result = expensive_io_operation(&guard).await;  // 락 홀드 중 I/O
```

**CPU 집약 작업 분리**:

```rust
// spawn_blocking으로 CPU 작업 분리
let result = tokio::task::spawn_blocking(move || {
    // CPU 집약적 계산
    heavy_computation()
}).await?;
```

### 4. 입력 검증

> **모든 API 입력에 검증 함수 적용**

```rust
use validator::Validate;

#[derive(Deserialize, Validate)]
pub struct CreateRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: String,

    #[validate(range(min = 100, max = 1_000_000_000))]
    pub initial_capital: f64,

    #[validate(custom(function = "validate_date_format"))]
    pub start_date: String,
}

// 커스텀 검증 함수
fn validate_date_format(date: &str) -> Result<(), ValidationError> {
    if NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
        return Err(ValidationError::new("invalid_date"));
    }
    Ok(())
}
```

### 5. 에러 응답 타입

> **통합 에러 타입 `ApiErrorResponse` 사용**

```rust
use crate::error::ApiErrorResponse;

// 핸들러에서 사용
async fn my_handler() -> Result<Json<MyResponse>, ApiErrorResponse> {
    let data = my_service()
        .await
        .map_err(|e| ApiErrorResponse::internal(e.to_string()))?;
    Ok(Json(data))
}
```

### 6. 트랜잭션 사용

> **다중 쿼리 시 트랜잭션 필수**

```rust
pub async fn complex_operation(pool: &PgPool) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    // 작업 1
    sqlx::query!("UPDATE table1 SET ...")
        .execute(&mut *tx)
        .await?;

    // 작업 2
    sqlx::query!("INSERT INTO table2 ...")
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}
```

### 7. 주석 규칙

> **모든 주석은 한글로 작성**

```rust
/// 백테스트 결과를 저장합니다.
///
/// # Arguments
/// * `pool` - 데이터베이스 연결 풀
/// * `result` - 저장할 백테스트 결과
///
/// # Returns
/// 저장된 결과의 ID를 반환합니다.
pub async fn save_result(pool: &PgPool, result: &BacktestResult) -> Result<String, sqlx::Error> {
    // 기존 결과가 있으면 업데이트, 없으면 삽입
    // ...
}
```

---

## TypeScript 프론트엔드 규칙

### 1. SolidJS 상태 관리

**createStore 사용 (복잡한 상태)**:

```typescript
import { createStore } from 'solid-js/store';

interface PageState {
  filter: 'all' | 'running' | 'stopped';
  modals: {
    add: { open: boolean };
    edit: { open: boolean; id: string | null };
  };
  loading: boolean;
}

const [state, setState] = createStore<PageState>({
  filter: 'all',
  modals: { add: { open: false }, edit: { open: false, id: null } },
  loading: false,
});
```

**createMemo 사용 (계산된 값)**:

```typescript
const filteredItems = createMemo(() => {
  return items().filter(item => item.status === state.filter);
});
```

### 2. 타입 안전성

**any 사용 금지**:

```typescript
// ❌ 금지
const data: any = response.data;

// ✅ 명시적 타입 정의
interface ApiResponse {
  strategies: Strategy[];
  total: number;
}
const data: ApiResponse = response.data;
```

**리터럴 타입 사용**:

```typescript
type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';
type OrderSide = 'buy' | 'sell';
type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M';
```

### 3. 에러 처리

```typescript
<Show when={resource.loading}>
  <LoadingSpinner />
</Show>

<Show when={resource.error}>
  <ErrorBanner
    message={resource.error.message}
    onRetry={() => refetch()}
  />
</Show>

<Show when={resource()}>
  {/* 성공 시 렌더링 */}
</Show>
```

---

## 데이터베이스 규칙

### 1. 마이그레이션 명명

```
migrations/
  001_initial_schema.sql
  002_add_encrypted_credentials.sql
  ...
  014_add_my_feature.sql  # 순번 + 설명
```

### 2. 인덱스 필수 확인

```sql
-- 자주 조회하는 컬럼에 인덱스 추가
CREATE INDEX idx_orders_strategy_id ON orders(strategy_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

### 3. TimescaleDB Hypertable

> **시계열 데이터는 Hypertable로 생성**

```sql
-- 일반 테이블 생성
CREATE TABLE klines (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    open DECIMAL(18,8),
    -- ...
);

-- Hypertable로 변환
SELECT create_hypertable('klines', 'time');
```

---

## API 설계 규칙

### 1. 엔드포인트 명명

```
GET    /api/v1/resources          # 목록 조회
GET    /api/v1/resources/:id      # 단건 조회
POST   /api/v1/resources          # 생성
PUT    /api/v1/resources/:id      # 전체 수정
PATCH  /api/v1/resources/:id      # 부분 수정
DELETE /api/v1/resources/:id      # 삭제
```

### 2. OpenAPI 문서화

> **새 엔드포인트는 utoipa 어노테이션 필수**

```rust
#[utoipa::path(
    get,
    path = "/api/v1/my-resource/{id}",
    params(
        ("id" = String, Path, description = "리소스 ID")
    ),
    responses(
        (status = 200, description = "성공", body = MyResponse),
        (status = 404, description = "리소스 없음")
    ),
    tag = "my-resource"
)]
async fn get_my_resource(Path(id): Path<String>) -> impl IntoResponse {
    // ...
}
```

### 3. 응답 형식 통일

```rust
// 성공 응답
{
    "data": { ... },
    "meta": { "total": 100, "page": 1 }
}

// 에러 응답
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "유효하지 않은 입력입니다",
        "details": { ... }
    }
}
```

---

## 보안 규칙

### 1. API 키 관리

> **환경변수 대신 웹 UI를 통한 암호화 저장**

- 거래소 API 키 → Settings 페이지에서 설정
- 텔레그램 봇 토큰 → Settings 페이지에서 설정
- 모든 민감 정보 → AES-256-GCM 암호화 저장

### 2. 민감 정보 로깅 방지

```rust
// ❌ 금지 - API 키 로깅
tracing::info!("API Key: {}", api_key);

// ✅ 마스킹 처리
tracing::info!("API Key: {}***", &api_key[..4]);

// 또는 secrecy 크레이트 사용
use secrecy::{Secret, ExposeSecret};
let api_key: Secret<String> = Secret::new(key);
```

### 3. 입력 검증

모든 외부 입력에 대해:
- 길이 제한
- 형식 검증
- 범위 검증
- SQL Injection 방지 (prepared statement 사용)

---

## 테스트 규칙

### 1. 테스트 파일 위치

```
crates/trader-strategy/src/strategies/
  rsi.rs
  rsi_test.rs     # 또는 mod.rs 내 #[cfg(test)]

tests/
  integration/
    backtest_test.rs
    api_test.rs
```

### 2. 테스트 명명

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_should_generate_buy_signal_when_rsi_below_threshold() {
        // Given: RSI가 30 이하인 상황
        // When: 신호 생성 호출
        // Then: 매수 신호 반환
    }
}
```

### 3. 테스트에서만 unwrap() 허용

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_something() {
        let result = some_function().unwrap();  // 테스트에서는 허용
        assert_eq!(result, expected);
    }
}
```

---

## 전략 추가 체크리스트

새 전략 추가 시 다음 5곳을 수정해야 합니다:

```
□ 1. crates/trader-strategy/src/strategies/mod.rs
   □ pub mod your_strategy;
   □ pub use your_strategy::*;

□ 2. crates/trader-api/src/routes/strategies.rs
   □ create_strategy_instance() - 전략 인스턴스 생성
   □ get_strategy_default_name() - 한글 이름
   □ get_strategy_default_timeframe() - 기본 타임프레임
   □ get_strategy_default_symbols() - 권장 심볼

□ 3. crates/trader-api/src/routes/backtest/engine.rs
   □ import 추가
   □ run_strategy_backtest() 또는 run_multi_strategy_backtest()

□ 4. config/sdui/strategy_schemas.json
   □ strategies 객체에 전략 스키마 추가 (~50줄)

□ 5. frontend/src/pages/Strategies.tsx
   □ getDefaultTimeframe() switch 문에 case 추가
```

---

## 코드 품질 도구

### rustfmt

```bash
# 포맷팅 실행
cargo fmt --all

# 체크만 (CI용)
cargo fmt --all -- --check
```

### clippy

```bash
# 린트 실행
cargo clippy --all-targets --all-features

# 경고를 에러로 처리 (CI용)
cargo clippy --all-targets --all-features -- -D warnings
```

### 의존성 보안 검사

```bash
cargo audit
```

---

## 참고 문서

| 문서 | 위치 | 용도 |
|------|------|------|
| TODO | `docs/todo.md` | 현재 작업 상태 |
| PRD | `docs/prd.md` | 제품 요구사항 정의 |
| 개선 로드맵 | `docs/improvement_todo.md` | 코드베이스 개선 항목 |
| 아키텍처 | `docs/architecture.md` | 시스템 구조 |
| API 문서 | `docs/api.md` | REST API 명세 |
| CLAUDE.md | 루트 | 세션 컨텍스트 |

---

*이 문서를 신규 기능 구현 전 반드시 검토하세요.*
