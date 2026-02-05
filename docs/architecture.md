# ZeroQuant Trading Bot - 기술 아키텍처

> 작성일: 2026-02-05
> 버전: 3.1 (v0.7.0 반영)

---

## 시스템 구성도

```
┌─────────────────────────────────────────────────────────────┐
│                  Web Dashboard (Frontend)                    │
│                 SolidJS + TailwindCSS                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ WebSocket + REST API
┌─────────────────────▼───────────────────────────────────────┐
│                   API Gateway (Axum)                         │
│          Authentication & Authorization Layer                │
└─────────┬────────────────────────────────────┬──────────────┘
          │                                    │
┌─────────▼────────────┐          ┌───────────▼──────────────┐
│  Strategy Engine     │          │    Risk Manager          │
│  (Plugin System)     │◄─────────┤  (Real-time Monitor)     │
└─────────┬────────────┘          └───────────┬──────────────┘
          │                                    │
┌─────────▼─────────▼────────────────────────────────────────┐
│                 Order Executor                              │
│       (Position Management, Order Routing)                  │
└─────────┬───────────────────────────────────┬───────────────┘
          │                                   │
┌─────────▼──────────┐          ┌────────────▼──────────────┐
│ Exchange Connector │          │     Data Manager          │
│  (Multi-Exchange)  │          │ (Real-time + Historical)  │
└─────────┬──────────┘          └────────────┬──────────────┘
          │                                   │
          └───────────────┬───────────────────┘
                          │
          ┌───────────────▼───────────────────────────┐
          │      Database Layer                       │
          │ PostgreSQL (Timescale) + Redis            │
          └───────────────────────────────────────────┘
```

---

## 기술 스택

### 백엔드
| 기술 | 버전 | 용도 |
|------|------|------|
| Rust | stable (1.93+) | 시스템 프로그래밍 언어 |
| Tokio | 최신 | 비동기 런타임 |
| Axum | 0.7+ | 웹 프레임워크 |
| SQLx | 0.8+ | 데이터베이스 드라이버 (async, compile-time checked) |
| TimescaleDB | 2.x | 시계열 데이터베이스 (PostgreSQL 15 확장) |
| Redis | 7.x | 캐시, 세션, 실시간 데이터 |

### 프론트엔드
| 기술 | 버전 | 용도 |
|------|------|------|
| SolidJS | 1.8+ | 반응형 UI 프레임워크 |
| TailwindCSS | 3.x | 유틸리티 CSS |
| Lightweight Charts | 4.x | 금융 차트 라이브러리 |
| TanStack Query | 5.x | 서버 상태 관리 |
| Vite | 5.x | 빌드 도구 |

### 데이터 및 분석
| 기술 | 용도 |
|------|------|
| Polars | 고성능 데이터프레임 처리 |
| ta-rs | 기술적 지표 라이브러리 |
| ONNX Runtime | ML 모델 추론 (GPU 가속) |
| KRX OPEN API | 국내 주식 OHLCV/Fundamental 데이터 |
| Yahoo Finance | 해외 주식/암호화폐 OHLCV 데이터 |
| ts-rs | TypeScript 바인딩 자동 생성 |

### 인프라
| 기술 | 용도 |
|------|------|
| Podman / Docker | 컨테이너화 |
| Docker Compose | 멀티 컨테이너 오케스트레이션 |
| tracing | 구조화된 로깅 |

---

## 프로젝트 구조

```
d:\Trader\
├── Cargo.toml                 # Workspace 루트
├── .env.example               # 환경 변수 템플릿
├── docker-compose.yml         # Docker 서비스 정의
│
├── crates/                    # Rust 크레이트 (백엔드)
│   ├── trader-core/           # 도메인 모델 (2,917줄)
│   │   ├── order.rs           # 주문 타입 정의
│   │   ├── position.rs        # 포지션 타입 정의
│   │   ├── trade.rs           # 거래 기록
│   │   ├── signal.rs          # 전략 신호
│   │   └── symbol.rs          # 심볼 정의
│   │
│   ├── trader-api/            # REST API 서버 (20,000+줄)
│   │   ├── routes/            # 17개 API 라우트
│   │   │   ├── backtest.rs    # 백테스트 실행
│   │   │   ├── strategies.rs  # 전략 CRUD
│   │   │   ├── portfolio.rs   # 포트폴리오 조회
│   │   │   └── ...
│   │   ├── openapi.rs         # OpenAPI 3.0 스펙 중앙 집계 [v0.7.0]
│   │   ├── state.rs           # 앱 상태 관리
│   │   ├── websocket.rs       # 실시간 통신
│   │   └── main.rs            # 서버 엔트리포인트 (Swagger UI: /swagger-ui)
│   │
│   ├── trader-strategy/       # 전략 엔진 (16,000+줄)
│   │   ├── strategies/        # 16개 통합 전략 (v0.7.0 리팩토링)
│   │   │   ├── common/            # 공통 모듈 (v0.7.0 대폭 확장)
│   │   │   │   ├── exit_config.rs      # 청산 설정 프리셋 [v0.7.0]
│   │   │   │   ├── global_score_utils.rs # GlobalScore 유틸리티 [v0.7.0]
│   │   │   │   ├── indicators.rs       # 기술 지표 (RSI, SMA, BB 등)
│   │   │   │   ├── position_sizing.rs  # 포지션 사이징
│   │   │   │   ├── risk_checks.rs      # 리스크 검증
│   │   │   │   └── signal_filters.rs   # 신호 필터링
│   │   │   ├── day_trading.rs     # 단타/그리드 (Grid, Market Interest Day 통합)
│   │   │   ├── mean_reversion.rs  # 평균회귀 (RSI, Bollinger 통합)
│   │   │   ├── rotation.rs        # 모멘텀 로테이션 (4개 전략 통합)
│   │   │   ├── asset_allocation.rs # 자산배분 (HAA/XAA/BAA/All Weather 통합)
│   │   │   └── ...
│   │   ├── engine.rs          # 전략 실행 엔진
│   │   └── registry.rs        # 전략 레지스트리
│   │
│   ├── trader-risk/           # 리스크 관리 (3,742줄)
│   │   ├── manager.rs         # 중앙 RiskManager
│   │   ├── position_sizing.rs # 포지션 사이징
│   │   ├── stop_loss.rs       # 스톱로스/테이크프로핏
│   │   ├── limits.rs          # 일일 손실 한도
│   │   ├── trailing_stop.rs   # 트레일링 스탑 (4가지 모드)
│   │   └── config.rs          # 리스크 설정
│   │
│   ├── trader-execution/      # 주문 실행 (2,889줄)
│   │   ├── executor.rs        # 주문 실행기
│   │   ├── order_manager.rs   # 주문 관리
│   │   └── position_tracker.rs# 포지션 추적
│   │
│   ├── trader-exchange/       # 거래소 연동 (11,025줄)
│   │   ├── binance/           # Binance 커넥터
│   │   ├── kis_kr/            # 한국투자증권 (국내)
│   │   ├── kis_us/            # 한국투자증권 (해외)
│   │   ├── yahoo/             # Yahoo Finance 데이터
│   │   └── simulation/        # 시뮬레이션 모드
│   │
│   ├── trader-collector/      # Standalone 데이터 수집기
│   │   ├── main.rs            # CLI 엔트리포인트
│   │   ├── config.rs          # 환경변수 설정
│   │   └── modules/           # 수집 모듈
│   │       ├── ohlcv_collect.rs    # OHLCV 수집
│   │       ├── indicator_sync.rs   # 지표 동기화
│   │       ├── global_score_sync.rs# GlobalScore 동기화
│   │       └── fundamental_sync.rs # Fundamental 동기화
│   │
│   ├── trader-data/           # 데이터 관리 (7,000+줄)
│   │   ├── storage/           # TimescaleDB 저장소
│   │   ├── cache/             # Redis 캐시
│   │   └── provider/          # 데이터 프로바이더
│   │       ├── krx_api.rs          # KRX OPEN API (국내 OHLCV/Fundamental)
│   │       ├── naver.rs            # 네이버 금융 크롤러 (국내 Fundamental)
│   │       ├── yahoo_fundamental.rs # Yahoo Finance 펀더멘털 (해외) [v0.7.0]
│   │       └── symbol_info.rs      # Yahoo Finance 심볼 정보
│   │
│   ├── trader-analytics/      # 분석 엔진 (14,000+줄)
│   │   ├── backtest/          # 백테스트 엔진
│   │   │   └── engine.rs      # Multi-TF 백테스트 지원
│   │   ├── metrics.rs         # 성과 지표 14개
│   │   ├── indicators.rs      # 기술 지표 11개
│   │   ├── seven_factor.rs    # 7Factor 스코어링 시스템
│   │   ├── multi_timeframe_helpers.rs # 다중 TF 헬퍼
│   │   ├── timeframe_alignment.rs     # TF 정렬 (Bias 방지)
│   │   └── ml/                # ML 패턴 인식 (4,125줄)
│   │       ├── pattern.rs     # 캔들/차트 패턴 48종
│   │       ├── predictor.rs   # ONNX 추론
│   │       └── features.rs    # Feature Engineering
│   │
│   ├── trader-cli/            # CLI 도구 (2,600+줄)
│   │   ├── commands/
│   │   │   ├── download.rs        # 데이터 다운로드
│   │   │   ├── backtest.rs        # CLI 백테스트
│   │   │   ├── import.rs          # 데이터 임포트
│   │   │   └── strategy_test.rs   # 전략 통합 테스트 (661줄) [v0.7.0]
│   │   └── main.rs
│   │
│   └── trader-notification/   # 알림 서비스 (690줄)
│       ├── telegram.rs        # 텔레그램 봇
│       └── discord.rs         # Discord 웹훅
│
├── migrations/                # DB 마이그레이션 (7개 통합, v0.7.0)
│   ├── 01_core_foundation.sql      # 기본 스키마, ENUM, 확장
│   ├── 02_data_management.sql      # 심볼 정보, OHLCV, 펀더멘털
│   ├── 03_trading_analytics.sql    # 매매일지, 포트폴리오 분석
│   ├── 04_strategy_signals.sql     # 전략, 신호, 알림 시스템
│   ├── 05_evaluation_ranking.sql   # Reality Check, 랭킹 시스템
│   ├── 06_user_settings.sql        # 관심종목, 스크리닝 프리셋
│   └── README.md                   # 마이그레이션 가이드
│
├── frontend/                  # 웹 대시보드
│   ├── src/
│   │   ├── pages/             # 11개 페이지 (Lazy Loading)
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Backtest.tsx
│   │   │   ├── Strategies.tsx
│   │   │   ├── GlobalRanking.tsx  # 글로벌 랭킹
│   │   │   ├── SymbolDetail.tsx   # 종목 상세
│   │   │   └── ...
│   │   ├── components/        # UI 컴포넌트 (8,000+줄)
│   │   │   ├── charts/        # 차트 컴포넌트 20개+
│   │   │   │   ├── MultiTimeframeChart.tsx
│   │   │   │   ├── VolumeProfile.tsx
│   │   │   │   └── ...
│   │   │   ├── strategy/      # 전략 컴포넌트
│   │   │   │   └── MultiTimeframeSelector.tsx
│   │   │   ├── screening/     # 스크리닝 컴포넌트
│   │   │   └── ui/            # 공통 UI (VirtualizedTable 등)
│   │   ├── api/               # API 클라이언트
│   │   ├── hooks/             # 커스텀 훅 (useStrategies, useJournal 등)
│   │   └── types/generated/   # ts-rs 자동 생성 타입
│   ├── package.json
│   └── vite.config.ts         # manualChunks 코드 스플리팅
│
├── config/                    # 설정 파일
├── tests/                     # 통합 테스트
└── docs/                      # 문서
    ├── architecture.md        # (이 문서)
    ├── api.md                 # API 문서
    ├── STRATEGY_COMPARISON.md # 전략 비교
    └── todo.md                # TODO 목록
```

---

## 크레이트 의존성 그래프

```
                    ┌────────────────┐
                    │  trader-api    │
                    │  (Entry Point) │
                    └───────┬────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌────────────────┐  ┌───────────────┐
│trader-strategy│  │ trader-risk    │  │trader-exchange│
│   (Signals)   │  │ (Validation)   │  │   (Market)    │
└───────┬───────┘  └───────┬────────┘  └───────┬───────┘
        │                  │                   │
        └──────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │trader-exec  │
                    │(Order Flow) │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
      ┌────────────┐ ┌──────────┐ ┌────────────┐
      │trader-data │ │trader-   │ │trader-     │
      │ (Storage)  │ │analytics │ │notification│
      └──────┬─────┘ └────┬─────┘ └────────────┘
             │            │
             ▼            ▼
      ┌────────────────────────┐
      │     trader-core        │
      │   (Domain Models)      │
      └────────────────────────┘
```

---

## 데이터 흐름

### 1. 백테스트 플로우

```
Frontend (Backtest.tsx)
    │
    │ POST /api/v1/backtest/run
    ▼
API Layer (backtest.rs)
    │
    │ 1. 파라미터 검증
    │ 2. 히스토리컬 데이터 로드
    ▼
Data Layer (trader-data)
    │
    │ TimescaleDB에서 OHLCV 조회
    ▼
Strategy Engine (trader-strategy)
    │
    │ 전략 실행, 신호 생성
    ▼
Backtest Engine (trader-analytics)
    │
    │ 1. 주문 시뮬레이션
    │ 2. 슬리피지/수수료 적용
    │ 3. 포지션 관리
    │ 4. 성과 지표 계산
    ▼
API Layer
    │
    │ BacktestResult 반환
    ▼
Frontend
    │
    │ 차트 및 통계 렌더링
    ▼
```

### 2. 실시간 트레이딩 플로우

```
Exchange WebSocket
    │
    │ 실시간 시세 수신
    ▼
Data Layer (캐시)
    │
    │ Redis에 틱 데이터 저장
    ▼
Strategy Engine
    │
    │ 전략 평가, 신호 생성
    ▼
Risk Manager                    ◄── 검증 실패 시 거부
    │
    │ 1. 포지션 크기 검증
    │ 2. 일일 손실 한도 확인
    │ 3. 변동성 필터 적용
    ▼
Order Executor
    │
    │ 1. 주문 생성
    │ 2. 스톱로스/테이크프로핏 자동 생성
    ▼
Exchange Connector
    │
    │ 거래소 API 호출
    ▼
Notification Service
    │
    │ 텔레그램/Discord 알림
    ▼
```

---

## 리스크 관리 아키텍처

### 검증 파이프라인

```
Signal (from Strategy)
    │
    ▼
┌────────────────────────────────────────────────┐
│              RiskManager.validate_order()       │
├────────────────────────────────────────────────┤
│ 1. 일일 손실 한도 확인                          │
│    - can_trade() → false면 거부                │
├────────────────────────────────────────────────┤
│ 2. 심볼 활성화 확인                             │
│    - 비활성 심볼이면 거부                       │
├────────────────────────────────────────────────┤
│ 3. 변동성 필터                                  │
│    - volatility > threshold → 거부/경고        │
├────────────────────────────────────────────────┤
│ 4. 포지션 사이징 검증                           │
│    - 단일 포지션 한도 (10%)                    │
│    - 총 노출 한도 (50%)                        │
│    - 동시 포지션 제한 (10개)                   │
│    - 최소 주문 크기                            │
├────────────────────────────────────────────────┤
│ 5. 일일 손실 경고                               │
│    - 70%+ 경고, 90%+ 위험                      │
└────────────────────────────────────────────────┘
    │
    ▼
Order Execution (if valid)
```

### 트레일링 스탑 모드

| 모드 | 동작 |
|------|------|
| FixedPercentage | 고정 비율로 가격 추적 (기본 1.5%) |
| AtrBased | ATR × 배수로 변동성 기반 추적 |
| Step-Based | 수익률 구간별 다른 추적 비율 |
| Parabolic SAR | 가속 계수 기반 포물선 추적 |

---

## 데이터베이스 스키마

### TimescaleDB Hypertables

| 테이블 | 파티션 키 | 용도 |
|--------|----------|------|
| klines | timestamp | 분봉/일봉 OHLCV |
| ohlcv | timestamp | Yahoo Finance 캐시 |
| trade_ticks | timestamp | 틱 데이터 |
| credential_access_logs | accessed_at | 접근 로그 |

### 주요 테이블

| 테이블 | 설명 |
|--------|------|
| symbols | 심볼 정의 |
| orders | 주문 기록 |
| trades | 체결 기록 |
| positions | 포지션 |
| strategies | 등록된 전략 |
| exchange_credentials | 암호화된 API 키 |
| telegram_settings | 텔레그램 설정 |
| backtest_results | 백테스트 결과 |
| portfolio_equity_history | 자산 곡선 |

---

## 실행 환경

### Docker 구성 (인프라만)

| 서비스 | 포트 | 설명 |
|--------|------|------|
| timescaledb | 5432 | TimescaleDB (PostgreSQL 15) |
| redis | 6379 | Redis 7 |

### 로컬 실행

API 서버와 프론트엔드는 로컬에서 직접 실행합니다:

```bash
# 인프라 시작
docker-compose up -d timescaledb redis

# API 서버 (별도 터미널)
export DATABASE_URL=postgresql://trader:trader_secret@localhost:5432/trader
export REDIS_URL=redis://localhost:6379
cargo run --bin trader-api --features ml --release

# 프론트엔드 (별도 터미널)
cd frontend && npm run dev
```

### ML 훈련 (선택적)

```bash
docker-compose --profile ml run --rm trader-ml python scripts/train_ml_model.py
```

---

## API 엔드포인트 요약

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/health` | GET | 헬스 체크 |
| `/api/v1/strategies` | GET, POST, PUT, DELETE | 전략 CRUD |
| `/api/v1/strategies/{id}/timeframes` | GET, PUT | 다중 타임프레임 설정 |
| `/api/v1/backtest/run` | POST | 백테스트 실행 (Multi-TF 지원) |
| `/api/v1/backtest/results` | GET, POST | 결과 저장/조회 |
| `/api/v1/market/klines/multi` | GET | 다중 타임프레임 Kline 조회 |
| `/api/v1/orders` | GET, POST | 주문 관리 |
| `/api/v1/positions` | GET | 포지션 조회 |
| `/api/v1/portfolio` | GET | 포트폴리오 조회 |
| `/api/v1/journal/*` | GET, POST | 매매일지 |
| `/api/v1/ranking` | GET | 글로벌 스코어 랭킹 |
| `/api/v1/ranking/7factor/{ticker}` | GET | 7Factor 스코어 |
| `/api/v1/screening` | GET, POST | 종목 스크리닝 |
| `/api/v1/watchlist` | GET, POST, DELETE | 관심종목 관리 |
| `/api/v1/analytics/*` | GET | 성과 분석 |
| `/api/v1/credentials` | GET, POST, DELETE | API 키 관리 |
| `/api/v1/notifications/*` | GET, POST | 알림 설정 |
| `/api/v1/ml/*` | GET, POST | ML 훈련 |
| `/api/v1/dataset/*` | GET, POST | 데이터셋 관리 |
| `/api/v1/simulation/*` | POST | 시뮬레이션 제어 |
| `/ws` | WebSocket | 실시간 스트림 (Kline 포함) |

---

## 보안

### 자격증명 암호화
- **알고리즘**: AES-256-GCM
- **키 관리**: 환경 변수 또는 Docker Secret
- **저장**: `exchange_credentials` 테이블 (암호화된 상태)

### API 보안
- Rate Limiting (향후 구현)
- CORS 설정
- 입력 유효성 검증 (Validator)

---

## 성능 최적화

### TimescaleDB
- Hypertable 자동 파티셔닝
- 압축 정책 (7일 이상 데이터)
- 연속 집계 (continuous aggregates)

### Redis 캐싱
- 실시간 시세 데이터
- 세션 관리
- Rate Limit 카운터

### Rust 최적화
- async/await 비동기 처리
- Zero-copy 직렬화
- 컴파일 타임 SQL 검증 (SQLx)

---

## 데이터 프로바이더 아키텍처

### 이중화 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    Data Provider Layer                       │
├──────────────────────┬──────────────────────────────────────┤
│   KRX OPEN API       │          Yahoo Finance                │
│   (국내 주식)         │    (해외 주식 / 암호화폐)              │
├──────────────────────┼──────────────────────────────────────┤
│ • OHLCV 데이터       │ • OHLCV 데이터                        │
│ • PER/PBR/배당률     │ • 심볼 정보                           │
│ • 섹터/업종 정보     │ • Fundamental (Yahoo Quote)           │
│ • 시가총액           │ • 실시간 시세 (Fallback)              │
└──────────────────────┴──────────────────────────────────────┘
         │                          │
         └──────────┬───────────────┘
                    │
         ┌──────────▼──────────┐
         │   DataProviderConfig │
         │ ────────────────────│
         │ krx_api_enabled     │  ← PROVIDER_KRX_API_ENABLED
         │ yahoo_enabled       │  ← PROVIDER_YAHOO_ENABLED
         └─────────────────────┘
```

### 환경변수 설정

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `PROVIDER_KRX_API_ENABLED` | false | KRX API 활성화 (승인 필요) |
| `PROVIDER_YAHOO_ENABLED` | true | Yahoo Finance 활성화 |

---

## Multi Timeframe 아키텍처

### 데이터 흐름

```
┌─────────────────────────────────────────────────────────────┐
│                 Multi Timeframe Request                      │
│               GET /api/v1/market/klines/multi               │
└─────────────────────┬───────────────────────────────────────┘
                      │
         ┌────────────▼────────────┐
         │   TimeframeAligner      │
         │ ────────────────────────│
         │ • Look-Ahead Bias 방지  │
         │ • 타임프레임 정렬       │
         └────────────┬────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
┌───▼───┐       ┌─────▼─────┐     ┌─────▼─────┐
│ 1분봉  │       │   5분봉   │     │   일봉    │
│(Primary)│       │(Secondary)│     │(Secondary)│
└───┬───┘       └─────┬─────┘     └─────┬─────┘
    │                 │                 │
    └─────────────────┼─────────────────┘
                      │
         ┌────────────▼────────────┐
         │  MultiTimeframeHelpers  │
         │ ────────────────────────│
         │ • analyze_trend()       │
         │ • combine_signals()     │
         │ • detect_divergence()   │
         └─────────────────────────┘
```

---

## 참고 문서

- [API 문서](./api.md)
- [전략 비교](./STRATEGY_COMPARISON.md)
- [TODO 목록](./todo.md)
- [PRD v5.0](./prd.md)
- [KRX API 스펙](./krx_openapi_spec.md)
- [Multi KLine 가이드](./multiple_kline_period_implementation_guide.md)

---

*문서 생성일: 2026-02-04*
