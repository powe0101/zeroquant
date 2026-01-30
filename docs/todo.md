
# 작업 규칙
- Context7과 Sequential Thinking, Shrimp Task Manager를 적극적으로 사용하세요.
- 모든 작업 수행시 UI와 API의 필드 매칭을 무조건 맞추고 진행 하세요.
- API는 무조건 호출하여 정상작동 하는지 테스트 합니다. 문제가 발생했을 때 수정 후 넘어가세요. 
- UI는 playwright를 이용하여 항상 동작 확인을 수행합니다. 적당한 형태의 테스트 케이스를 만들어, 통과하도록 하세요.
- UI와 API가 모두 끝나야 작업이 끝나는 것입니다. API와 UI 테스트 도중 문제가 생기면 바로바로 해결하세요.
- docker 환경에서 반드시 테스트 할 것. 실제 환경은 docker를 사용합니다.
- 작업의 완료는 확인 해야할 모든 요소가 정상적일때 완료라고 합니다. 확인 해야 할 요소는 API, 구조, UI입니다.
---

# 완료된 작업 (2026-01-30)

## PRD v2.0 재작성 및 코드베이스 검증 (2026-01-30)
- [x] 전체 코드베이스 서브에이전트 분석
- [x] MLTraining.tsx (604줄) 구현 완료 확인
- [x] Settings.tsx (1,384줄) 구현 완료 확인
- [x] ML 패턴 인식 모듈 (4,125줄) 구현 완료 확인
- [x] PRD v2.0 업데이트 → synthetic-conjuring-peach.md

## 데이터셋 페이지 개선 (2026-01-30)
- [x] 1시간 타임프레임 차트 문제 해결 (Unix timestamp 변환)
- [x] 테이블 무한 스크롤링 구현 (Intersection Observer API)
- [x] 지표 계산 함수에 isDailyOrHigher 파라미터 추가

## UI/UX 작업 (2026-01-29)
- [x] 전략 편집 모달 UI 구현
- [x] 토스트 알림 컴포넌트 구현 (Toast.tsx)
- [x] Strategies 페이지에 토스트 적용
- [x] Docker 빌드 문제 해결 (Rust 1.93 + ort 2.0.0-rc.11)

---

# 우선순위 작업 목록

## [진행중] 데이터셋 페이지 추가 기능 ⏳
- [ ] 날짜 범위 다운로드 옵션 추가 (백엔드 API + 프론트엔드 UI)
  - 백엔드: FetchDatasetRequest에 start_date, end_date 옵션 추가
  - 프론트엔드: 다운로드 폼에 "캔들 수 / 날짜 범위" 선택 UI
- [ ] 전략별 타임프레임 설정 기능 추가
  - 백엔드: strategies 테이블에 timeframe 컬럼 추가
  - 프론트엔드: 전략 편집 모달에 타임프레임 선택 추가

## [완료] PRD 문서 간소화 ✅ (2026-01-30)
- [x] 현재 PRD가 너무 큼 (38,000+ 토큰)
- [x] 코드베이스 실제 구현 상황 파악 (서브에이전트 분석)
- [x] 간결하고 실행 가능한 새로운 PRD 생성 → synthetic-conjuring-peach.md

## [완료] ML 패턴 인식 고도화 ✅ (코드베이스 검증 완료)
- [x] ML 모듈 분석 완료 (trader-analytics/src/ml/, 4,125줄)
- [x] 캔들스틱 패턴 26가지 구현 (pattern.rs)
- [x] 차트 패턴 22가지 구현 (pattern.rs)
- [x] Feature Engineering 30개+ 기술지표 (features.rs)
- [x] ONNX 모델 추론 구현 (predictor.rs, GPU 가속 지원)
- [x] 통합 ML 서비스 (service.rs, 비동기 지원)
- [x] 43개 단위 테스트 포함

## [최우선] 백테스트/시뮬레이션 UI 플로우 개선 ⭐ 신규
**핵심 변경사항**: 백테스트/시뮬레이션 페이지에서 "등록된 전략"만 테스트 가능하도록 변경

**새로운 워크플로우**:
1. 전략 페이지에서 전략 등록 (파라미터 포함)
2. 백테스트/시뮬레이션 페이지에서 등록된 전략 선택
3. 심볼/기간/초기자본만 입력하여 테스트 실행 (파라미터 입력 불필요)

**구현 작업**:
- [ ] 백엔드: `StrategyListItem`에 `strategy_type` 필드 추가
- [ ] 백엔드: `list_strategies` API에서 `strategy_type` 반환
- [ ] 백엔드: 백테스트 API에서 등록된 전략 ID로 실행 지원
- [ ] 프론트: Backtest.tsx에서 `getStrategies()` 사용 (등록된 전략만 표시)
- [ ] 프론트: 파라미터 입력 SDUI 폼 제거 (등록된 설정 사용)
- [ ] 프론트: Simulation.tsx 동일하게 수정
- [ ] 전략 페이지에서 모든 전략 등록 테스트
- [ ] 백테스트 페이지에서 등록된 전략 테스트

## [최우선] KIS API 연동 완성 및 테스트
- [x] OAuth 2.0 인증 구현 ✅ 완료
- [x] 국내 주식/ETF 시세 조회 ✅ 완료
- [x] 주문 실행 (매수/매도) ✅ 완료
- [x] 실시간 WebSocket 연동 (국내) ✅ 완료
- [x] 해외 주식 API 연동 (미국 ETF) ✅ 완료
- [x] 모의투자 계좌 테스트 ✅ 완료

## [완료] Frontend 실시간 알림 UI ✅ (구현 확인)
- [x] WebSocket 클라이언트 훅 구현 (createWebSocket.ts)
- [x] 실시간 주문 상태 알림 (Dashboard.tsx)
- [x] 실시간 포지션 업데이트 알림 (Dashboard.tsx)
- [x] 알림 드롭다운 UI (Bell 아이콘 + 배지)
- [x] 연결 상태 표시 ("실시간 연결됨/끊김")

---

# 중간 우선순위 작업

## [완료] Frontend 거래소 자격증명 관리 UI ✅ (Settings.tsx 구현 확인)
- [x] 거래소 API 키 등록/수정/삭제 UI
- [x] 연결 테스트 기능
- [x] 활성 계좌 선택 기능

## [완료] Frontend 텔레그램 자격증명 관리 UI ✅ (Settings.tsx 구현 확인)
- [x] 봇 토큰 및 Chat ID 등록 UI
- [x] 연결 테스트 메시지 전송
- [x] 알림 환경설정 (주문 체결, 전략 신호, 리스크 경고)

## [완료] Frontend 전략 파라미터 설정 폼 ✅
- [x] DynamicForm 컴포넌트 완료
- [x] 전략 편집 모달 완료

---

# 백테스트 테스트 현황 (2026-01-29)

## 완료된 작업
- [x] SMA 크로스오버 전략 생성 (sma.rs)
- [x] Magic Split 전략 설정 수정 (levels 필드 추가)
- [x] 복잡한 전략 Config Default 적용 (SimplePowerConfig, HaaConfig, XaaConfig, StockRotationConfig)
- [x] 프론트엔드 최종 자본 표시 수정
- [x] 볼린저 밴드 파라미터 수정 (std_dev → std_multiplier, RSI 비활성화)
- [x] 변동성 돌파 is_new_period 날짜 비교 로직 추가

## 단일 자산 전략 테스트 결과 (✅ 모두 동작)
| 전략 | 상태 | 거래 수 | 수익률 | 비고 |
|-----|------|--------|--------|-----|
| RSI 평균회귀 | ✅ 동작 | 1회 | - | 005930 테스트 |
| 그리드 트레이딩 | ✅ 동작 | 17회 | +7.90% | 횡보장 최적 |
| 볼린저 밴드 | ✅ 동작 | 3회 | -0.58% | std_multiplier: 1.5 |
| 변동성 돌파 | ✅ 동작 | 28회 | -2.60% | k_factor: 0.3, ATR 사용 |
| Magic Split | ✅ 동작 | 13회 | -0.69% | 305540 테스트 |
| 이동평균 크로스오버 | ✅ 동작 | 6회 | +9.38% | 추세 추종 |

## 다중 자산 전략 (미지원 - 백테스트 엔진 수정 필요)
| 전략 | 필요 심볼 | 상태 |
|-----|---------|------|
| Simple Power | TQQQ, SCHD, PFIX, TMF | ⏳ 다중 심볼 지원 필요 |
| HAA | TIP, SPY, IWM, VEA, VWO, TLT, IEF, PDBC, VNQ, BIL | ⏳ 다중 심볼 지원 필요 |
| XAA | VWO, BND, SPY, EFA, EEM, TLT, IEF, LQD, BIL | ⏳ 다중 심볼 지원 필요 |
| 종목 갈아타기 | 005930, 000660, 035420, 051910, 006400 | ⏳ 다중 심볼 지원 필요 |

## 남은 백테스트 작업
- [ ] 다중 자산 백테스트 API 엔드포인트 구현 (/api/v1/backtest/run-multi)
- [ ] 다중 심볼 데이터 로딩 함수 구현

---

# 낮은 우선순위 작업

## 추가 거래소 통합
- [ ] Coinbase 거래소
- [ ] Kraken 거래소
- [ ] Interactive Brokers
- [ ] Oanda (외환)
- [ ] 키움증권 (Windows COM)
- [ ] 이베스트투자증권

## 인프라 & 모니터링
- [ ] Grafana 모니터링 대시보드
- [ ] 성능 및 부하 테스트

## Python 전략 변환
- [ ] 22개 미구현 전략

---

# 참고 문서
- 테스트 시나리오: [docs/backtest-test-scenarios.md](docs/backtest-test-scenarios.md)
- 전략 비교: [docs/STRATEGY_COMPARISON.md](docs/STRATEGY_COMPARISON.md)
- PRD v2.0: [C:\Users\HP\.claude\plans\synthetic-conjuring-peach.md](C:\Users\HP\.claude\plans\synthetic-conjuring-peach.md)
- 기존 PRD (백업): [C:\Users\HP\.claude\plans\toasty-chasing-patterson.md](C:\Users\HP\.claude\plans\toasty-chasing-patterson.md)
