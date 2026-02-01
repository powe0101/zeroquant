# 주요 시스템 사용 가이드

이 문서는 ZeroQuant의 주요 내부 시스템 사용법을 설명합니다.

---

## 🔍 모니터링 에러 추적 시스템

에러 발생 시 구조화된 로그를 수집하고 AI 디버깅에 활용합니다.

### 사용 예시

```rust
use trader_api::monitoring::{global_tracker, ErrorRecordBuilder, ErrorSeverity, ErrorCategory};

// 에러 기록
let record = ErrorRecordBuilder::new("데이터베이스 쿼리 실패")
    .severity(ErrorSeverity::Error)
    .category(ErrorCategory::Database)
    .entity("AAPL")  // 관련 티커/ID
    .with_context("query", "SELECT * FROM ...")
    .raw_error(&e)
    .build();

global_tracker().record(record);

// 최근 에러 조회
let recent_errors = global_tracker().get_recent(10);
let stats = global_tracker().get_stats();
```

### 모니터링 API 엔드포인트

| 엔드포인트 | 설명 |
|------------|------|
| `GET /api/v1/monitoring/errors` | 에러 목록 (필터: severity, category) |
| `GET /api/v1/monitoring/errors/critical` | Critical 에러만 조회 |
| `GET /api/v1/monitoring/stats` | 에러 통계 (심각도별/카테고리별) |
| `GET /api/v1/monitoring/summary` | 시스템 요약 (디버깅용) |

---

## 📊 CSV 심볼 동기화

정적 CSV 파일에서 종목 정보를 DB에 동기화합니다.

### 사용 예시

```rust
use trader_api::tasks::{krx_csv_sync, eod_csv_sync};

// KRX 종목 동기화
let result = krx_csv_sync::sync_krx_from_csv(pool, "data/krx_codes.csv").await?;
let sector_result = krx_csv_sync::update_sectors_from_csv(pool, "data/krx_sector_map.csv").await?;

// 해외 거래소 동기화 (EODData)
let result = eod_csv_sync::sync_eod_exchange(pool, "NYSE", "data/eod_nyse.csv").await?;
let all_results = eod_csv_sync::sync_eod_all(pool, "data/").await?;
```

### 데이터 파일 위치

- `data/krx_codes.csv` - KRX 종목코드 (KOSPI/KOSDAQ)
- `data/krx_sector_map.csv` - KRX 업종 매핑
- `data/eod_*.csv` - 해외 거래소별 종목 (NYSE, NASDAQ 등)

---

## 🔄 심볼 수집 실패 추적

3회 연속 실패 시 자동으로 심볼이 비활성화됩니다.

### 관련 API

| 엔드포인트 | 설명 |
|------------|------|
| `GET /api/v1/symbols/failed` | 실패한 심볼 목록 조회 |
| `POST /api/v1/symbols/{symbol}/reactivate` | 심볼 재활성화 |
| `POST /api/v1/symbols/sync` | 심볼 동기화 실행 |

---

## 📈 스크리닝 시스템

Materialized View (`mv_latest_prices`)를 활용한 고성능 스크리닝.

### 관련 API

| 엔드포인트 | 설명 |
|------------|------|
| `POST /api/v1/screening/filter` | 조건 기반 종목 스크리닝 |
| `GET /api/v1/screening/presets` | 프리셋 목록 조회 |
| `POST /api/v1/screening/refresh-cache` | 캐시 새로고침 |
