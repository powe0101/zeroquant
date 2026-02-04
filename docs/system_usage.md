# 주요 시스템 사용 가이드

> **버전**: v0.6.0 | **최종 업데이트**: 2026-02-04

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

---

## 🏆 Global Score 랭킹 시스템 (v0.6.0)

7Factor 기반 종합 점수로 종목 순위를 산출합니다.

### 7Factor 팩터

| 팩터 | 가중치 | 설명 |
|------|--------|------|
| Momentum | 0.10 | ERS + MACD 기울기 + RSI 보너스 |
| Value | - | PER, PBR 기반 |
| Quality | - | ROE, 부채비율 |
| Volatility | - | ATR, VolZ 안정성 |
| Liquidity | 0.13 | 거래대금 퍼센타일 |
| Growth | - | 매출/이익 성장률 |
| Sentiment | - | 이격도, RSI 중립도 |

### 관련 API

| 엔드포인트 | 설명 |
|------------|------|
| `GET /api/v1/ranking` | 글로벌 랭킹 조회 (market, route_state 필터) |
| `GET /api/v1/ranking/7factor/{ticker}` | 개별 종목 7Factor |
| `POST /api/v1/ranking/7factor/batch` | 배치 조회 |

### 사용 예시

```bash
# 글로벌 랭킹 TOP 10
curl "http://localhost:3000/api/v1/ranking?limit=10"

# KR 시장, ATTACK 상태만
curl "http://localhost:3000/api/v1/ranking?market=KR&route_state=ATTACK"

# 개별 종목 7Factor
curl "http://localhost:3000/api/v1/ranking/7factor/005930"
```

---

## ⭐ 관심종목 (Watchlist) 시스템 (v0.6.0)

사용자별 관심종목 그룹을 관리합니다.

### 관련 API

| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| `/api/v1/watchlist` | GET | 그룹 목록 조회 |
| `/api/v1/watchlist` | POST | 그룹 생성 |
| `/api/v1/watchlist/{id}/items` | POST | 종목 추가 |
| `/api/v1/watchlist/{id}/items/{symbol}` | DELETE | 종목 삭제 |

### 사용 예시

```bash
# 관심종목 그룹 생성
curl -X POST "http://localhost:3000/api/v1/watchlist" \
  -H "Content-Type: application/json" \
  -d '{"name": "반도체 관련주", "description": "반도체 섹터 핵심 종목"}'

# 종목 추가
curl -X POST "http://localhost:3000/api/v1/watchlist/1/items" \
  -H "Content-Type: application/json" \
  -d '{"symbol": "005930"}'
```

---

## 📊 Multi Timeframe 시스템 (v0.6.0)

다중 타임프레임 캔들 데이터를 동시에 조회합니다.

### 관련 API

| 엔드포인트 | 설명 |
|------------|------|
| `GET /api/v1/market/klines/multi` | 다중 타임프레임 Kline 조회 |

### 사용 예시

```bash
# 5분, 1시간, 1일 타임프레임 동시 조회
curl "http://localhost:3000/api/v1/market/klines/multi?symbol=005930&timeframes=5m,1h,1d&limit=50"
```

### 응답 형식

```json
{
  "symbol": "005930",
  "data": {
    "5m": [{ "timestamp": 1706436000, "open": 50000, ... }],
    "1h": [...],
    "1d": [...]
  }
}
```

---

## 🔄 Standalone Data Collector (v0.6.0)

API 서버와 독립적으로 데이터를 수집하는 바이너리입니다.

### 실행 방법

```bash
# 빌드
cargo build --release --bin trader-collector

# 전체 워크플로우 1회 실행
./target/release/trader-collector run-all

# 데몬 모드 (주기적 자동 실행)
./target/release/trader-collector daemon
```

### 개별 명령어

```bash
# 심볼 동기화
trader-collector sync-symbols

# OHLCV 수집
trader-collector collect-ohlcv

# 지표 동기화
trader-collector sync-indicators

# GlobalScore 동기화
trader-collector sync-global-scores
```

### 워크플로우 순서 (run-all)

1. 심볼 동기화 (KRX/Binance/Yahoo)
2. KRX Fundamental 동기화 (KRX API 활성화 시)
3. OHLCV 수집 (일봉)
4. 분석 지표 동기화 (RouteState, MarketRegime)
5. GlobalScore 동기화 (7Factor)

**참조**: `docs/collector_quick_start.md`

---

## 📈 Reality Check 검증 시스템

전일 추천 종목의 익일 실제 성과를 자동 검증합니다.

### 관련 API

| 엔드포인트 | 설명 |
|------------|------|
| `GET /api/v1/reality-check/stats` | 검증 통계 조회 |
| `GET /api/v1/reality-check/history?days=30` | 이력 조회 |

### 출력 지표

- 추천 종목 승률 (전체, 7일, 30일)
- 평균 수익률
- 레짐별 성과 (MarketRegime 연동)
