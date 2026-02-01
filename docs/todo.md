## 🔴 미구현 작업

### 1. 매매 일지 (Trading Journal) ⭐ 신규

**백엔드**
- [ ] DB 스키마: `trade_executions`, `position_snapshots`
- [ ] 종목별 포지션 집계 (평균 매입가, 가중평균)
- [ ] API 엔드포인트
  - `GET /api/v1/journal/positions`
  - `GET /api/v1/journal/executions`
  - `GET /api/v1/journal/pnl`
  - `POST /api/v1/journal/sync`

**프론트엔드**
- [ ] TradingJournal.tsx 페이지
- [ ] 보유 현황 테이블
- [ ] 체결 내역 타임라인
- [ ] 포지션 비중 차트
- [ ] 손익 분석 대시보드

### 2. 텔레그램 봇 명령어 (낮음)

현재: 푸시 알림만 구현됨

- [ ] Bot API 명령어 핸들러
- [ ] `/portfolio` - 포트폴리오 조회
- [ ] `/status` - 전략 실행 상태
- [ ] `/stop <id>` - 전략 중지
- [ ] `/report` - 리포트 생성

### 3. 미구현 전략 (4개, 선택적)

- [ ] SPAC No-Loss (KR)
- [ ] All at Once ETF (KR)
- [ ] Rotation Savings (KR)
- [ ] Dual KrStock UsBond (KR+US)

### 4. 종목 스크리닝 (Symbol Screening) ⭐ 진행중

**백엔드**
- [x] ScreeningRepository 구현
- [x] ScreeningFilter 조건 모델 정의
- [x] 프리셋 스크리닝 (value, dividend, growth, snowball, large_cap, near_52w_low)
- [x] 스크리닝 API 라우트 구현
  - `POST /api/v1/screening` - 커스텀 스크리닝 ✅
  - `GET /api/v1/screening/presets` - 프리셋 목록 ✅
  - `GET /api/v1/screening/presets/{preset}` - 프리셋 실행 ✅
  - `GET /api/v1/screening/momentum` - 모멘텀 스크리닝 ✅
- [x] 모멘텀 스크리닝 최적화 (OHLCV 기반 가격/거래량 분석)
- [x] Fundamental 데이터 백그라운드 수집 ✅
  - 서버 실행 중 자동 배치 수집
  - Yahoo Finance API 연동 (rate limiting 적용)
  - Fundamental + OHLCV 통합 수집 (API 효율화)
- [x] 심볼 자동 동기화 ✅
  - KRX: 한국거래소 전 종목 (~2,500개)
  - Binance: USDT 페어 암호화폐 (~300개)
  - Yahoo Finance: 미국 주식 상위 종목 (~500개)

**전략 연계**
- [ ] 전략에서 스크리닝 결과 활용 인터페이스 정의
- [ ] 코스닥 급등주 전략: 스크리닝 연동
- [ ] 스노우볼 전략: 저PBR+고배당 스크리닝 연동
- [ ] 섹터 모멘텀 전략: 섹터별 상위 종목 스크리닝

**프론트엔드**
- [ ] Screening.tsx 페이지
- [ ] 필터 조건 입력 폼
- [ ] 프리셋 선택 UI
- [ ] 스크리닝 결과 테이블 (정렬, 페이지네이션)
- [ ] 종목 상세 모달 (Fundamental + 차트)

### 5. 종목 랭킹 시스템 (Global Score) ⭐ 신규

**백엔드 - 핵심 모듈**
- [ ] `GlobalScorer` 구현 (trader-analytics)
  - [ ] 7개 팩터 가중치 시스템 (RR, T1, SL, NEAR, MOM, LIQ, TEC)
  - [ ] 페널티 시스템 (과열, RSI 이탈, MACD 음수 등 7개)
  - [ ] 정규화 유틸리티 (`pct_norm_pos`, `inv_dist_norm`)
- [ ] `LiquidityGate` 시장별 설정
  - [ ] KRX: KOSPI 200억/KOSDAQ 100억
  - [ ] US: $100M (완화 $50M)
- [ ] `ERS (Entry Ready Score)` 계산
  - [ ] EBS + MACD slope + RSI band 조합
- [ ] 스코어링 설정 테이블 (DB)

**백엔드 - API**
- [ ] `POST /api/v1/ranking/global` - 글로벌 랭킹 조회
- [ ] `GET /api/v1/ranking/top?market=KR&n=10` - TOP N 조회
- [ ] 스크리닝 API에 `global_score` 필드 추가

**프론트엔드**
- [ ] GlobalRanking.tsx 페이지
- [ ] TOP 10 대시보드 위젯
- [ ] 점수 구성 요소 시각화 (레이더 차트)

### 6. 종목 상태 관리 (RouteState) ⭐ 신규

**백엔드**
- [ ] `RouteState` enum 정의 (trader-core)
  - `Attack`, `Armed`, `Wait`, `Overheat`, `Neutral`
- [ ] 상태 판정 로직 구현
  - [ ] ATTACK: TTM Squeeze 해제 + 모멘텀 상승
  - [ ] ARMED: 박스권 상단 + 거래량 증가
  - [ ] OVERHEAT: 5일 수익률 > 15% 또는 RSI > 70
- [ ] symbol_fundamental 테이블에 `route_state` 컬럼 추가
- [ ] 스크리닝 응답에 `route_state` 포함

**프론트엔드**
- [ ] RouteState 뱃지 컴포넌트
- [ ] 상태별 필터링 UI

**알림 연동**
- [ ] ATTACK 상태 전환 시 텔레그램 알림

### 7. 호가 단위 관리 (Tick Size) ⭐ 신규

**백엔드**
- [ ] `TickSizeProvider` trait 정의 (trader-core)
- [ ] 거래소별 구현
  - [ ] `KrxTickSize`: 7단계 호가 단위
  - [ ] `UsEquityTickSize`: 고정 $0.01
  - [ ] `BinanceTickSize`: 심볼별 설정
- [ ] `round_to_tick()` 유틸리티 함수
- [ ] 주문 가격 유효성 검증 미들웨어

**활용**
- [ ] 목표가/손절가 자동 반올림
- [ ] 슬리피지 계산 정확도 개선

### 8. 구조적 피처 (Structural Features) ⭐ 신규

**백엔드**
- [ ] `StructuralFeatures` 구조체 정의 (trader-analytics)
  - `low_trend`, `vol_quality`, `range_pos`, `dist_ma20`, `bb_width`, `rsi`
- [ ] OHLCV 데이터로부터 피처 계산 로직
- [ ] ML 파이프라인에 피처 추가
- [ ] 스크리닝 필터 조건으로 활용

**활용**
- [ ] RouteState 판정 로직에 반영
- [ ] GlobalScorer 모멘텀 점수에 반영

### 9. ML 예측 활용 (선택적)

- [ ] 전략에서 ML 예측 결과 사용
- [ ] 구조적 피처 기반 모델 재훈련
- [ ] ONNX 모델 추론 성능 최적화

---

## 🟡 코드 최적화 기회

### Backend API
- [ ] portfolio.rs:441 - 당일 손익 계산
- [ ] portfolio.rs:461 - 당일 수익률 계산
- [ ] OAuth 토큰 캐시 TTL 관리

### 전략 모듈
- [ ] 대형 파일 리팩토링 (xaa.rs, candle_pattern.rs, rsi.rs)
- [ ] 캔들 패턴 매칭 성능 최적화

### 거래소 모듈
- [ ] Binance WebSocket 완성
- [ ] KIS 선물/옵션 거래

### 백테스트/분석
- [ ] 틱 시뮬레이션
- [ ] 마진 거래 검증
- [ ] 대규모 데이터셋 성능 테스트

---

## 🟢 낮은 우선순위

### 추가 거래소
- [ ] Coinbase, Kraken
- [ ] Interactive Brokers
- [ ] 키움증권

### 외부 데이터 연동 (선택적)
- [ ] 뉴스 수집
  - [ ] Finnhub API 연동 (US)
  - [ ] Yahoo Finance 뉴스 (Global)
- [ ] 공시 수집
  - [ ] SEC EDGAR 연동 (US)
- [ ] 뉴스/공시 감성 분석 (LLM 연동)

### 인프라
- [ ] Grafana 모니터링
- [ ] 부하 테스트

---

## 🔵 핵심 워크플로우

```
전략 등록 (Strategies.tsx)
    ↓
백테스트 (Backtest.tsx) ← 데이터셋 자동 요청
    ↓
시뮬레이션 (Simulation.tsx)
    ↓
실전 운용 (Dashboard)
```

---

## ✅ 완료 현황 요약

| 모듈 | 상태 |
|------|------|
| Backend API (17개 라우트) | 95% |
| Frontend (7 페이지, 15+ 컴포넌트) | 95%+ |
| 전략 (25개 구현) | 100% |
| ML (훈련 + ONNX 추론) | 95% |
| 거래소 (Binance, KIS) | 85-95% |
| 테스트 (258개 단위 + 28개 통합) | 완료 |
| **Global Score 시스템** | 0% (신규) |
| **RouteState 상태 관리** | 0% (신규) |
| **Tick Size 관리** | 0% (신규) |
| **구조적 피처** | 0% (신규) |

> 상세 구조는 `CLAUDE.md` 참조

---

## 참고 문서

| 문서 | 위치 | 용도 |
|------|------|------|
| PRD | `docs/prd.md` | 제품 요구사항 정의서 |
| CLAUDE.md | 루트 | 프로젝트 구조, 에이전트 지침 |
| improvement_todo.md | `docs/` | 코드베이스 개선 로드맵 |
