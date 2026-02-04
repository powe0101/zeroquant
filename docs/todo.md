
# ZeroQuant TODO - 통합 로드맵

> **마지막 업데이트**: 2026-02-04
> **현재 버전**: v0.6.0
> **참조 문서**: `python_strategy_modules.md`, `improvement_todo.md`, `complete_todo.md`

## 🔴 Phase 1 - 핵심 기능 (Core Features)
> **의존성**: Phase 0 완료 후 시작

> 1.4 Multiple KLine Period 완료됨 → [8. 완료된 작업](#8-완료된-작업) 참조

### 1.5. 전략 연계 (스크리닝 활용)[complete_todo.md:1551-1563]
**해당 작업은 후순위입니다.**
- [ ] **전체 전략**을 python-strategy 폴더에 있는 xx.xxx 전략들과 docs/STRATEGY_DEVELOPMENT.md 를 매칭하여 적절한 스크리닝을 활용하여 완전히 새로 구현합니다. 아래는 예입니다. 이때 Multiple KLine Period을 적용할 수 있는 경우 같이 적용하도록 합니다.
  - 코스닥 급등주 전략: ATTACK 상태 종목만 진입 
  - 스노우볼 전략: 저PBR+고배당 + Global Score 상위 
  - 섹터 모멘텀 전략: 섹터별 TOP 5 자동 선택 


## Phase 2: 프론트엔드 UI

> 2.1~2.3 완료됨 → [8. 완료된 작업](#8-완료된-작업) 참조

### 2.4. 대시보드 고급 시각화 ⭐ 신규

**목적**: 고급 시각화 기능을 프론트엔드에 구현

## Phase 3: 프론트엔드 연동

> 6.5, 6.6, 6.7, 6.8 완료됨 → [8. 완료된 작업](#8-완료된-작업) 참조

### 6.8.5 후속 작업 ✅

> 전략 생성/수정 시 TF 설정 저장 완료됨 → [8. 완료된 작업](#8-완료된-작업) 참조
> 백테스트 TF 선택 UI 완료됨 → [8. 완료된 작업](#8-완료된-작업) 참조
> 백테스트 API multi_timeframe_config 지원 완료됨 → [8. 완료된 작업](#8-완료된-작업) 참조

---

#### 6.9 상태 관리 및 아키텍처 개선

> **목적**: 프론트엔드 코드 품질 및 성능 개선

---

##### 6.9.1 상태 관리 리팩토링

**createSignal → createStore 통합** ✅ (2026-02-04 완료)

| 페이지 | 변환 전 | 변환 후 | 감소율 |
|--------|---------|---------|--------|
| Strategies.tsx | ~15 signals | 4 stores | ~73% |
| TradingJournal.tsx | ~20 signals | 5 stores | ~75% |
| Screening.tsx | 29 signals | 4 stores | ~86% |
| Backtest.tsx | 19 signals | 4 stores | ~79% |
| Dashboard.tsx | 4 signals | 2 stores | 50% |

> 상세 내용: [8. 완료된 작업](#8-완료된-작업) 참조

**createMemo 파생 상태 최적화** ✅ (2026-02-04 완료)

| 페이지 | createMemo 개수 | 최적화 상태 |
|--------|-----------------|-------------|
| Strategies.tsx | 3개 | ✅ 필터링, 카운트 |
| TradingJournal.tsx | 1개 | ✅ 필터 객체 (리소스 기반) |
| Screening.tsx | 6개 | ✅ **모범 사례** (필터+정렬+페이지네이션) |
| GlobalRanking.tsx | 5개 | ✅ 통계, Top10, 워터폴, chartColors |

> 상세 내용: [8. 완료된 작업](#8-완료된-작업) 참조

---

##### 6.9.2 커스텀 훅 추출 ✅ (2026-02-04 완료)

| 훅 | 파일 | 주요 기능 |
|----|------|----------|
| useStrategies | `hooks/useStrategies.ts` | CRUD, toggle, clone, filtered() |
| useJournal | `hooks/useJournal.ts` | positions, executions, PnL 데이터, filter |
| useScreening | `hooks/useScreening.ts` | results, presets CRUD, search |
| useMarketSentiment | `hooks/useMarketSentiment.ts` | fearGreed, breadth, sectors, 자동갱신 |

> 상세 내용: [8. 완료된 작업](#8-완료된-작업) 참조

---

##### 6.9.3 성능 최적화 ✅ (2026-02-04 완료)

**Lazy Loading 적용** ✅
- 11개 페이지 모두 `lazy()` + `Suspense` 적용
- `PageLoader` 컴포넌트로 로딩 UI 제공

**코드 스플리팅 (manualChunks)** ✅
- 벤더 라이브러리 별도 청크 분리로 캐싱 효율화

| 청크 | 크기 | 설명 |
|------|------|------|
| `index.js` | 12.5 KB | 진입점 (이전 1,512 KB → **99% 감소**) |
| `vendor-echarts` | 674 KB | 차트 라이브러리 (필요 시 로드) |
| `vendor-lightweight-charts` | 175 KB | 캔들 차트 라이브러리 |
| `vendor-solid` | 45 KB | SolidJS 코어 |
| `vendor-tanstack` | 37 KB | 쿼리 라이브러리 |
| `vendor-lucide` | 22 KB | 아이콘 라이브러리 |

> 상세 내용: [8. 완료된 작업](#8-완료된-작업) 참조

**추가 최적화** ✅ (2026-02-04 완료)
- 가상 스크롤 (`@tanstack/solid-virtual`) → `VirtualizedTable` 컴포넌트
- 이미지 Lazy Loading → `LazyImage`, `NativeLazyImage` 컴포넌트
- 디바운스/쓰로틀 → `useDebounce`, `useDebouncedCallback`, `useThrottledCallback` 훅

---

##### 6.1. 통합 및 테스트
- [ ] 전략 추가 모달에 적용
- [ ] 백테스트 설정에 적용
- [ ] 스키마 없는 전략 fallback UI
- [ ] 브라우저 테스트 (Chrome, Firefox, Safari)
- [ ] 반응형 레이아웃 확인

---

## 7. 백엔드 API 상세 ✅ (완료)

> 7.1~7.6 백엔드 구현 완료 → [8. 완료된 작업](#8-완료된-작업) 참조

**프론트엔드 연동 완료:**
- [x] 관심종목 UI (WatchlistSelectModal 컴포넌트) ✅
- [x] 전략 연결 UI (StrategyLinkModal 컴포넌트) ✅
- [x] 프리셋 저장/삭제 모달 UI (PresetModal 컴포넌트) ✅
- [x] 7Factor 레이더 차트 7축 확장 (RadarChart.tsx) ✅
- [x] FIFO 원가 표시 (PositionDetailModal) ✅
- [x] 고급 통계 표시 (TradingInsightsResponse) ✅

---

## 8. 완료된 작업

> 이 섹션은 완료된 작업들의 기록입니다.

### Phase 2 프론트엔드 UI (완료)

#### 2.1. Screening UI ✅
**페이지**: `Screening.tsx`
- 필터 조건 입력 폼, 프리셋 선택 UI
- 결과 테이블 (정렬/페이지네이션)
- RouteState 뱃지, 종목 상세 모달
- 시장별 필터 (KOSPI/KOSDAQ), RouteState 다중 선택, RSI 필터

#### 2.2. Global Ranking UI ✅
**페이지**: `GlobalRanking.tsx`
- 시장별 필터, 레이더 차트, RouteState 필터링
- `RankingWidget.tsx` → Dashboard.tsx 통합

#### 2.3. 캔들 차트 신호 시각화 ✅
- `SignalMarkerOverlay` 컴포넌트
- `IndicatorFilterPanel` 컴포넌트
- 백테스트 결과 페이지 차트+신호 통합

---

### Phase 3 백엔드 API (완료)

#### 3.1 관심종목 API ✅
- `watchlist` 테이블 마이그레이션
- `WatchlistRepository` 구현
- API: `GET/POST /watchlist`, `POST/DELETE /watchlist/{id}/items`

#### 3.2 전략 symbols 연결 API ✅
- `PUT /api/v1/strategies/{id}/symbols`

#### 3.3 프리셋 저장/삭제 API ✅
- `POST /api/v1/screening/presets`
- `DELETE /api/v1/screening/presets/{id}`

#### 3.4 7Factor 데이터 API ✅
- `SevenFactorCalculator` 구현 (7개 팩터 정규화)
- `GET /api/v1/ranking/7factor/{ticker}`
- `POST /api/v1/ranking/7factor/batch`

#### 3.5 FIFO 원가 계산 API ✅
- `CostBasisTracker` 모듈
- `GET /api/v1/journal/cost-basis/{symbol}`

#### 3.6 고급 거래 통계 API ✅
- `max_consecutive_wins`, `max_consecutive_losses` 계산
- `max_drawdown`, `max_drawdown_pct` 계산
- `TradingInsightsResponse`에 필드 추가

---

### 매매일지 UI (완료)

#### 6.3.1 보유 현황 테이블 ✅
- DataTable 정렬, 컬럼 정의
- 행 클릭 → 상세 모달 (PositionDetailModal)
- 비중 막대 표시

#### 6.3.2 체결 내역 타임라인 ✅
- 날짜별 그룹핑, 타임라인 UI
- 체결 노드 정보, 페이지네이션 연동
- 날짜 범위/종목/매수매도 필터

#### 6.3.3 포지션 비중 차트 ✅
- ECharts 도넛 차트
- 종목별 평가금액 비중, 툴팁, 범례
- 클릭 시 상세 모달

#### 6.3.4 손익 분석 대시보드 ✅
- 일별/주별/월별/연도별 손익
- 누적 손익 차트

---

### Phase 3 프론트엔드 연동 (완료)

#### 3.7 관심종목 UI ✅
- `WatchlistSelectModal` 컴포넌트 (관심종목 그룹 선택/생성)
- `SymbolDetailModal` → 관심종목 추가 버튼 연동

#### 3.8 전략 연결 UI ✅
- `StrategyLinkModal` 컴포넌트 (전략 연결/해제)
- `SymbolDetailModal` → 전략 연결 버튼 연동

#### 3.9 프리셋 저장/삭제 모달 ✅
- `PresetModal` 컴포넌트 (저장/삭제/목록)
- `Screening.tsx` → 프리셋 관리 버튼 연동

#### 3.10 7Factor 레이더 차트 ✅
- `RadarChart.tsx` LABEL_MAP에 7Factor 키 추가
- norm_momentum, norm_value, norm_quality, norm_volatility, norm_liquidity, norm_growth, norm_sentiment

#### 3.11 FIFO 원가 표시 ✅
- `PositionDetailModal`에 FIFO 분석 섹션 추가
- 평균 원가, 총 원가, 실현손익, 매수/매도 횟수, Lot 수

#### 3.12 고급 통계 표시 ✅
- `TradingInsightsResponse` 연동 완료
- max_consecutive_wins, max_consecutive_losses, max_drawdown

---

### Phase 4 시각화 컴포넌트 (완료)

#### 4.1 FearGreedGauge ✅
- `frontend/src/components/charts/FearGreedGauge.tsx`
- ECharts Gauge 차트로 반원형 게이지 구현
- 5단계 색상 구분 (극단적 공포 → 극단적 탐욕)
- Market Breadth API 연동

#### 4.2 MarketBreadthWidget ✅
- `frontend/src/components/charts/MarketBreadthWidget.tsx`
- KOSPI/KOSDAQ/전체 프로그레스 바
- 온도 뱃지 (과열/중립/냉각)
- 범례 및 추천 표시

#### 4.3 SurvivalBadge ✅
- `frontend/src/components/ui/SurvivalBadge.tsx`
- 4단계 스트릭 레벨 (cold→warm→hot→fire)
- `DualSurvivalBadge` (승/패 동시 표시)
- `StreakSummaryCard` (카드 형태 요약)

#### 4.4 ScoreWaterfall ✅
- `frontend/src/components/charts/ScoreWaterfall.tsx`
- ECharts 워터폴 차트로 점수 기여도 표시
- `Factor7Waterfall` (7Factor 전용 래퍼)
- 양수/음수 색상 구분

#### 4.5 SectorTreemap ✅
- `frontend/src/components/charts/SectorTreemap.tsx`
- `TreemapChart` 래퍼 (섹터 전용)
- 섹터 API 연동 (getSectorRanking)
- `SectorSummaryCard` (섹터 요약 카드)

#### 4.6 KellyVisualization ✅
- `frontend/src/components/charts/KellyVisualization.tsx`
- 켈리 공식 기반 자금관리 시각화
- Half Kelly / Full Kelly 마커
- 위험 한도 영역 표시
- 과대/과소 배분 경고

#### 4.7 CorrelationHeatmap ✅
- `frontend/src/components/charts/CorrelationHeatmap.tsx`
- ECharts 히트맵으로 N×N 상관관계 행렬 표시
- -1~+1 색상 스케일 (빨강-흰색-파랑)
- `MiniCorrelationMatrix` (간단한 테이블 형식)

#### 4.8 OpportunityMap ✅
- `frontend/src/components/charts/OpportunityMap.tsx`
- TOTAL vs TRIGGER 2D 산점도
- RouteState별 색상 코딩 (ATTACK/ARMED/WATCH/AVOID)
- 4분면 라벨 표시
- 점 크기: 시가총액/거래량 기반

#### 4.9 KanbanBoard ✅
- `frontend/src/components/charts/KanbanBoard.tsx`
- ATTACK/ARMED/WATCH 3열 칸반 레이아웃
- 드래그 앤 드롭 상태 변경
- 종목 카드: 스파크라인, 등락률, 점수
- 점수 순 자동 정렬

#### 4.10 RegimeSummaryTable ✅
- `frontend/src/components/charts/RegimeSummaryTable.tsx`
- Bull/Bear/Sideways 레짐별 성과 테이블
- 기간, 평균 수익률, 변동성, 최대 DD 표시
- 현재 레짐 하이라이트
- 레짐 전환 히스토리 차트

#### 4.11 SectorMomentumBar ✅
- `frontend/src/components/charts/SectorMomentumBar.tsx`
- 수평 막대 차트 (5일 수익률)
- TOP 10 / BOTTOM 10 탭 전환
- 색상: 양수 초록, 음수 빨강
- 섹터 클릭 시 상세

#### 4.12 VolumeProfile ✅
- `frontend/src/components/charts/VolumeProfile.tsx`
- 가격대별 거래량 수평 막대 차트
- POC (Point of Control) 강조
- Value Area (70% 거래량) 표시
- 캔들 차트 Y축 동기화 지원
- `VolumeProfileLegend` (범례 컴포넌트)

#### 4.13 MultiSymbolInput 개선 ✅
- `frontend/src/components/strategy/SDUIRenderer/fields/MultiSymbolInput.tsx`
- `maxCount` prop으로 최대 개수 제한
- 드래그 앤 드롭 순서 변경 지원
- 순서 번호 표시
- 남은 추가 가능 개수 표시

---

### Phase 4 캔들 차트 신호 시각화 (완료)

#### 4.14 IndicatorFilterPanel ✅
- `frontend/src/components/charts/IndicatorFilterPanel.tsx` (434줄)
- 필터 프리셋 저장/불러오기 (localStorage 활용)

#### 4.15 SignalMarkerOverlay ✅
- `frontend/src/components/charts/SignalMarkerOverlay.tsx` (372줄)
- 백테스트 결과 차트 통합 (`SyncedChartPanel` + `TradeMarker`)
- `convertTradesToMarkers()` 함수로 거래 내역을 마커로 변환
- `filteredTradeMarkers()` 메모로 필터 적용

#### 4.16 SymbolDetail 페이지 ✅
- `frontend/src/pages/SymbolDetail.tsx` (530줄)
- 가격 차트 + VolumeProfile 연동
- 과거 신호 차트 (`SyncedChartPanel` + `TradeMarker` 활용)
- 최근 N일 신호 목록 테이블
- 신호 발생 통계 (매수/매도 비율, 체결률, 타입별 카운트)

---

### Phase 4 대시보드 시각화 연동 (완료)

#### 4.17 Dashboard 연동 ✅
- FearGreedGauge, MarketBreadthWidget 통합
- 시장 심리 지표 섹션 추가

#### 4.18 Backtest VolumeProfile ✅
- VolumeProfile 차트 통합

#### 4.19 Screening 연동 ✅
- OpportunityMap (2D 산점도)
- KanbanBoard (ATTACK/ARMED/WATCH 3열)
- 뷰 모드 전환 (테이블/맵/칸반)

#### 4.20 Simulation 연동 ✅
- KellyVisualization (켈리 공식 시각화)
- MiniCorrelationMatrix (상관관계 행렬)

---

### Phase 6 사용성 개선 (완료)

#### 6.5 추가 기능 ✅
- `RankChangeIndicator.tsx` - 순위 변동 표시 (↑↓ 화살표 + 변동폭)
- `FavoriteButton.tsx` - 종목 즐겨찾기 토글 (localStorage 기반)
- `ExportButton.tsx` - Excel 내보내기 버튼 (CSV UTF-8 BOM)
- `AutoRefreshToggle.tsx` - 자동 갱신 토글 (30초/1분/5분)

#### 6.6 대시보드 추가 컴포넌트 연동 ✅
| 컴포넌트 | 연동 페이지 |
|----------|------------|
| ScoreWaterfall | GlobalRanking.tsx |
| RegimeSummaryTable | Dashboard.tsx |
| SectorTreemap | Dashboard.tsx |
| SectorMomentumBar | Dashboard.tsx |

> mock 데이터로 연동됨. 백엔드 collector가 실제 지표를 제공하면 자동 반영.

#### 6.7 차트 시각화 개선 ✅
- `TradeConnectionOverlay.tsx` - 진입/청산 연결선 + 손익 구간 배경색
  - SVG 오버레이 방식으로 차트 위에 렌더링
  - 곡선 연결선 (Bezier curve)
  - 손익에 따른 배경색 (녹색/빨간색)
  - 호버 시 손익률 표시
- `SignalCorrelationChart.tsx` - 신호-수익률 상관관계 산점도
  - Pearson 상관계수 계산
  - 선형 회귀선 표시
  - 매수/매도 분리 시각화
  - R² 결정계수 표시

#### 6.8 Multi Timeframe UI ✅
- `MultiTimeframeSelector.tsx` - Primary/Secondary TF 선택 컴포넌트
  - Primary TF 드롭다운 (8개 타임프레임)
  - Secondary TF 다중 선택 (체크박스 그룹)
  - 제약 조건 검증 (Secondary > Primary)
  - 최대 3개 Secondary 선택
- `MultiTimeframeChart.tsx` - 멀티 TF 차트 동기화
  - 메인/서브 차트 패널
  - 크로스헤어 동기화
  - 줌/팬 동기화 (LogicalRange)
  - 레이아웃 옵션 (세로/가로/그리드)
- `useMultiTimeframeKlines.ts` - API 연동 훅
  - `GET /api/v1/market/klines/multi` 연동
  - 타임프레임별 TTL 캐싱 (1분봉 30초 ~ 월봉 24시간)
  - 에러 처리 (부분 실패 시 성공 데이터 유지)
- `MultiTimeframeField.tsx` - SDUI 필드 컴포넌트
  - `field_type: 'multi_timeframe'` 지원
  - `MultiTimeframeValue` 타입 (primary + secondary[])

---

### Phase 1 핵심 기능 (완료)

#### 1.4 Multiple KLine Period (다중 타임프레임) ✅
**완료일**: 2026-02-04

**백엔드 구현**
- Strategy Trait 확장 - `multi_timeframe_config()`, `on_multi_timeframe_data()` 추가
- `register_strategy!` 매크로에 `secondary_timeframes` 필드 지원
- StrategyMeta 확장 - JSON 응답에 `isMultiTimeframe` 필드
- Redis 멀티키 조회 최적화 (`get_multi_klines()` 병렬 GET)
- `CachedHistoricalDataProvider` 확장 - `warmup_multi_timeframe()`, `get_multi_timeframe_klines()`
- `TimeframeAligner` 모듈 생성 - Look-Ahead Bias 방지
- 백테스트 엔진 `run_multi_timeframe()` 메서드 추가
- `RsiMultiTimeframeStrategy` 예제 전략 구현
- 헬퍼 함수 작성 (`analyze_trend`, `combine_signals`, `detect_divergence`) - `multi_timeframe_helpers.rs`
- DB 스키마 확장 (`strategies.multi_timeframe_config` 컬럼) - `migrations/18_multi_timeframe.sql`

**API 엔드포인트**
- `GET /api/v1/market/klines/multi` - 다중 타임프레임 Kline 조회
- `POST /api/v1/strategies` - `multiTimeframeConfig` 필드 추가
- `GET/PUT /api/v1/strategies/{id}/timeframes` - TF 설정 조회/수정

**WebSocket**
- Kline 브로드캐스트 활성화 - `ServerMessage::Kline`, `KlineData`

**프론트엔드**
- `MultiTimeframeSelector.tsx` - Primary/Secondary TF 선택 컴포넌트
- `MultiTimeframeChart.tsx` - 멀티 TF 차트 동기화
- `useMultiTimeframeKlines.ts` - API 연동 훅 (TTL 캐싱)
- `MultiTimeframeField.tsx` - SDUI 필드 컴포넌트

**성능 최적화**
- 병렬 쿼리 최적화 (`join_all` + Redis 캐시)
- 타임프레임별 차등 TTL 설정
- 성능 테스트 통과 (0.8ms < 50ms 목표)
- `StrategyExecutor`에서 멀티 데이터 자동 로드
- Primary TF 완료 시에만 전략 재평가

#### 6.8.5 Multi Timeframe 후속 작업 ✅
**완료일**: 2026-02-04
- 전략 생성 시 TF 설정 저장 (`AddStrategyModal` + `MultiTimeframeSelector` 연동)
- 전략 수정 시 TF 설정 저장/로드 (`EditStrategyModal` - 이미 구현됨)
- 백테스트 설정에서 TF 선택 UI (`Backtest.tsx` + `MultiTimeframeSelector`)
- `BacktestRequest` 타입에 `multi_timeframe_config` 필드 추가

#### 6.8.6 백테스트 API Multi Timeframe 지원 ✅
**완료일**: 2026-02-04
- `types.rs`: `MultiTimeframeRequest`, `SecondaryTimeframeConfig` API 타입 추가
- `types.rs`: `BacktestRunRequest`에 `multi_timeframe_config` 필드 추가
- `loader.rs`: `load_klines_with_timeframe()` - 특정 타임프레임 데이터 로드
- `loader.rs`: `load_secondary_timeframe_klines()` - Secondary TF 병렬 로드
- 통합 테스트 3건 작성 (`backtest_integration.rs`):
  - `test_multi_timeframe_with_empty_secondary` - 빈 Secondary로 기존 동작 유지 확인
  - `test_multi_timeframe_with_secondary_data` - 실제 다중 TF 데이터 동작 확인
  - `test_all_strategies_via_multi_timeframe_path` - 모든 전략 다중 TF 경로 호환 확인

#### 6.9.1 createStore 리팩토링 ✅
**완료일**: 2026-02-04
- 5개 주요 페이지의 분산된 `createSignal`을 논리적 `createStore` 그룹으로 통합
- **Strategies.tsx**: ~15 signals → 4 stores (FilterState, UIState, ModalState, FormState)
- **TradingJournal.tsx**: ~20 signals → 5 stores (FilterState, UIState, StatsState, ModalState, PaginationState)
- **Screening.tsx**: 29 signals → 4 stores (CustomFilterState, ClientFilterState, UIState, ModalState)
- **Backtest.tsx**: 19 signals → 4 stores (FormState, UIState, MultiTfState, ResultsState) + BacktestResultCard 3 stores
- **Dashboard.tsx**: 4 signals → 2 stores (UIState, NotificationState)
- 함수형 업데이트 패턴: `setStore('items', items => [...items, newItem])`
- 타입 안전성 강화 (TypeScript 인터페이스로 상태 구조 명시)

#### 6.9.2 커스텀 훅 추출 ✅
**완료일**: 2026-02-04
- **useStrategies** (`hooks/useStrategies.ts`)
  - `createResource`로 전략 목록 자동 로딩
  - CRUD 메서드: `create()`, `remove()`, `toggle()`, `clone()`
  - 설정 업데이트: `updateConfig()`, `updateSymbols()`, `updateTimeframe()`
  - 파생 상태: `total()`, `runningCount()`, `filtered()`
  - 작업 상태 추적: `togglingId`, `deletingId`, `cloningId`
- **useJournal** (`hooks/useJournal.ts`)
  - 데이터 조회: `positions()`, `executions()`, `pnlSummary()`
  - PnL 데이터: `dailyPnL()`, `weeklyPnL()`, `monthlyPnL()`, `yearlyPnL()`, `cumulativePnL()`
  - 부가 데이터: `insights()`, `strategyPerformance()`
  - 필터 관리: `filter`, `setFilter()` (페이지 자동 리셋)
- **useScreening** (`hooks/useScreening.ts`)
  - 데이터: `results()`, `presets()`
  - 필터: `filter`, `setFilter()`
  - 프리셋 CRUD: `savePreset()`, `deletePreset()`, `loadPreset()`
  - 검색 실행: `search()`
- **useMarketSentiment** (`hooks/useMarketSentiment.ts`)
  - 지표: `fearGreedIndex()`, `marketBreadth()`, `marketTemperature()`
  - 섹터: `topSectors()`, `bottomSectors()`
  - 자동 갱신: 5분 간격 (`setInterval`)

#### 6.9.1 createMemo 최적화 ✅
**완료일**: 2026-02-04
- 4개 페이지 분석 완료, 대부분 이미 최적화된 상태 확인
- **Strategies.tsx**: 3개 createMemo (필터링, runningCount, stoppedCount)
- **TradingJournal.tsx**: 1개 createMemo (executionFilter 객체 메모이제이션)
- **Screening.tsx**: 6개 createMemo - **모범 사례**
  - `currentResults()` → `sortedResults()` → `paginatedResults()` 의존성 체인
  - 7개 필터 조건 + 정렬 + 페이지네이션
  - `opportunityMapData()`, `kanbanBoardData()` 차트 데이터 변환
- **GlobalRanking.tsx**: 5개 createMemo
  - `top10()`, `stats()`, `waterfallData()`, `entries()`, `chartColors()`
  - `chartColors()` 함수를 createMemo로 변환하여 객체 생성 최적화

#### 6.9.3 성능 최적화 (Lazy Loading + manualChunks) ✅
**완료일**: 2026-02-04
- **App.tsx 전면 개편**: 모든 페이지 lazy loading 적용
  - 11개 페이지 `lazy(() => import())` 적용
  - `Suspense` + `PageLoader` 로딩 UI 제공
  - 각 페이지에 `export default` 추가
- **vite.config.ts manualChunks 설정**:
  - `vendor-echarts`: ECharts 라이브러리 분리
  - `vendor-lightweight-charts`: 캔들 차트 라이브러리 분리
  - `vendor-solid`: SolidJS 코어 분리
  - `vendor-tanstack`: TanStack Query 분리
  - `vendor-lucide`: 아이콘 라이브러리 분리
- **번들 크기 최적화 결과**:
  - 이전: `index.js` 1,512 KB (단일 번들)
  - 이후: `index.js` 12.5 KB (**99% 감소**)
  - 각 페이지가 별도 청크로 분리 (10-90 KB)
  - 벤더 청크 캐싱 가능 (변경 빈도 낮음)

#### 6.9.3 추가 최적화 (가상 스크롤 + 디바운스) ✅
**완료일**: 2026-02-04
- **VirtualizedTable 컴포넌트** (`components/ui/VirtualizedTable.tsx`)
  - `@tanstack/solid-virtual` 기반 가상화 테이블
  - 대용량 데이터(1,000+ 행)에서 60fps 스크롤 성능 유지
  - 컬럼 정의, 행 클릭, 커스텀 렌더러 지원
- **LazyImage 컴포넌트** (`components/ui/LazyImage.tsx`)
  - Intersection Observer 기반 지연 로딩
  - 플레이스홀더, 에러 fallback 지원
  - `NativeLazyImage`: 브라우저 네이티브 lazy 속성 활용
- **디바운스/쓰로틀 훅** (`hooks/useDebounce.ts`)
  - `useDebounce`: 값 디바운스 (검색 입력 등)
  - `useDebouncedCallback`: 콜백 디바운스 (API 호출 등)
  - `useThrottledCallback`: 쓰로틀 (스크롤 이벤트 등)