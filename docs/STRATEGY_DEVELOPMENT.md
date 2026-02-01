# 전략 개발 가이드

> ZeroQuant 전략 시스템 개발 참조 문서
> 마지막 업데이트: 2026-02-01
> **참고**: 이 문서는 `STRATEGY_COMPARISON.md`를 대체합니다.

---

## 📌 문서 목적

이 문서는 **현재 구현된 26개 전략을 신규 아키텍처와 어떻게 연동/리팩토링할 것인지** 설계하는 데 목적이 있습니다.

### 핵심 목표

1. **StrategyContext 연동**: 모든 전략이 스크리닝 데이터, 시황 데이터, 거래소 데이터를 활용하도록 리팩토링
2. **통합 진입/청산 로직**: RouteState, MarketRegime, GlobalScore 기반의 일관된 의사결정
3. **공통 모듈 활용**: 포지션 사이징, 리스크 체크 등 중복 로직 제거
4. **전략 레지스트리 패턴**: 전략 추가/제거 시 1곳만 수정

### 리팩토링 원칙

| 원칙 | 설명 |
|------|------|
| **점진적 마이그레이션** | 기존 로직 유지하면서 새 기능 옵트인 방식 추가 |
| **하위 호환성** | 기존 설정/백테스트 결과 재현 가능 |
| **데이터 주입** | 전략이 데이터를 직접 조회하지 않고 Context에서 주입받음 |
| **설정 분리** | 전략 로직과 파라미터 설정 분리 |

---

## 📋 목차

1. [전략 개요](#전략-개요)
2. [새로운 아키텍처](#새로운-아키텍처)
3. [핵심 피처 시스템](#핵심-피처-시스템)
4. [전략 등록 방법](#전략-등록-방법)
5. [전략별 상세 스펙 및 리팩토링 설계](#전략별-상세-스펙)
6. [백테스트 요구사항](#백테스트-요구사항)
7. [미구현 전략](#미구현-전략)

---

## 전략 개요

### 현재 전략 목록 (26개)

#### 단일 자산 전략 (11개)

| 전략명 | 실행 주기 | 핵심 로직 | 주요 연동 데이터 |
|--------|-----------|-----------|-----------------|
| RSI Mean Reversion | 캔들 완성 시 | RSI 14 과매수/과매도 | RouteState, GlobalScore |
| Grid Trading | 가격 변동 시 | 1% 간격 그리드 | MarketRegime, StructuralFeatures |
| Bollinger Bands | 캔들 완성 시 | BB(20, 2σ) 이탈/복귀 | StructuralFeatures |
| SMA Crossover | 캔들 완성 시 | 골든/데드 크로스 | RouteState, MarketBreadth |
| Magic Split | 가격 변동 시 | 10차수 분할매수 | RouteState, MarketRegime |
| Infinity Bot | 가격 변동 시 | 50라운드 무한매수 | 전체 Context |
| Volatility Breakout | 장 시작 5분 후 | 전일 변동성 돌파 | MarketRegime, MacroEnvironment |
| Candle Pattern | 캔들 완성 시 | 35개 패턴 감지 | StructuralFeatures, RouteState |
| Market Interest Day | 장 시작 직후 | 거래량 급증 단타 | GlobalScore, MarketBreadth |
| Stock Gugan | 일간 | 구간분할 장기투자 | MarketRegime, StructuralFeatures |
| Sector VB | 장 시작 5분 후 | 섹터 ETF 변동성 돌파 | MarketBreadth, MacroEnvironment |

#### 자산배분 전략 (13개)

| 전략명 | 실행 주기 | 핵심 로직 | 주요 연동 데이터 |
|--------|-----------|-----------|-----------------|
| Simple Power | 월 1회 | TQQQ/SCHD/PFIX/TMF + MA130 | MacroEnvironment |
| HAA | 월 1회 | TIP 카나리아 기반 | MacroEnvironment, MarketBreadth |
| XAA | 월 1회 | TOP 4 모멘텀 선택 | GlobalScore, MacroEnvironment |
| BAA | 월 1회 | Bold Asset Allocation | MacroEnvironment, MarketBreadth |
| All Weather | 월 1회 | 계절성 자산배분 | 전체 Context |
| Snow | 일 1회 | TIP 모멘텀 기반 | MacroEnvironment, MarketRegime |
| Stock Rotation | 일/주 | 모멘텀 순위 교체 | GlobalScore, MarketRegime |
| Market Cap TOP | 월말 | 미국 시총 상위 10 | GlobalScore |
| Sector Momentum | 월 1회 | 섹터 RS 기반 | MarketBreadth, MacroEnvironment |
| Dual Momentum | 월 1회 | 한국주식 + 미국국채 | MacroEnvironment |
| Small Cap Quant | 일간 | 코스닥 소형주 퀀트 | GlobalScore, StructuralFeatures |
| Pension Bot | 월 1회 | 연금 정적+동적 배분 | MacroEnvironment |
| US 3X Leverage | 일간 | 3배 레버리지/인버스 | RouteState, MarketRegime |

#### 한국 지수 전략 (2개)

| 전략명 | 실행 주기 | 핵심 로직 | 주요 연동 데이터 |
|--------|-----------|-----------|-----------------|
| KOSPI BothSide | 일간 | 레버리지/인버스 양방향 | MarketRegime, MacroEnvironment |
| KOSDAQ Fire Rain | 일간 | 코스피+코스닥 복합 양방향 | MarketRegime, MarketBreadth |

---

## 새로운 아키텍처

### 전략 레지스트리 패턴

**목적**: 전략 추가 시 **1곳만 수정**하면 자동 등록

```rust
register_strategy! {
    id: "my_new_strategy",
    name: "나의 새 전략",
    description: "설명...",
    timeframe: "1d",
    symbols: ["SPY", "QQQ"],
    category: Daily,
    type: MyNewStrategy
}
```

**StrategyMeta 구조체**

```rust
pub struct StrategyMeta {
    pub id: &'static str,
    pub name: &'static str,            // 한글 이름
    pub description: &'static str,
    pub default_timeframe: &'static str,
    pub default_symbols: &'static [&'static str],
    pub category: StrategyCategory,    // Realtime/Intraday/Daily/Monthly
    pub factory: fn() -> Box<dyn Strategy>,
}
```

---

### StrategyContext (전략 실행 컨텍스트)

**목적**: 전략 간 포지션/계좌 정보 공유, 분석 결과 조회

```rust
pub struct StrategyContext {
    // ===== 거래소 실시간 정보 =====
    pub account: AccountInfo,
    pub positions: HashMap<Symbol, PositionInfo>,
    pub pending_orders: Vec<PendingOrder>,
    pub exchange_constraints: ExchangeConstraints,

    // ===== 외부 분석 결과 =====
    pub global_scores: HashMap<Symbol, GlobalScoreResult>,
    pub route_states: HashMap<Symbol, RouteState>,
    pub market_regime: HashMap<Symbol, MarketRegime>,
    pub structural_features: HashMap<Symbol, StructuralFeatures>,
    pub macro_environment: MacroEnvironment,
    pub market_breadth: MarketBreadth,
}
```

---

### StrategyContext 데이터 소스 상세

#### 1. 거래소 실시간 정보

##### AccountInfo (계좌 정보)
```rust
pub struct AccountInfo {
    pub total_balance: Decimal,         // 총 평가금액
    pub available_balance: Decimal,     // 주문 가능 금액
    pub buying_power: Decimal,          // 매수 가능 금액 (레버리지 포함)
    pub margin_used: Decimal,           // 사용 중인 마진
    pub margin_ratio: f64,              // 마진 비율 (%)
    pub unrealized_pnl: Decimal,        // 미실현 손익
    pub daily_pnl: Decimal,             // 일일 손익
}
```

**활용 예시**:
```rust
// 포지션 사이징: 가용 잔고의 일정 비율만 사용
let max_position = ctx.account.available_balance * Decimal::from_str("0.1")?;

// 마진 체크: 80% 이상 사용 시 신규 진입 중단
if ctx.account.margin_ratio > 0.8 {
    return vec![]; // 신규 신호 생성 안 함
}
```

##### PositionInfo (포지션 정보)
```rust
pub struct PositionInfo {
    pub symbol: Symbol,
    pub quantity: Decimal,              // 보유 수량
    pub avg_entry_price: Decimal,       // 평균 진입가
    pub current_price: Decimal,         // 현재가
    pub unrealized_pnl: Decimal,        // 미실현 손익
    pub unrealized_pnl_pct: f64,        // 미실현 손익률 (%)
    pub entry_time: DateTime<Utc>,      // 진입 시간
    pub holding_days: i64,              // 보유 일수
}
```

**활용 예시**:
```rust
// 보유 종목 손익률 확인
if let Some(pos) = ctx.positions.get(&symbol) {
    // 트레일링 스톱: 10% 수익 달성 후 5% 하락 시 청산
    if pos.unrealized_pnl_pct > 10.0 && trailing_stop_triggered {
        return vec![Signal::sell(symbol, pos.quantity)];
    }

    // 장기 보유 패널티: 60일 이상 보유 시 손절 기준 완화
    if pos.holding_days > 60 {
        // ...
    }
}
```

##### ExchangeConstraints (거래소 제약조건)
```rust
pub struct ExchangeConstraints {
    pub min_order_size: HashMap<Symbol, Decimal>,   // 최소 주문 수량
    pub max_order_size: HashMap<Symbol, Decimal>,   // 최대 주문 수량
    pub tick_size: HashMap<Symbol, Decimal>,        // 호가 단위
    pub lot_size: HashMap<Symbol, Decimal>,         // 수량 단위
    pub trading_hours: TradingHours,                // 거래 시간
    pub daily_limit: Option<DailyLimit>,            // 일일 거래 한도
}
```

**활용 예시**:
```rust
// 주문 수량을 거래소 규칙에 맞게 조정
let quantity = self.round_to_lot_size(
    calculated_qty,
    ctx.exchange_constraints.lot_size.get(&symbol)
);

// 거래 시간 확인
if !ctx.exchange_constraints.trading_hours.is_open_now() {
    return vec![]; // 장외 시간엔 신호 생성 안 함
}
```

---

#### 2. 스크리닝/분석 데이터

##### GlobalScoreResult (종합 점수)
```rust
pub struct GlobalScoreResult {
    pub symbol: Symbol,
    pub total_score: f64,               // 종합 점수 (0~100)
    pub rank: usize,                    // 유니버스 내 순위

    // 7개 팩터별 점수
    pub risk_reward: f64,               // RR: 손익비
    pub t1_return: f64,                 // T1: T+1 기대 수익
    pub stop_loss: f64,                 // SL: 손절 거리
    pub nearness: f64,                  // NEAR: 지지선 근접도
    pub momentum: f64,                  // MOM: 모멘텀
    pub liquidity: f64,                 // LIQ: 유동성
    pub technical: f64,                 // TEC: 기술적 지표

    pub calculated_at: DateTime<Utc>,
}
```

**활용 예시**:
```rust
// 스크리닝: 상위 N개 종목만 대상
let top_symbols: Vec<_> = ctx.global_scores.values()
    .filter(|s| s.total_score >= 60.0)  // 60점 이상
    .sorted_by(|a, b| b.rank.cmp(&a.rank))
    .take(10)
    .collect();

// 팩터별 필터링
if let Some(score) = ctx.global_scores.get(&symbol) {
    // 유동성 부족 종목 제외
    if score.liquidity < 30.0 {
        return vec![];
    }
    // 높은 손익비 종목 우선
    if score.risk_reward > 70.0 {
        position_size *= 1.5;  // 사이즈 증가
    }
}
```

##### RouteState (매매 상태)
```rust
pub enum RouteState {
    Attack,    // 🚀 적극 매수 구간
    Armed,     // 🔫 대기 - 진입 준비 완료
    Wait,      // ⏳ 관망 - 정배열 유지 중
    Overheat,  // 🔥 과열 - 신규 진입 금지
    Neutral,   // ⚪ 중립 - 기본 로직 적용
}
```

**활용 예시**:
```rust
match ctx.route_states.get(&symbol) {
    Some(RouteState::Attack) => {
        // 공격적 진입: 풀사이즈
        Signal::buy(symbol, full_size)
    }
    Some(RouteState::Armed) => {
        // 조건부 진입: 절반 사이즈
        if additional_confirmation {
            Signal::buy(symbol, half_size)
        }
    }
    Some(RouteState::Overheat) => {
        // 진입 금지, 기존 포지션 부분 청산 고려
        if has_position {
            Signal::reduce(symbol, 0.3)  // 30% 청산
        }
    }
    _ => vec![]
}
```

##### MarketRegime (시장 레짐)
```rust
pub enum MarketRegime {
    StrongUptrend,  // ① 강한 상승 - 모멘텀 전략 유리
    Correction,     // ② 조정 - 평균회귀 전략 유리
    Sideways,       // ③ 횡보 - 그리드/변동성 전략 유리
    BottomBounce,   // ④ 바닥 반등 - 분할매수 전략 유리
    Downtrend,      // ⑤ 하락 - 방어적 전략/인버스 유리
}
```

**활용 예시**:
```rust
let regime = ctx.market_regime.get(&index_symbol);

// 레짐에 따른 전략 파라미터 동적 조정
let k_factor = match regime {
    Some(MarketRegime::StrongUptrend) => 0.6,   // 돌파 기준 상향
    Some(MarketRegime::Sideways) => 0.4,        // 돌파 기준 하향
    Some(MarketRegime::Downtrend) => 0.0,       // 진입 중단
    _ => 0.5,                                    // 기본값
};

// 레짐별 전략 선택
let strategy_weights = match regime {
    Some(MarketRegime::Sideways) => {
        vec![("grid", 0.5), ("bollinger", 0.3), ("rsi", 0.2)]
    }
    Some(MarketRegime::StrongUptrend) => {
        vec![("momentum", 0.6), ("breakout", 0.3), ("sma", 0.1)]
    }
    _ => vec![("balanced", 1.0)]
};
```

##### StructuralFeatures (구조적 피처)
```rust
pub struct StructuralFeatures {
    pub low_trend: f64,      // Higher Low 강도 (-1~+1)
    pub vol_quality: f64,    // 매집/이탈 판별 (-3~+3)
    pub range_pos: f64,      // 박스권 위치 (0~1)
    pub dist_ma20: f64,      // MA20 이격도 (%)
    pub bb_width: f64,       // 볼린저 밴드 폭 (%)
    pub rsi: f64,            // RSI 14일
}
```

**활용 예시**:
```rust
if let Some(feat) = ctx.structural_features.get(&symbol) {
    // 매집 구간 탐지: 거래량 품질 + 박스권 하단
    let accumulation_signal = feat.vol_quality > 1.5
        && feat.range_pos < 0.3
        && feat.low_trend > 0.5;

    // 스퀴즈 탐지: BB 폭 축소
    let squeeze_detected = feat.bb_width < 10.0;

    // RSI 극단값에서 평균회귀
    if feat.rsi < 25.0 && feat.low_trend > 0 {
        // 과매도 + 상승 저점: 매수 신호
    }
}
```

---

#### 3. 매크로/시장 환경 데이터

##### MacroEnvironment (매크로 환경)
```rust
pub struct MacroEnvironment {
    pub usd_krw: f64,                   // 환율
    pub usd_krw_trend: Trend,           // 환율 추세
    pub nasdaq_regime: MarketRegime,    // 나스닥 레짐
    pub vix: f64,                       // VIX 지수
    pub vix_percentile: f64,            // VIX 백분위 (최근 1년)
    pub fed_rate: f64,                  // 기준금리
    pub yield_curve_slope: f64,         // 장단기 금리차
    pub tip_momentum: f64,              // TIP 모멘텀 (인플레이션)
}
```

**활용 예시**:
```rust
// VIX 기반 포지션 사이징
let vix_adjustment = if ctx.macro_environment.vix > 30.0 {
    0.5  // 변동성 높으면 절반 사이즈
} else if ctx.macro_environment.vix < 15.0 {
    1.2  // 변동성 낮으면 사이즈 증가
} else {
    1.0
};

// 환율 헤지 결정
if ctx.macro_environment.usd_krw_trend == Trend::StrongUp {
    // 달러 강세 시 한국 주식 비중 축소
    kr_weight *= 0.7;
}

// 금리 환경 반영
if ctx.macro_environment.yield_curve_slope < 0.0 {
    // 장단기 금리 역전: 경기 침체 우려 → 방어적 자산 비중 확대
    defensive_weight *= 1.5;
}
```

##### MarketBreadth (시장 폭)
```rust
pub struct MarketBreadth {
    pub above_ma20_pct: f64,            // 20일선 위 종목 비율 (%)
    pub above_ma50_pct: f64,            // 50일선 위 종목 비율 (%)
    pub above_ma200_pct: f64,           // 200일선 위 종목 비율 (%)
    pub advance_decline_ratio: f64,     // 등락 비율
    pub new_high_low_ratio: f64,        // 신고가/신저가 비율
    pub sector_rotation: SectorRotation, // 섹터 로테이션 상태
    pub calculated_at: DateTime<Utc>,
}
```

**활용 예시**:
```rust
// 시장 참여도 확인
if ctx.market_breadth.above_ma20_pct < 30.0 {
    // 30% 미만만 20일선 위: 약세장 → 방어 모드
    max_position_count = 3;  // 최대 포지션 수 제한
}

// 모멘텀 확인
if ctx.market_breadth.advance_decline_ratio > 2.0
    && ctx.market_breadth.new_high_low_ratio > 3.0 {
    // 강한 상승세: 공격적 진입
    leverage = 1.5;
}

// 섹터 로테이션 활용
match ctx.market_breadth.sector_rotation {
    SectorRotation::EarlyExpansion => {
        // 경기민감주 비중 확대
        cyclical_weight *= 1.3;
    }
    SectorRotation::LateContraction => {
        // 방어주 비중 확대
        defensive_weight *= 1.3;
    }
    _ => {}
}
```

---

### 공통 로직 모듈

```
strategies/common/
├── position_sizing.rs    # 켈리, 고정비율, ATR 기반 사이징
├── risk_checks.rs        # 최대 포지션, 일일 손실 한도
├── signal_filters.rs     # 노이즈 필터, 확인 신호
├── entry_exit.rs         # 진입/청산 공통 로직
├── indicators.rs         # 기술적 지표 계산 (공용)
├── momentum.rs           # 모멘텀 스코어 계산
└── position_sync.rs      # ✅ 구현 완료
```

---

## 핵심 피처 시스템

### 1. StructuralFeatures (구조적 피처)

```rust
pub struct StructuralFeatures {
    pub low_trend: f64,      // Higher Low 강도 (-1~+1)
    pub vol_quality: f64,    // 매집/이탈 판별 (-3~+3)
    pub range_pos: f64,      // 박스권 위치 (0~1)
    pub dist_ma20: f64,      // MA20 이격도 (%)
    pub bb_width: f64,       // 볼린저 밴드 폭 (%)
    pub rsi: f64,            // RSI 14일
}
```

### 2. RouteState (매매 상태)

```rust
pub enum RouteState {
    Attack,    // 🚀 TTM Squeeze 해제 + 모멘텀 상승 + RSI 45~65
    Armed,     // 🔫 Squeeze 중 + MA20 위
    Wait,      // ⏳ 정배열 + MA 지지
    Overheat,  // 🔥 5일 수익률 > 20% 또는 RSI >= 75
    Neutral,   // ⚪ 위 조건 미충족
}
```

### 3. MarketRegime (시장 레짐)

```rust
pub enum MarketRegime {
    StrongUptrend,  // ① 강한 상승 추세
    Correction,     // ② 상승 후 조정
    Sideways,       // ③ 박스 / 중립
    BottomBounce,   // ④ 바닥 반등 시도
    Downtrend,      // ⑤ 하락 / 약세
}
```

### 4. Global Score (종합 점수)

**7개 팩터 가중치**

| 팩터 | 코드 | 가중치 |
|------|------|--------|
| Risk-Reward | RR | 0.25 |
| T+1 Return | T1 | 0.18 |
| Stop Loss | SL | 0.12 |
| Nearness | NEAR | 0.12 |
| Momentum | MOM | 0.10 |
| Liquidity | LIQ | 0.13 |
| Technical | TEC | 0.10 |

### 5. 추가 피처

- **TTM Squeeze**: BB가 KC 내부로 들어가면 에너지 응축
- **TRIGGER**: 진입 트리거 시스템 (점수 0~100)
- **Macro Filter**: USD/KRW, 나스닥 모니터링
- **Market Breadth**: 20일선 상회 비율
- **Sector RS**: 섹터 상대강도

---

## 전략 등록 방법

```rust
// crates/trader-strategy/src/strategies/my_strategy.rs

pub struct MyStrategy {
    config: MyStrategyConfig,
}

impl Strategy for MyStrategy {
    fn name(&self) -> &str { "my_strategy" }

    fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
        // 1. RouteState 확인
        if ctx.route_states.get(&self.symbol) != Some(&RouteState::Attack) {
            return vec![];
        }
        // 2. 신호 생성 로직
        // ...
    }
}

register_strategy! {
    id: "my_strategy",
    name: "나의 전략",
    timeframe: "1d",
    category: Daily,
    type: MyStrategy
}
```

---

## 전략별 상세 스펙 및 리팩토링 설계

> 각 전략별로 **현재 구현**, **리팩토링 설계**, **데이터 활용** 섹션을 포함합니다.

### 단일 자산 전략

---

#### 1. RSI Mean Reversion

**Rust 구현** ([rsi.rs](../crates/trader-strategy/src/strategies/rsi.rs))
```rust
period: 14
oversold_threshold: 30.0
overbought_threshold: 70.0
use_ema_smoothing: true  // Wilder's 스무딩
cooldown_candles: 5
stop_loss_pct: Option<f64>
take_profit_pct: Option<f64>
```

**실행 주기**: 실시간/분봉/일봉 - 캔들 완성 시마다

##### 리팩토링 설계

**현재 로직**:
```rust
// 단순 RSI 기반 진입
if rsi < 30.0 { Signal::Buy }
else if rsi > 70.0 { Signal::Sell }
```

**신규 로직** (StrategyContext 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    let rsi = self.calculate_rsi(candles);

    // 1️⃣ 전역 필터: RouteState 확인
    let route = ctx.route_states.get(&self.symbol);
    if route == Some(&RouteState::Overheat) {
        return vec![]; // 과열 구간 진입 금지
    }

    // 2️⃣ 스크리닝 필터: GlobalScore 확인
    let score = ctx.global_scores.get(&self.symbol);
    if score.map(|s| s.total_score < 50.0).unwrap_or(true) {
        return vec![]; // 50점 미만 종목 제외
    }

    // 3️⃣ 구조적 피처 활용: 추세 방향 확인
    let feat = ctx.structural_features.get(&self.symbol);
    let uptrend = feat.map(|f| f.low_trend > 0.3).unwrap_or(false);

    // 4️⃣ 조건부 진입
    if rsi < self.config.oversold_threshold && uptrend {
        // 과매도 + 상승 저점 형성 → 강한 매수 신호
        let size = self.calculate_position_size(ctx, score);
        return vec![Signal::buy(self.symbol.clone(), size)];
    }

    vec![]
}
```

**추가할 설정 필드**:
```rust
pub struct RsiConfig {
    // 기존 필드...

    // 신규: Context 연동 옵션
    pub use_route_filter: bool,         // RouteState 필터 활성화
    pub min_global_score: Option<f64>,  // 최소 GlobalScore
    pub use_trend_confirm: bool,        // 추세 확인 필터
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| RouteState | `Overheat` 시 진입 금지, `Attack` 시 사이즈 증가 |
| GlobalScore | 50점 이상 종목만 대상, RR 팩터로 목표가 설정 |
| StructuralFeatures | `low_trend > 0` 상승 추세에서만 매수 |
| MarketBreadth | 20일선 위 종목 30% 이하 시 전략 비활성화 |

---

#### 2. Grid Trading

**Rust 구현** ([grid.rs](../crates/trader-strategy/src/strategies/grid.rs))
```rust
grid_spacing_pct: 1.0      // 1% 간격
grid_levels: 10            // 상하 각 10레벨
dynamic_spacing: bool      // ATR 기반 동적 간격
atr_period: 14
atr_multiplier: 1.0
trend_filter: bool         // 추세 필터
ma_period: 20
reset_threshold_pct: 5.0   // 그리드 재설정 임계값
```

**실행 주기**: 실시간 - 가격 변동 시마다

##### 리팩토링 설계

**현재 로직**:
```rust
// 고정 간격 또는 ATR 기반 동적 간격
let spacing = if dynamic { atr * multiplier } else { price * spacing_pct };
```

**신규 로직** (MarketRegime + StructuralFeatures 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    // 1️⃣ 레짐 확인: 횡보장에서만 그리드 전략 활성화
    let regime = ctx.market_regime.get(&self.symbol);
    if regime != Some(&MarketRegime::Sideways) {
        // 횡보장이 아니면 기존 그리드 유지만
        return self.maintain_existing_grid();
    }

    // 2️⃣ 볼린저 폭으로 동적 그리드 간격 조정
    let feat = ctx.structural_features.get(&self.symbol);
    let spacing = match feat {
        Some(f) if f.bb_width < 10.0 => {
            // 스퀴즈 감지: 좁은 간격으로 빈번한 거래
            self.config.grid_spacing_pct * 0.6
        }
        Some(f) if f.bb_width > 25.0 => {
            // 변동성 확대: 넓은 간격
            self.config.grid_spacing_pct * 1.5
        }
        _ => self.config.grid_spacing_pct
    };

    // 3️⃣ RouteState 기반 그리드 관리
    match ctx.route_states.get(&self.symbol) {
        Some(RouteState::Overheat) => {
            // 과열: 신규 그리드 생성 중단, 매도 그리드만 유지
            self.sell_grids_only()
        }
        Some(RouteState::Attack) => {
            // 공격: 상방 그리드 확대
            self.expand_upper_grids(spacing)
        }
        _ => self.create_balanced_grid(spacing)
    }
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MarketRegime | `Sideways` 레짐에서만 활성화 |
| StructuralFeatures | `bb_width`로 동적 간격 조정 |
| RouteState | `Overheat` 시 매도 그리드만, `Attack` 시 상방 확대 |
| MacroEnvironment | VIX > 30 시 그리드 간격 2배 확대 |

---

#### 3. Bollinger Bands

**Rust 구현** ([bollinger.rs](../crates/trader-strategy/src/strategies/bollinger.rs))
```rust
period: 20
std_dev: 2.0
entry_mode: BollingerEntryMode::MeanReversion  // 또는 Breakout
exit_mode: BollingerExitMode::OppositeTouch
stop_loss_pct: Option<f64>
```

**실행 주기**: 실시간/분봉/일봉 - 캔들 완성 시

##### 리팩토링 설계

**현재 로직**:
```rust
// 고정 밴드 기반 진입
if price <= lower_band { buy() }
else if price >= upper_band { sell() }
```

**신규 로직** (StructuralFeatures + MarketRegime 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    let (upper, middle, lower) = self.calculate_bands(candles);
    let price = candles.last_close();

    // 1️⃣ MarketRegime에 따른 진입 모드 자동 선택
    let entry_mode = match ctx.market_regime.get(&self.symbol) {
        Some(MarketRegime::Sideways) => BollingerEntryMode::MeanReversion,
        Some(MarketRegime::StrongUptrend) => BollingerEntryMode::Breakout,
        Some(MarketRegime::Downtrend) => return vec![], // 비활성화
        _ => self.config.entry_mode
    };

    // 2️⃣ StructuralFeatures로 스퀴즈 상태 확인
    let feat = ctx.structural_features.get(&self.symbol);
    let in_squeeze = feat.map(|f| f.bb_width < 8.0).unwrap_or(false);

    // 3️⃣ 스퀴즈 해제 시 돌파 모드로 전환
    if in_squeeze {
        return vec![]; // 스퀴즈 중 대기
    }

    match entry_mode {
        BollingerEntryMode::MeanReversion => {
            if price <= lower && feat.map(|f| f.low_trend > 0.0).unwrap_or(false) {
                // 하단 터치 + 상승 저점: 매수
                self.generate_buy_signal(ctx)
            } else { vec![] }
        }
        BollingerEntryMode::Breakout => {
            if price > upper && ctx.route_states.get(&self.symbol) == Some(&RouteState::Attack) {
                // 상단 돌파 + Attack 상태: 추세 추종 매수
                self.generate_buy_signal(ctx)
            } else { vec![] }
        }
    }
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MarketRegime | 레짐별 진입 모드 자동 선택 |
| StructuralFeatures | `bb_width` 스퀴즈 감지, `low_trend` 추세 확인 |
| RouteState | `Attack` 상태에서만 돌파 매수 허용 |

---

#### 4. SMA Crossover

**Rust 구현** ([sma.rs](../crates/trader-strategy/src/strategies/sma.rs))
```rust
short_period: 20
long_period: 60
signal_confirmation: 1     // 확인 캔들 수
volume_filter: bool
volume_threshold: 1.5      // 평균 대비 배수
```

**실행 주기**: 분봉/일봉 - 캔들 완성 시

##### 리팩토링 설계

**현재 로직**:
```rust
// 단순 교차 감지
if short_ma > long_ma && prev_short_ma <= prev_long_ma { buy() }
```

**신규 로직** (RouteState + MarketBreadth 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    let (short_ma, long_ma) = self.calculate_mas(candles);
    let golden_cross = self.detect_golden_cross(candles);
    let dead_cross = self.detect_dead_cross(candles);

    // 1️⃣ MarketBreadth로 시장 전체 추세 확인
    let market_bullish = ctx.market_breadth.above_ma50_pct > 50.0;
    let market_bearish = ctx.market_breadth.above_ma50_pct < 30.0;

    // 2️⃣ 골든크로스 + 시장 동조
    if golden_cross && market_bullish {
        // RouteState 확인
        match ctx.route_states.get(&self.symbol) {
            Some(RouteState::Attack | RouteState::Armed) => {
                return self.generate_buy_signal(ctx);
            }
            Some(RouteState::Overheat) => {
                // 과열: 진입 사이즈 축소
                return self.generate_buy_signal_half_size(ctx);
            }
            _ => {}
        }
    }

    // 3️⃣ 데드크로스 + 시장 약세
    if dead_cross && market_bearish {
        if let Some(pos) = ctx.positions.get(&self.symbol) {
            return vec![Signal::sell(self.symbol.clone(), pos.quantity)];
        }
    }

    // 4️⃣ 추세 강도에 따른 포지션 관리
    if let Some(pos) = ctx.positions.get(&self.symbol) {
        let trend_strength = (short_ma - long_ma) / long_ma * 100.0;
        if trend_strength < 0.5 && pos.unrealized_pnl_pct > 5.0 {
            // 추세 약화 + 수익 중: 부분 청산
            return vec![Signal::reduce(self.symbol.clone(), 0.5)];
        }
    }

    vec![]
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MarketBreadth | 시장 전체 추세와 동조 확인 |
| RouteState | 진입 타이밍 및 사이즈 조절 |
| PositionInfo | 기존 포지션 수익률 기반 청산 결정 |

---

#### 5. Magic Split (10차수 분할매수)

**Rust 구현** ([magic_split.rs](../crates/trader-strategy/src/strategies/magic_split.rs))
```rust
levels: [
    SplitLevel { number: 1, target_rate: 10.0%, trigger_rate: None, invest: 200000 },
    SplitLevel { number: 2, target_rate: 2.0%, trigger_rate: -3.0%, invest: 100000 },
    // ... 10차수까지
]
allow_same_day_reentry: false
slippage_tolerance: 1.0%
```

**실행 주기**: 실시간 - 가격 변동 시마다

##### 리팩토링 설계

**현재 로직**:
```rust
// 단순 가격 기반 차수 판단
if price <= entry_price * (1.0 + trigger_rate) {
    buy_next_level()
}
```

**신규 로직** (RouteState + MarketRegime 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    let current_level = self.get_current_level();
    let next_trigger = self.get_next_trigger_price();

    // 1️⃣ 1차 진입: RouteState 기반 타이밍 최적화
    if current_level == 0 {
        match ctx.route_states.get(&self.symbol) {
            Some(RouteState::Attack | RouteState::Armed) => {
                // 좋은 타이밍: 즉시 1차 진입
                return vec![Signal::buy(self.symbol.clone(), self.levels[0].invest)];
            }
            Some(RouteState::Wait) => {
                // 대기: 스퀴즈 해제 대기
                return vec![];
            }
            _ => {}
        }
    }

    // 2️⃣ 추가 매수: MarketRegime에 따른 차수 조정
    let regime = ctx.market_regime.get(&self.symbol);
    let level_adjustment = match regime {
        Some(MarketRegime::BottomBounce) => {
            // 바닥 반등: 공격적 추가 매수 (한 차수 앞당김)
            1
        }
        Some(MarketRegime::Downtrend) => {
            // 하락장: 보수적 (한 차수 늦춤)
            -1
        }
        _ => 0
    };

    // 3️⃣ GlobalScore로 종목 품질 확인
    if let Some(score) = ctx.global_scores.get(&self.symbol) {
        if score.total_score < 40.0 && current_level >= 5 {
            // 저품질 종목 + 고차수: 손절 고려
            if current_level >= 7 {
                return self.partial_stop_loss(0.3); // 30% 손절
            }
        }
    }

    self.check_level_trigger_with_adjustment(level_adjustment)
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| RouteState | 1차 진입 타이밍 최적화, `Attack` 시 진입 |
| MarketRegime | `BottomBounce`에서 공격적 추가매수, `Downtrend`에서 보수적 |
| GlobalScore | 40점 미만 + 고차수 시 부분 손절 고려 |
| StructuralFeatures | `vol_quality > 2` 매집 감지 시 익절 기준 상향 |

---

#### 6. Infinity Bot (무한매수봇)

**Rust 구현** ([infinity_bot.rs](../crates/trader-strategy/src/strategies/infinity_bot.rs))
```rust
max_rounds: 50
round_amount_pct: 2.0%
dip_trigger_pct: 2.0%
take_profit_pct: 3.0%
stop_loss_pct: 20.0%         // 40라운드 이후
short_ma_period: 10
mid_ma_period: 100
long_ma_period: 200
momentum_weights: [0.3, 0.2, 0.3]
```

**실행 주기**: 실시간 - 가격 변동 시마다

##### 리팩토링 설계

**현재 로직**:
```rust
// 라운드별 고정 조건
match round {
    1..=5 => check_momentum_only(),
    6..=20 => check_ma(),
    21..=30 => check_ma_and_candle(),
    _ => check_all_conditions()
}
```

**신규 로직** (전체 Context 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    let round = self.get_current_round();
    let price = candles.last_close();

    // 1️⃣ 초기 진입 (1-5라운드): RouteState 기반
    if round <= 5 {
        match ctx.route_states.get(&self.symbol) {
            Some(RouteState::Attack | RouteState::Armed) => {
                return self.buy_next_round(ctx);
            }
            Some(RouteState::Overheat) => {
                // 과열: 초기 진입도 대기
                return vec![];
            }
            _ => {
                // 기존 로직: 모멘텀 체크
                if self.check_momentum(candles) {
                    return self.buy_next_round(ctx);
                }
            }
        }
    }

    // 2️⃣ 중간 라운드 (6-30): MarketRegime + GlobalScore 연동
    if round <= 30 {
        let regime = ctx.market_regime.get(&self.symbol);
        let score = ctx.global_scores.get(&self.symbol);

        // 하락장에서 추가 매수 속도 조절
        let round_skip = match regime {
            Some(MarketRegime::Downtrend) => 2,      // 2라운드마다 1번만 진입
            Some(MarketRegime::BottomBounce) => 0,   // 바닥반등: 적극 진입
            _ => 1
        };

        // GlobalScore로 종목 품질 확인
        if score.map(|s| s.total_score < 35.0).unwrap_or(false) && round > 20 {
            // 저품질 + 고라운드: 진입 중단
            return vec![];
        }

        if self.check_round_conditions(round, candles, round_skip) {
            return self.buy_next_round(ctx);
        }
    }

    // 3️⃣ 고라운드 (31+): 손절 로직 강화
    if round > 30 {
        // StructuralFeatures로 추세 판단
        let feat = ctx.structural_features.get(&self.symbol);
        let trend_broken = feat.map(|f| f.low_trend < -0.5).unwrap_or(false);

        if round >= 40 && trend_broken {
            // 추세 이탈 + 40라운드: 50% 손절
            return self.partial_exit(0.5);
        }

        // MacroEnvironment: VIX 급등 시 조기 손절
        if ctx.macro_environment.vix > 40.0 && round >= 35 {
            return self.partial_exit(0.3);
        }
    }

    // 4️⃣ 익절: 트레일링 스톱
    self.check_trailing_stop(ctx, price)
}

fn buy_next_round(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 포지션 사이징: 계좌 잔고 기반
    let available = ctx.account.available_balance;
    let round_amount = available * Decimal::from_str("0.02")?;

    vec![Signal::buy(self.symbol.clone(), round_amount)]
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| RouteState | 초기 진입 타이밍, `Overheat` 시 대기 |
| MarketRegime | `Downtrend`에서 진입 속도 조절, `BottomBounce`에서 적극 진입 |
| GlobalScore | 35점 미만 + 20라운드 이상 시 진입 중단 |
| StructuralFeatures | `low_trend < -0.5` 추세 이탈 시 손절 |
| MacroEnvironment | VIX > 40 시 조기 손절 |
| AccountInfo | 가용 잔고 기반 라운드 금액 계산 |

---

#### 7. Volatility Breakout (변동성 돌파)

**Rust 구현** ([volatility_breakout.rs](../crates/trader-strategy/src/strategies/volatility_breakout.rs))
```rust
k_factor: 0.5
entry_after_minutes: 5
exit_time: "15:20"
stop_loss_pct: 2.0
use_noise_filter: bool
noise_ratio_threshold: 0.6
```

**실행 주기**: 일 1회 - 장 시작 5분 후

##### 리팩토링 설계

**현재 로직**:
```rust
// 고정 K 팩터
let target = open + (prev_high - prev_low) * 0.5;
if current_price > target { entry() }
```

**신규 로직** (전체 Context 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    // 1️⃣ 매크로 환경 체크
    if ctx.macro_environment.vix > 35.0 {
        // VIX 극단적 고점: 변동성 돌파 비활성화
        return vec![];
    }

    // 2️⃣ MarketRegime에 따른 K 팩터 동적 조정
    let k_factor = match ctx.market_regime.get(&self.symbol) {
        Some(MarketRegime::StrongUptrend) => 0.4,   // 상승장: 낮은 기준
        Some(MarketRegime::BottomBounce) => 0.35,   // 바닥반등: 더 낮은 기준 (적극적)
        Some(MarketRegime::Sideways) => 0.55,       // 횡보: 높은 기준 (보수적)
        Some(MarketRegime::Downtrend) => return vec![], // 하락장: 비활성화
        _ => self.config.k_factor
    };

    // 3️⃣ StructuralFeatures로 스퀴즈 확인
    let feat = ctx.structural_features.get(&self.symbol);
    let squeeze_active = feat.map(|f| f.bb_width < 12.0).unwrap_or(false);

    // 4️⃣ MarketBreadth로 시장 참여도 확인
    let broad_participation = ctx.market_breadth.above_ma20_pct > 50.0;

    // 5️⃣ 돌파 타겟 계산
    let range = candles.prev_high() - candles.prev_low();
    let target = candles.today_open() + range * k_factor;

    // 6️⃣ 진입 조건 확인
    if current_price > target {
        // 스퀴즈 후 돌파 + 시장 참여도 높음 → 풀사이즈
        let size = if squeeze_active && broad_participation {
            self.full_position_size(ctx)
        } else {
            self.half_position_size(ctx)
        };

        return vec![Signal::buy(self.symbol.clone(), size)];
    }

    vec![]
}
```

**추가할 설정 필드**:
```rust
pub struct VolatilityBreakoutConfig {
    // 기존 필드...

    // 신규: 레짐별 K 팩터 오버라이드
    pub k_factor_by_regime: Option<HashMap<MarketRegime, f64>>,
    pub min_market_breadth: Option<f64>,  // 최소 시장 참여도
    pub max_vix: Option<f64>,             // VIX 상한
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MarketRegime | 레짐별 K 팩터 동적 조정, `Downtrend` 시 비활성화 |
| StructuralFeatures | 스퀴즈 감지 → 돌파 시 사이즈 증가 |
| MacroEnvironment | VIX > 35 시 비활성화 |
| MarketBreadth | 참여도 50% 이상 시 풀사이즈 |

---

#### 8. Candle Pattern (캔들 패턴)

**Rust 구현** ([candle_pattern.rs](../crates/trader-strategy/src/strategies/candle_pattern.rs))
```rust
patterns_enabled: Vec<CandlePatternType>
min_pattern_strength: 0.7
confirmation_candles: 1
volume_confirmation: bool
```

**실행 주기**: 캔들 완성 시

##### 리팩토링 설계

**현재 로직**:
```rust
// 패턴 감지 → 즉시 신호 생성
if let Some(pattern) = detect_pattern(candles) {
    generate_signal(pattern)
}
```

**신규 로직** (StructuralFeatures + RouteState 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    let patterns = self.detect_all_patterns(candles);

    for pattern in patterns {
        // 1️⃣ 패턴 유형별 필터링
        match pattern.pattern_type {
            // 반전 패턴: 추세 확인 필요
            CandlePatternType::Hammer | CandlePatternType::MorningStar => {
                let feat = ctx.structural_features.get(&self.symbol);

                // 바닥권에서만 반전 패턴 유효
                if feat.map(|f| f.range_pos > 0.3).unwrap_or(true) {
                    continue; // 바닥권 아님
                }

                // RouteState가 Attack/Armed일 때만 진입
                if !matches!(ctx.route_states.get(&self.symbol),
                    Some(RouteState::Attack | RouteState::Armed)) {
                    continue;
                }
            }

            // 지속 패턴: 기존 추세 확인
            CandlePatternType::ThreeSoldiers => {
                let regime = ctx.market_regime.get(&self.symbol);
                if regime != Some(&MarketRegime::StrongUptrend) {
                    continue; // 상승 추세 아님
                }
            }

            _ => {}
        }

        // 2️⃣ GlobalScore로 종목 품질 확인
        if let Some(score) = ctx.global_scores.get(&self.symbol) {
            if score.total_score < 45.0 {
                continue; // 저품질 종목 제외
            }

            // 패턴 강도 + GlobalScore로 사이즈 결정
            let size_multiplier = (pattern.strength + score.total_score / 100.0) / 2.0;
            return vec![Signal::buy_with_size(self.symbol.clone(), size_multiplier)];
        }
    }

    vec![]
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| StructuralFeatures | `range_pos`로 반전 패턴 위치 검증 |
| RouteState | 반전 패턴 진입 타이밍 필터 |
| MarketRegime | 지속 패턴 추세 확인 |
| GlobalScore | 종목 품질 + 포지션 사이즈 결정 |

---

#### 9. Market Interest Day (시장관심 단타)

**Rust 구현** ([market_interest_day.rs](../crates/trader-strategy/src/strategies/market_interest_day.rs))
```rust
volume_multiplier: 2.0
volume_period: 20
trailing_stop_pct: 1.5%
take_profit_pct: 3.0%
stop_loss_pct: 2.0%
max_hold_minutes: 120
rsi_overbought: 80
```

**실행 주기**: 일 1회 - 장 시작 직후

##### 리팩토링 설계

**현재 로직**:
```rust
// 거래량 급증 종목 스캔 → 진입
if volume > avg_volume * 2.0 {
    entry_with_trailing_stop()
}
```

**신규 로직** (GlobalScore + MarketBreadth 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    // 1️⃣ 시장 환경 확인
    if ctx.market_breadth.above_ma20_pct < 40.0 {
        // 약세장: 단타 전략 비활성화
        return vec![];
    }

    // 2️⃣ 거래량 급증 종목 필터링 (기존 로직)
    let volume_surge = self.detect_volume_surge(candles);
    if !volume_surge {
        return vec![];
    }

    // 3️⃣ GlobalScore로 종목 선별
    let score = ctx.global_scores.get(&self.symbol);
    if score.map(|s| s.total_score < 55.0).unwrap_or(true) {
        return vec![]; // 품질 미달
    }

    // 4️⃣ StructuralFeatures로 매집 여부 확인
    let feat = ctx.structural_features.get(&self.symbol);
    let accumulation = feat.map(|f| f.vol_quality > 1.0).unwrap_or(false);

    if !accumulation {
        return vec![]; // 이탈 거래량 → 패스
    }

    // 5️⃣ RouteState 기반 진입
    match ctx.route_states.get(&self.symbol) {
        Some(RouteState::Attack) => {
            // 공격 상태: 풀사이즈 진입
            self.generate_entry_signal(ctx, 1.0)
        }
        Some(RouteState::Armed) => {
            // 대기 상태: 절반 사이즈
            self.generate_entry_signal(ctx, 0.5)
        }
        _ => vec![]
    }
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MarketBreadth | 시장 전체 강세 확인 시에만 활성화 |
| GlobalScore | 55점 이상 종목만 대상 |
| StructuralFeatures | `vol_quality > 1` 매집 거래량 확인 |
| RouteState | 진입 사이즈 결정 |

---

#### 10. Stock Gugan (구간분할)

**Rust 구현** ([stock_gugan.rs](../crates/trader-strategy/src/strategies/stock_gugan.rs))
```rust
zones: Vec<PriceZone>
max_position_per_zone: Decimal
rebalance_threshold: 0.05
```

**실행 주기**: 일간

##### 리팩토링 설계

**현재 로직**:
```rust
// 가격 구간별 고정 매수
let zone = get_current_zone(price);
if position_in_zone < max_position {
    buy(zone.amount)
}
```

**신규 로직** (MarketRegime + StructuralFeatures 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    let price = candles.last_close();
    let zone = self.get_zone_for_price(price);

    // 1️⃣ MarketRegime에 따른 매수 속도 조절
    let speed_multiplier = match ctx.market_regime.get(&self.symbol) {
        Some(MarketRegime::BottomBounce) => 2.0,     // 바닥 반등: 2배 속도
        Some(MarketRegime::Sideways) => 1.0,         // 횡보: 정상 속도
        Some(MarketRegime::Downtrend) => 0.5,        // 하락: 절반 속도
        Some(MarketRegime::StrongUptrend) => 0.0,    // 상승: 매수 중단 (비쌈)
        _ => 1.0
    };

    if speed_multiplier == 0.0 {
        return vec![];
    }

    // 2️⃣ StructuralFeatures로 매집 구간 탐지
    let feat = ctx.structural_features.get(&self.symbol);
    let is_accumulation = feat.map(|f|
        f.vol_quality > 1.5 && f.range_pos < 0.3
    ).unwrap_or(false);

    // 3️⃣ 매집 구간에서 추가 매수
    let zone_amount = if is_accumulation {
        zone.amount * Decimal::try_from(speed_multiplier * 1.5).unwrap_or(zone.amount)
    } else {
        zone.amount * Decimal::try_from(speed_multiplier).unwrap_or(zone.amount)
    };

    // 4️⃣ 현재 포지션 확인
    let current_position = ctx.positions.get(&self.symbol)
        .map(|p| p.quantity)
        .unwrap_or(Decimal::ZERO);

    if current_position < zone.max_position {
        return vec![Signal::buy(self.symbol.clone(), zone_amount)];
    }

    vec![]
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MarketRegime | 레짐별 매수 속도 조절 |
| StructuralFeatures | 매집 구간 감지 시 추가 매수 |
| PositionInfo | 현재 포지션 대비 추가 매수 여부 결정 |

---

#### 11. Sector VB (섹터 변동성 돌파)

**Rust 구현** ([sector_vb.rs](../crates/trader-strategy/src/strategies/sector_vb.rs))
```rust
sector_etfs: Vec<String>
k_factor: 0.5
top_n_sectors: 3
momentum_filter: bool
```

**실행 주기**: 일 1회 - 장 시작 5분 후

##### 리팩토링 설계

**현재 로직**:
```rust
// 모멘텀 상위 N개 섹터 선택 후 변동성 돌파
let top_sectors = rank_by_momentum(sector_etfs, n);
for sector in top_sectors {
    if breakout_triggered(sector) { buy(sector) }
}
```

**신규 로직** (MarketBreadth + MacroEnvironment 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles_map: &HashMap<String, Vec<Candle>>) -> Vec<Signal> {
    // 1️⃣ 매크로 환경 체크
    if ctx.macro_environment.vix > 30.0 {
        return vec![]; // 고변동성: 비활성화
    }

    // 2️⃣ 섹터 로테이션 상태 확인
    let preferred_sectors = match ctx.market_breadth.sector_rotation {
        SectorRotation::EarlyExpansion => {
            // 경기 초기: 기술, 금융, 소비재
            vec!["XLK", "XLF", "XLY"]
        }
        SectorRotation::LateExpansion => {
            // 경기 후기: 에너지, 원자재
            vec!["XLE", "XLB"]
        }
        SectorRotation::Contraction => {
            // 수축기: 유틸리티, 헬스케어, 필수소비재
            vec!["XLU", "XLV", "XLP"]
        }
        _ => self.sector_etfs.clone()
    };

    // 3️⃣ GlobalScore로 섹터 순위 재정렬
    let ranked_sectors = self.rank_sectors_by_score(
        &preferred_sectors,
        &ctx.global_scores
    );

    // 4️⃣ 상위 N개 섹터에 변동성 돌파 적용
    let mut signals = vec![];
    for sector in ranked_sectors.iter().take(self.config.top_n_sectors) {
        if let Some(candles) = candles_map.get(sector) {
            if self.check_breakout(candles) {
                signals.push(Signal::buy(sector.clone(), self.position_size(ctx)));
            }
        }
    }

    signals
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MacroEnvironment | VIX 고점 시 비활성화 |
| MarketBreadth.sector_rotation | 경기 사이클별 선호 섹터 결정 |
| GlobalScore | 섹터 ETF 순위 재정렬 |

---

### 자산배분 전략

---

#### 12. HAA (Hierarchical Asset Allocation)

**Rust 구현** ([haa.rs](../crates/trader-strategy/src/strategies/haa.rs))
```rust
canary_assets: ["TIP"]
offensive_assets: ["SPY", "IWM", "VEA", "VWO", "TLT", "IEF", "PDBC", "VNQ"]
defensive_assets: ["IEF", "BIL"]
offensive_top_n: 4
defensive_top_n: 1
cash_symbol: "BIL"
invest_rate: 1.0
rebalance_threshold: 0.03
```

**실행 주기**: 월 1회 - 매월 첫 거래일

##### 리팩토링 설계

**현재 로직**:
```rust
// TIP 모멘텀만으로 공격/방어 결정
let tip_momentum = calculate_momentum("TIP", candles);
if tip_momentum > 0.0 {
    select_top_n(offensive_assets, 4)
} else {
    select_top_n(defensive_assets, 1)
}
```

**신규 로직** (MacroEnvironment + MarketBreadth 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 기존 TIP 모멘텀 체크 (Context에서 가져옴)
    let tip_momentum = ctx.macro_environment.tip_momentum;

    // 2️⃣ 추가 카나리아: VIX + 금리 환경
    let vix_warning = ctx.macro_environment.vix_percentile > 80.0;
    let yield_curve_inverted = ctx.macro_environment.yield_curve_slope < 0.0;

    // 3️⃣ 시장 폭으로 추가 확인
    let breadth_weak = ctx.market_breadth.above_ma50_pct < 40.0;

    // 4️⃣ 복합 카나리아 판단
    let defensive_signals = [
        tip_momentum <= 0.0,
        vix_warning,
        yield_curve_inverted && breadth_weak,
    ];
    let defensive_count = defensive_signals.iter().filter(|&&x| x).count();

    // 5️⃣ 단계적 대응
    let allocation = match defensive_count {
        0 => {
            // 모든 지표 양호: 풀 공격 모드
            AllocationMode::FullOffensive { top_n: 4 }
        }
        1 => {
            // 경고 1개: 부분 공격 모드
            AllocationMode::PartialOffensive { top_n: 2 }
        }
        _ => {
            // 경고 2개 이상: 방어 모드
            AllocationMode::Defensive { top_n: 1 }
        }
    };

    // 6️⃣ GlobalScore로 자산 내 순위 재조정
    let ranked_assets = self.rank_assets_by_score(
        &self.offensive_assets,
        &ctx.global_scores,
    );

    self.generate_rebalance_signals(allocation, ranked_assets, ctx)
}
```

**추가할 설정 필드**:
```rust
pub struct HaaConfig {
    // 기존 필드...

    // 신규: 복합 카나리아 옵션
    pub use_vix_canary: bool,           // VIX 백분위 카나리아
    pub use_yield_curve_canary: bool,   // 장단기 금리차 카나리아
    pub use_breadth_confirm: bool,      // 시장 폭 확인
    pub partial_offensive_threshold: usize, // 부분 공격 전환 경고 수
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MacroEnvironment.tip_momentum | 기존 카나리아 (TIP 모멘텀) |
| MacroEnvironment.vix_percentile | 추가 카나리아 (80% 이상 시 경고) |
| MacroEnvironment.yield_curve_slope | 추가 카나리아 (역전 시 경고) |
| MarketBreadth | 50일선 위 비율로 시장 건강도 확인 |
| GlobalScore | 공격 자산 내 순위 결정에 활용 |

---

#### 13. Simple Power (심플 파워)

**Rust 구현** ([simple_power.rs](../crates/trader-strategy/src/strategies/simple_power.rs))
```rust
aggressive_asset: "TQQQ"    // 50%
dividend_asset: "SCHD"      // 20%
rate_hedge_asset: "PFIX"    // 15%
bond_leverage_asset: "TMF"  // 15%
ma_period: 130
rebalance_interval_months: 1
rebalance_threshold: 0.03
```

**실행 주기**: 월 1회 - 매월 첫 거래일

##### 리팩토링 설계

**현재 로직**:
```rust
// MA130 기준 비중 조정
if price < ma130 { weight *= 0.5 }
if ma130_falling { weight *= 0.5 }
```

**신규 로직** (MacroEnvironment 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles_map: &HashMap<String, Vec<Candle>>) -> Vec<Signal> {
    let mut allocations = self.get_base_allocation();

    // 1️⃣ 기존 MA130 필터 적용
    allocations = self.apply_ma_filter(allocations, candles_map);

    // 2️⃣ 금리 환경에 따른 PFIX 비중 조정
    if ctx.macro_environment.fed_rate > 5.0 {
        // 고금리: PFIX 비중 확대
        allocations.adjust("PFIX", 1.5);
        allocations.adjust("TQQQ", 0.8);
    }

    // 3️⃣ VIX 환경에 따른 TMF 비중 조정
    if ctx.macro_environment.vix > 25.0 {
        // 고변동성: 채권 레버리지 축소
        allocations.adjust("TMF", 0.5);
        allocations.adjust("SCHD", 1.5);  // 배당주로 이동
    }

    // 4️⃣ 나스닥 레짐 확인
    match ctx.macro_environment.nasdaq_regime {
        MarketRegime::Downtrend => {
            // 하락장: TQQQ 대폭 축소
            allocations.adjust("TQQQ", 0.25);
        }
        MarketRegime::StrongUptrend => {
            // 강한 상승: TQQQ 유지/확대
            allocations.adjust("TQQQ", 1.1);
        }
        _ => {}
    }

    self.generate_rebalance_signals(allocations.normalize(), ctx)
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MacroEnvironment.fed_rate | 고금리 시 PFIX 비중 확대 |
| MacroEnvironment.vix | 고변동성 시 TMF 축소, SCHD 확대 |
| MacroEnvironment.nasdaq_regime | 나스닥 추세로 TQQQ 비중 결정 |

---

#### 14. XAA (Extended Asset Allocation)

**Rust 구현** ([xaa.rs](../crates/trader-strategy/src/strategies/xaa.rs))
```rust
assets: Vec<String>
top_n: 4
momentum_periods: [20, 60, 120, 240]
rebalance_threshold: 0.03
```

**실행 주기**: 월 1회 - 매월 첫 거래일

##### 리팩토링 설계

**현재 로직**:
```rust
// 단순 모멘텀 순위로 TOP N 선택
let ranked = rank_by_momentum(assets, periods);
select_top_n(ranked, 4)
```

**신규 로직** (GlobalScore + MacroEnvironment 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 기존 모멘텀 순위 계산
    let momentum_ranked = self.rank_by_momentum();

    // 2️⃣ GlobalScore로 순위 조정
    let adjusted_ranked: Vec<_> = momentum_ranked.iter()
        .map(|(asset, mom_rank)| {
            let score_bonus = ctx.global_scores.get(asset)
                .map(|s| (s.total_score - 50.0) / 100.0)
                .unwrap_or(0.0);
            (asset, mom_rank + score_bonus)
        })
        .sorted_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal))
        .collect();

    // 3️⃣ 매크로 환경에 따른 TOP N 조정
    let top_n = match ctx.macro_environment.vix_percentile {
        p if p > 80.0 => 2,  // 극단적 변동성: 집중
        p if p < 20.0 => 5,  // 낮은 변동성: 분산
        _ => self.config.top_n
    };

    // 4️⃣ 선택된 자산 배분
    let selected: Vec<_> = adjusted_ranked.iter().take(top_n).collect();
    self.generate_equal_weight_signals(selected, ctx)
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| GlobalScore | 모멘텀 순위에 품질 보정 추가 |
| MacroEnvironment.vix_percentile | 변동성 수준에 따른 집중/분산 결정 |

---

#### 15. BAA (Bold Asset Allocation)

**Rust 구현** ([baa.rs](../crates/trader-strategy/src/strategies/baa.rs))
```rust
canary_assets: Vec<String>
offensive_assets: Vec<String>
defensive_assets: Vec<String>
momentum_periods: [20, 60, 120, 240]
```

**실행 주기**: 월 1회 - 매월 첫 거래일

##### 리팩토링 설계

**현재 로직**:
```rust
// 카나리아 자산 모멘텀으로 공격/방어 결정
let canary_positive = canary_assets.iter()
    .all(|a| momentum(a) > 0.0);
if canary_positive { offensive() } else { defensive() }
```

**신규 로직** (MacroEnvironment + MarketBreadth 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 기존 카나리아 체크
    let canary_ok = self.check_canary_assets();

    // 2️⃣ 추가 매크로 카나리아
    let macro_warning = ctx.macro_environment.vix_percentile > 75.0
        || ctx.macro_environment.yield_curve_slope < -0.5;

    // 3️⃣ 시장 폭 카나리아
    let breadth_warning = ctx.market_breadth.above_ma200_pct < 30.0;

    // 4️⃣ 복합 신호로 모드 결정
    let mode = if canary_ok && !macro_warning && !breadth_warning {
        AllocationMode::FullOffensive
    } else if canary_ok && (macro_warning || breadth_warning) {
        AllocationMode::PartialOffensive  // 경고 1개: 절반 공격
    } else {
        AllocationMode::Defensive
    };

    // 5️⃣ 모드별 자산 선택
    match mode {
        AllocationMode::FullOffensive => {
            let top = self.select_top_offensive(4, &ctx.global_scores);
            self.generate_signals_for(top, ctx)
        }
        AllocationMode::PartialOffensive => {
            let top = self.select_top_offensive(2, &ctx.global_scores);
            let safe = self.select_top_defensive(1, &ctx.global_scores);
            self.generate_mixed_signals(top, safe, ctx)
        }
        AllocationMode::Defensive => {
            let top = self.select_top_defensive(2, &ctx.global_scores);
            self.generate_signals_for(top, ctx)
        }
    }
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MacroEnvironment.vix_percentile | 추가 카나리아 (75% 이상 경고) |
| MacroEnvironment.yield_curve_slope | 추가 카나리아 (역전 경고) |
| MarketBreadth.above_ma200_pct | 장기 시장 건강도 확인 |
| GlobalScore | 공격/방어 자산 내 순위 결정 |

---

#### 16. All Weather (올웨더)

**Rust 구현** ([all_weather.rs](../crates/trader-strategy/src/strategies/all_weather.rs))
```rust
market: AllWeatherMarket::US | KR
use_seasonality: true
ma_periods: [50, 80, 120, 150]
rebalance_days: 30

// US 자산
SPY: 20%, TLT: 27%, IEF: 15%, GLD: 8%, PDBC: 8%, IYK: 22%

// 지옥기간 (5-10월)
hell_period_multiplier: 0.25 (STOCK), 1.75 (BOND)
```

**실행 주기**: 월 1회 - 매월 첫 거래일

##### 리팩토링 설계

**현재 로직**:
```rust
// 월 기반 계절성 + MA 필터
let is_hell_period = (5..=10).contains(&current_month);
let stock_multiplier = if is_hell_period { 0.25 } else { 1.75 };
```

**신규 로직** (경기 사이클 + 섹터 로테이션 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 기존 계절성 체크
    let base_allocation = self.get_seasonal_allocation();

    // 2️⃣ 매크로 환경으로 자산 클래스별 조정
    let adjusted = self.adjust_by_macro(base_allocation, &ctx.macro_environment);

    // 3️⃣ 섹터 로테이션 상태로 주식 비중 미세 조정
    let sector_adjusted = match ctx.market_breadth.sector_rotation {
        SectorRotation::EarlyExpansion => {
            // 경기 초기 확장: 주식 비중 확대
            adjusted.increase_stocks(0.1)
        }
        SectorRotation::LateContraction => {
            // 경기 후기 수축: 채권/금 비중 확대
            adjusted.increase_defensive(0.15)
        }
        _ => adjusted
    };

    // 4️⃣ 금리 환경 반영
    let final_allocation = if ctx.macro_environment.fed_rate > 5.0 {
        // 고금리: 단기 채권(BIL) 비중 확대
        sector_adjusted.shift_to_short_term_bonds(0.1)
    } else if ctx.macro_environment.yield_curve_slope > 1.5 {
        // 가파른 수익률 곡선: 장기 채권(TLT) 비중 확대
        sector_adjusted.shift_to_long_term_bonds(0.1)
    } else {
        sector_adjusted
    };

    // 5️⃣ USD/KRW 환율 (KR 마켓용)
    let final_allocation = if self.market == AllWeatherMarket::KR {
        match ctx.macro_environment.usd_krw_trend {
            Trend::StrongUp => final_allocation.reduce_us_exposure(0.1),
            Trend::StrongDown => final_allocation.increase_us_exposure(0.1),
            _ => final_allocation
        }
    } else {
        final_allocation
    };

    self.generate_rebalance_signals(final_allocation, ctx)
}

fn adjust_by_macro(&self, allocation: Allocation, macro_env: &MacroEnvironment) -> Allocation {
    let mut result = allocation.clone();

    // VIX 기반 조정
    if macro_env.vix > 25.0 {
        // 높은 변동성: 금(GLD) 비중 확대
        result.adjust("GLD", 1.3);
        result.adjust("SPY", 0.8);
    }

    // 인플레이션 모멘텀 기반 조정
    if macro_env.tip_momentum > 0.05 {
        // 인플레이션 상승: PDBC(원자재) 비중 확대
        result.adjust("PDBC", 1.4);
    }

    result.normalize()
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MarketBreadth.sector_rotation | 경기 사이클에 따른 자산 클래스 조정 |
| MacroEnvironment.vix | 변동성 높으면 금 비중 확대 |
| MacroEnvironment.fed_rate | 고금리 시 단기 채권 비중 확대 |
| MacroEnvironment.yield_curve_slope | 장단기 금리차로 채권 듀레이션 결정 |
| MacroEnvironment.tip_momentum | 인플레이션 추세로 원자재 비중 조정 |
| MacroEnvironment.usd_krw_trend | (KR) 환율 추세로 미국 자산 비중 조정 |

---

#### 17. Snow (스노우)

**Rust 구현** ([snow.rs](../crates/trader-strategy/src/strategies/snow.rs))
```rust
market: SnowMarket::US | KR
tip_ma_period: 200  // TIP 10개월 이동평균
attack_ma_period: 5 // 공격자산 5일 이동평균
rebalance_days: 1

// US 자산
tip: "TIP"
attack: "UPRO"  // 3x S&P 500
safe: "TLT"     // 20년 국채
crisis: "BIL"   // 단기 국채

// KR 자산
attack: "122630"  // KODEX 레버리지
safe: "148070"    // KOSEF 국고채10년
crisis: "272580"  // 미국채혼합레버리지
```

**실행 주기**: 일 1회 - 장 마감 후

##### 리팩토링 설계

**현재 로직**:
```rust
// TIP MA200 기준 공격/방어 결정
if tip_price > tip_ma200 { attack() } else { safe() }
```

**신규 로직** (MacroEnvironment + MarketRegime 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 기존 TIP 모멘텀 (Context에서 가져옴)
    let tip_bullish = ctx.macro_environment.tip_momentum > 0.0;

    // 2️⃣ MarketRegime으로 추가 확인
    let market_ok = !matches!(
        ctx.market_regime.get(&"SPY".to_string()),
        Some(MarketRegime::Downtrend)
    );

    // 3️⃣ 위기 모드 판단
    let crisis_mode = ctx.macro_environment.vix > 35.0
        || ctx.macro_environment.vix_percentile > 90.0;

    // 4️⃣ 모드 결정
    if crisis_mode {
        // 위기: BIL (현금성)
        self.allocate_to(&self.crisis_asset, ctx)
    } else if tip_bullish && market_ok {
        // 공격: UPRO/KODEX 레버리지
        self.allocate_to(&self.attack_asset, ctx)
    } else {
        // 방어: TLT/국고채
        self.allocate_to(&self.safe_asset, ctx)
    }
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MacroEnvironment.tip_momentum | 공격/방어 모드 결정 |
| MarketRegime | 하락장 시 방어 모드 강제 |
| MacroEnvironment.vix | 극단적 변동성 시 위기 모드 |

---

#### 18. Stock Rotation (종목 갈아타기)

**Rust 구현** ([stock_rotation.rs](../crates/trader-strategy/src/strategies/stock_rotation.rs))
```rust
universe: Vec<String>
top_n: 5
momentum_periods: [20, 60]
rotation_interval: RotationInterval::Weekly
rebalance_threshold: 0.05
```

**실행 주기**: 일/주

##### 리팩토링 설계

**현재 로직**:
```rust
// 모멘텀 순위로 TOP N 교체
let ranked = rank_by_momentum(universe);
rotate_to_top_n(ranked, 5)
```

**신규 로직** (GlobalScore + MarketRegime 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 기존 모멘텀 순위
    let momentum_ranked = self.rank_by_momentum();

    // 2️⃣ GlobalScore로 필터링 및 조정
    let filtered: Vec<_> = momentum_ranked.iter()
        .filter(|symbol| {
            ctx.global_scores.get(*symbol)
                .map(|s| s.total_score >= 50.0)
                .unwrap_or(false)
        })
        .map(|symbol| {
            let score_adj = ctx.global_scores.get(symbol)
                .map(|s| s.momentum * 0.3)
                .unwrap_or(0.0);
            let adjusted_rank = self.momentum_rank(symbol) + score_adj;
            (symbol, adjusted_rank)
        })
        .sorted_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal))
        .collect();

    // 3️⃣ MarketRegime에 따른 TOP N 조정
    let top_n = match ctx.market_regime.get(&self.index_symbol()) {
        Some(MarketRegime::StrongUptrend) => self.config.top_n + 2, // 분산 확대
        Some(MarketRegime::Downtrend) => 2,                         // 집중
        _ => self.config.top_n
    };

    // 4️⃣ 교체 신호 생성
    let new_holdings = filtered.iter().take(top_n).collect();
    self.generate_rotation_signals(new_holdings, ctx)
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| GlobalScore | 50점 이상 종목만 대상, 모멘텀 팩터 가중 |
| MarketRegime | 레짐별 보유 종목 수 조정 |

---

#### 19. Market Cap TOP (시총 상위)

**Rust 구현** ([market_cap_top.rs](../crates/trader-strategy/src/strategies/market_cap_top.rs))
```rust
market: MarketCapMarket::US
top_n: 10
rebalance_day: RebalanceDay::MonthEnd
equal_weight: true
```

**실행 주기**: 월말

##### 리팩토링 설계

**현재 로직**:
```rust
// 시총 순위 TOP 10 균등 배분
let top_10 = get_market_cap_ranking(10);
equal_weight_allocation(top_10)
```

**신규 로직** (GlobalScore 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 시총 순위 가져오기
    let market_cap_ranked = self.get_market_cap_ranking();

    // 2️⃣ GlobalScore로 가중치 조정
    let weighted: Vec<_> = market_cap_ranked.iter()
        .take(self.config.top_n)
        .map(|symbol| {
            let base_weight = 1.0 / self.config.top_n as f64;
            let score_adj = ctx.global_scores.get(symbol)
                .map(|s| 1.0 + (s.total_score - 50.0) / 200.0)
                .unwrap_or(1.0);
            (symbol, base_weight * score_adj)
        })
        .collect();

    // 3️⃣ 정규화 후 신호 생성
    let normalized = self.normalize_weights(weighted);
    self.generate_rebalance_signals(normalized, ctx)
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| GlobalScore | 균등 배분 대신 품질 기반 가중 배분 |

---

#### 20. Sector Momentum (섹터 모멘텀)

**Rust 구현** ([sector_momentum.rs](../crates/trader-strategy/src/strategies/sector_momentum.rs))
```rust
market: SectorMarket::US | KR
sector_etfs: Vec<String>
top_n: 3
momentum_period: 60
rebalance_interval: 30
```

**실행 주기**: 월 1회

##### 리팩토링 설계

**현재 로직**:
```rust
// 섹터 모멘텀 순위 TOP 3
let ranked = rank_sectors_by_momentum(sector_etfs);
select_top_n(ranked, 3)
```

**신규 로직** (MarketBreadth + MacroEnvironment 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 경기 사이클에 따른 선호 섹터
    let cycle_preferred = match ctx.market_breadth.sector_rotation {
        SectorRotation::EarlyExpansion => vec!["XLK", "XLF", "XLY"],
        SectorRotation::LateExpansion => vec!["XLE", "XLB", "XLI"],
        SectorRotation::EarlyContraction => vec!["XLV", "XLP", "XLU"],
        SectorRotation::LateContraction => vec!["XLU", "XLRE"],
        _ => self.sector_etfs.clone()
    };

    // 2️⃣ 모멘텀 순위 계산 (선호 섹터 가산점)
    let ranked: Vec<_> = self.sector_etfs.iter()
        .map(|sector| {
            let mom = self.calculate_momentum(sector);
            let bonus = if cycle_preferred.contains(sector) { 0.1 } else { 0.0 };
            (sector, mom + bonus)
        })
        .sorted_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal))
        .collect();

    // 3️⃣ 매크로 환경에 따른 TOP N 조정
    let top_n = if ctx.macro_environment.vix > 25.0 {
        2  // 변동성 높으면 집중
    } else {
        self.config.top_n
    };

    self.generate_allocation_signals(ranked.iter().take(top_n), ctx)
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MarketBreadth.sector_rotation | 경기 사이클별 선호 섹터 가산점 |
| MacroEnvironment.vix | 변동성에 따른 집중도 조정 |

---

#### 21. Dual Momentum (듀얼 모멘텀)

**Rust 구현** ([dual_momentum.rs](../crates/trader-strategy/src/strategies/dual_momentum.rs))
```rust
kr_stock_symbols: Vec<String>
us_bond_symbol: "TLT"
momentum_period: 60
rebalance_threshold: 0.03
```

**실행 주기**: 월 1회

##### 리팩토링 설계

**현재 로직**:
```rust
// 한국 주식 vs 미국 채권 모멘텀 비교
if kr_stock_momentum > us_bond_momentum && kr_stock_momentum > 0 {
    kr_stocks()
} else {
    us_bonds()
}
```

**신규 로직** (MacroEnvironment 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    let kr_mom = self.calculate_kr_momentum();
    let us_mom = self.calculate_us_momentum();

    // 1️⃣ 환율 환경 고려
    let fx_adjustment = match ctx.macro_environment.usd_krw_trend {
        Trend::StrongUp => -0.02,   // 달러 강세: 한국 불리
        Trend::StrongDown => 0.02,  // 달러 약세: 한국 유리
        _ => 0.0
    };

    let adjusted_kr_mom = kr_mom + fx_adjustment;

    // 2️⃣ 금리 환경 고려
    let rate_adjustment = if ctx.macro_environment.fed_rate > 5.0 {
        0.01  // 고금리: 채권 불리
    } else {
        0.0
    };

    let adjusted_us_mom = us_mom - rate_adjustment;

    // 3️⃣ 모멘텀 비교
    if adjusted_kr_mom > adjusted_us_mom && adjusted_kr_mom > 0.0 {
        self.allocate_to_kr_stocks(ctx)
    } else {
        self.allocate_to_us_bonds(ctx)
    }
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MacroEnvironment.usd_krw_trend | 환율 추세로 한국 자산 모멘텀 조정 |
| MacroEnvironment.fed_rate | 금리로 미국 채권 모멘텀 조정 |

---

#### 22. Small Cap Quant (소형주 퀀트)

**Rust 구현** ([small_cap_quant.rs](../crates/trader-strategy/src/strategies/small_cap_quant.rs))
```rust
market_cap_max: 300_000_000_000  // 3000억 이하
ma_period: 20
top_n: 10
filters: SmallCapFilters
```

**실행 주기**: 일간

##### 리팩토링 설계

**현재 로직**:
```rust
// 시총 필터 + MA20 위 종목 선별
let filtered = filter_by_market_cap(universe, max);
let above_ma = filter_above_ma(filtered, 20);
select_top_n(above_ma, 10)
```

**신규 로직** (GlobalScore + StructuralFeatures 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 기본 필터 (시총, MA20)
    let base_filtered = self.apply_base_filters();

    // 2️⃣ GlobalScore 필터
    let quality_filtered: Vec<_> = base_filtered.iter()
        .filter(|symbol| {
            ctx.global_scores.get(*symbol)
                .map(|s| s.total_score >= 55.0 && s.liquidity >= 40.0)
                .unwrap_or(false)
        })
        .collect();

    // 3️⃣ StructuralFeatures로 매집 종목 우선
    let ranked: Vec<_> = quality_filtered.iter()
        .map(|symbol| {
            let feat = ctx.structural_features.get(*symbol);
            let accumulation_score = feat
                .map(|f| f.vol_quality.max(0.0) + f.low_trend.max(0.0))
                .unwrap_or(0.0);
            let total_score = ctx.global_scores.get(*symbol)
                .map(|s| s.total_score)
                .unwrap_or(0.0);
            (symbol, total_score + accumulation_score * 10.0)
        })
        .sorted_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal))
        .collect();

    // 4️⃣ TOP N 선택
    self.generate_allocation_signals(ranked.iter().take(self.config.top_n), ctx)
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| GlobalScore | 55점 이상 + 유동성 40점 이상 필터 |
| StructuralFeatures | `vol_quality`, `low_trend`로 매집 종목 우선 |

---

#### 23. Pension Bot (연금봇)

**Rust 구현** ([pension_bot.rs](../crates/trader-strategy/src/strategies/pension_bot.rs))
```rust
pension_type: PensionType::Personal | IRP
static_allocation: HashMap<String, f64>
dynamic_momentum_assets: Vec<String>
rebalance_threshold: 0.05
```

**실행 주기**: 월 1회

##### 리팩토링 설계

**현재 로직**:
```rust
// 정적 배분 + 동적 모멘텀 배분
let static_part = apply_static_allocation();
let dynamic_part = select_by_momentum(dynamic_assets);
combine(static_part, dynamic_part)
```

**신규 로직** (MacroEnvironment 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 정적 배분 적용
    let mut allocation = self.apply_static_allocation();

    // 2️⃣ 연금 유형별 리스크 조정
    let risk_multiplier = match self.pension_type {
        PensionType::Personal => 1.0,     // 개인연금: 기본
        PensionType::IRP => 0.8,          // IRP: 보수적
    };

    // 3️⃣ 매크로 환경에 따른 동적 부분 조정
    let dynamic_weight = if ctx.macro_environment.vix > 25.0 {
        0.2 * risk_multiplier  // 변동성 높으면 동적 비중 축소
    } else {
        0.4 * risk_multiplier
    };

    // 4️⃣ 동적 모멘텀 자산 선택
    let dynamic_assets = self.select_momentum_assets(&ctx.global_scores);

    // 5️⃣ 배분 결합
    allocation = allocation.scale(1.0 - dynamic_weight);
    allocation.merge(dynamic_assets, dynamic_weight);

    self.generate_rebalance_signals(allocation, ctx)
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MacroEnvironment.vix | 변동성에 따른 동적 비중 조정 |
| GlobalScore | 동적 모멘텀 자산 선택 |

---

#### 24. US 3X Leverage (미국 3배 레버리지)

**Rust 구현** ([us_3x_leverage.rs](../crates/trader-strategy/src/strategies/us_3x_leverage.rs))
```rust
bull_etf: "TQQQ"
bear_etf: "SQQQ"
signal_indicator: SignalIndicator::MA | RSI | MACD
ma_period: 20
position_sizing: PositionSizingMethod::Fixed | Kelly
```

**실행 주기**: 일간

##### 리팩토링 설계

**현재 로직**:
```rust
// 지표 기반 롱/숏 결정
match calculate_signal() {
    Signal::Long => buy(TQQQ),
    Signal::Short => buy(SQQQ),
    Signal::Neutral => hold_cash()
}
```

**신규 로직** (RouteState + MarketRegime 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    // 1️⃣ 기존 지표 신호
    let indicator_signal = self.calculate_indicator_signal(candles);

    // 2️⃣ MarketRegime으로 레버리지 방향 확인
    let regime = ctx.market_regime.get(&"QQQ".to_string());
    let regime_direction = match regime {
        Some(MarketRegime::StrongUptrend) => Direction::Long,
        Some(MarketRegime::Downtrend) => Direction::Short,
        _ => Direction::Neutral
    };

    // 3️⃣ RouteState로 진입 타이밍 확인
    let route = ctx.route_states.get(&"QQQ".to_string());
    let timing_ok = matches!(route, Some(RouteState::Attack | RouteState::Armed));

    // 4️⃣ 신호 결합
    let final_direction = if indicator_signal == regime_direction && timing_ok {
        indicator_signal
    } else if ctx.macro_environment.vix > 35.0 {
        Direction::Neutral  // 극단적 변동성: 현금
    } else {
        indicator_signal
    };

    // 5️⃣ 포지션 사이징 (VIX 기반 조정)
    let size = self.calculate_position_size(ctx);
    let vix_adjusted = size * (1.0 - (ctx.macro_environment.vix - 15.0) / 50.0).max(0.3);

    match final_direction {
        Direction::Long => vec![Signal::buy(self.bull_etf.clone(), vix_adjusted)],
        Direction::Short => vec![Signal::buy(self.bear_etf.clone(), vix_adjusted)],
        Direction::Neutral => self.exit_all_positions(ctx)
    }
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MarketRegime | 레버리지 방향 확인 |
| RouteState | 진입 타이밍 최적화 |
| MacroEnvironment.vix | 극단적 변동성 시 현금, 사이즈 조정 |

---

### 한국 지수 전략

---

#### 25. KOSPI BothSide (코스피 양방향)

**Rust 구현** ([kospi_bothside.rs](../crates/trader-strategy/src/strategies/kospi_bothside.rs))
```rust
bull_etf: "122630"  // KODEX 레버리지
bear_etf: "252670"  // KODEX 200선물인버스2X
signal_method: SignalMethod::MACrossover | VB
ma_short: 5
ma_long: 20
```

**실행 주기**: 일간

##### 리팩토링 설계

**현재 로직**:
```rust
// MA 교차 또는 변동성 돌파로 방향 결정
match signal_method {
    MACrossover => if short_ma > long_ma { bull() } else { bear() },
    VB => if breakout() { bull() } else { bear() }
}
```

**신규 로직** (MarketRegime + MacroEnvironment 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles: &[Candle]) -> Vec<Signal> {
    // 1️⃣ 기존 신호 계산
    let base_signal = self.calculate_base_signal(candles);

    // 2️⃣ MarketRegime으로 신호 검증
    let regime = ctx.market_regime.get(&"KOSPI".to_string());
    let validated_signal = match (base_signal, regime) {
        (Direction::Long, Some(MarketRegime::Downtrend)) => Direction::Neutral,
        (Direction::Short, Some(MarketRegime::StrongUptrend)) => Direction::Neutral,
        _ => base_signal
    };

    // 3️⃣ 나스닥 동조 확인
    let nasdaq_aligned = match ctx.macro_environment.nasdaq_regime {
        MarketRegime::StrongUptrend if validated_signal == Direction::Long => true,
        MarketRegime::Downtrend if validated_signal == Direction::Short => true,
        _ => false
    };

    // 4️⃣ 환율 환경 고려
    let fx_favorable = match ctx.macro_environment.usd_krw_trend {
        Trend::StrongDown => true,  // 원화 강세: 한국 유리
        _ => false
    };

    // 5️⃣ 사이즈 결정
    let size_multiplier = match (nasdaq_aligned, fx_favorable) {
        (true, true) => 1.0,    // 최적 조건
        (true, false) => 0.7,
        (false, true) => 0.7,
        (false, false) => 0.5,
    };

    match validated_signal {
        Direction::Long => vec![Signal::buy(self.bull_etf.clone(), self.base_size * size_multiplier)],
        Direction::Short => vec![Signal::buy(self.bear_etf.clone(), self.base_size * size_multiplier)],
        Direction::Neutral => self.exit_all(ctx)
    }
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MarketRegime | 레짐 반대 신호 필터링 |
| MacroEnvironment.nasdaq_regime | 나스닥 동조 확인 |
| MacroEnvironment.usd_krw_trend | 환율 환경에 따른 사이즈 조정 |

---

#### 26. KOSDAQ Fire Rain (코스닥 피레인)

**Rust 구현** ([kosdaq_fire_rain.rs](../crates/trader-strategy/src/strategies/kosdaq_fire_rain.rs))
```rust
kospi_etfs: (bull, bear)
kosdaq_etfs: (bull, bear)
allocation_ratio: (kospi, kosdaq)
signal_method: SignalMethod
```

**실행 주기**: 일간

##### 리팩토링 설계

**현재 로직**:
```rust
// 코스피/코스닥 개별 신호 + 비율 배분
let kospi_signal = calculate_signal("KOSPI");
let kosdaq_signal = calculate_signal("KOSDAQ");
allocate(kospi_signal, 0.6);
allocate(kosdaq_signal, 0.4);
```

**신규 로직** (MarketRegime + MarketBreadth 연동):
```rust
fn generate_signals(&self, ctx: &StrategyContext, candles_map: &HashMap<String, Vec<Candle>>) -> Vec<Signal> {
    // 1️⃣ 각 지수별 신호 계산
    let kospi_signal = self.calculate_signal("KOSPI", candles_map);
    let kosdaq_signal = self.calculate_signal("KOSDAQ", candles_map);

    // 2️⃣ MarketBreadth로 시장 폭 확인
    let market_strength = ctx.market_breadth.above_ma20_pct;

    // 3️⃣ 시장 폭에 따른 비율 동적 조정
    let (kospi_ratio, kosdaq_ratio) = if market_strength > 60.0 {
        // 강세장: 코스닥 비중 확대 (더 높은 베타)
        (0.4, 0.6)
    } else if market_strength < 40.0 {
        // 약세장: 코스피 비중 확대 (더 안정적)
        (0.7, 0.3)
    } else {
        self.config.allocation_ratio
    };

    // 4️⃣ MarketRegime으로 양방향 허용 여부
    let regime = ctx.market_regime.get(&"KOSPI".to_string());
    let allow_short = !matches!(regime, Some(MarketRegime::StrongUptrend));
    let allow_long = !matches!(regime, Some(MarketRegime::Downtrend));

    // 5️⃣ 신호 결합
    let mut signals = vec![];

    // 코스피 신호
    match kospi_signal {
        Direction::Long if allow_long => {
            signals.push(Signal::buy(self.kospi_bull.clone(), self.base_size * kospi_ratio));
        }
        Direction::Short if allow_short => {
            signals.push(Signal::buy(self.kospi_bear.clone(), self.base_size * kospi_ratio));
        }
        _ => {}
    }

    // 코스닥 신호
    match kosdaq_signal {
        Direction::Long if allow_long => {
            signals.push(Signal::buy(self.kosdaq_bull.clone(), self.base_size * kosdaq_ratio));
        }
        Direction::Short if allow_short => {
            signals.push(Signal::buy(self.kosdaq_bear.clone(), self.base_size * kosdaq_ratio));
        }
        _ => {}
    }

    signals
}
```

**데이터 활용**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MarketBreadth.above_ma20_pct | 시장 폭에 따른 코스피/코스닥 비율 조정 |
| MarketRegime | 레짐에 따른 롱/숏 허용 여부 |

---

## 백테스트 요구사항

### 단일 자산 전략
- OHLCV 데이터 (분봉/일봉)
- 거래량 데이터
- 기간: **최소 1년**

### 자산배분 전략
- 다중 심볼 OHLCV 데이터
- 동일 시간대 정렬 필요
- 기간: **최소 2년** (모멘텀 계산용 12개월 + 백테스트 1년)

### 필수 지표 계산

| 지표 | 기간 |
|------|------|
| 이동평균 (MA) | 5, 10, 20, 50, 80, 100, 120, 130, 150, 200, 240일 |
| RSI | 14일 |
| ATR | 14일 |
| 볼린저 밴드 | 20일, 2σ |
| 모멘텀 스코어 | 1M, 3M, 6M, 9M, 12M 수익률 |

---

## 미구현 전략 (신규 구현 가이드)

### 1. SPAC No-Loss (무손실 스팩)

스팩주의 하방 제한 특성(공모가 + 이자)을 활용한 무손실 전략

**구현 파라미터**:
```rust
pub struct SpacNoLossConfig {
    // 스팩 필터
    pub min_days_to_merger: i32,        // 합병까지 최소 일수 (예: 180일)
    pub max_premium_pct: f64,           // 공모가 대비 최대 프리미엄 (예: 5%)
    pub min_trust_value: Decimal,       // 최소 신탁가치

    // 진입/청산
    pub entry_discount_pct: f64,        // 공모가 대비 할인율 진입 (예: -2%)
    pub exit_premium_pct: f64,          // 목표 프리미엄 (예: 10%)
    pub exit_days_before_merger: i32,   // 합병 전 청산 일수 (예: 30일)

    // 포지션
    pub max_position_per_spac: Decimal, // 개별 스팩 최대 포지션
    pub max_total_spacs: usize,         // 최대 보유 스팩 수
}
```

**구현 방법**:
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 스팩 유니버스 스캔 (외부 데이터 필요)
    let spacs = self.scan_spac_universe();

    // 2️⃣ 필터링: 합병 일정, 프리미엄, 신탁가치
    let filtered = spacs.iter()
        .filter(|s| s.days_to_merger >= self.config.min_days_to_merger)
        .filter(|s| s.premium_pct <= self.config.max_premium_pct)
        .filter(|s| s.trust_value >= self.config.min_trust_value);

    // 3️⃣ 할인된 스팩 매수
    for spac in filtered {
        if spac.current_price < spac.ipo_price * (1.0 + self.config.entry_discount_pct) {
            signals.push(Signal::buy(spac.symbol, position_size));
        }
    }

    // 4️⃣ 보유 스팩 청산 조건
    for (symbol, pos) in ctx.positions.iter() {
        let spac = self.get_spac_info(symbol);
        if spac.premium_pct >= self.config.exit_premium_pct
            || spac.days_to_merger <= self.config.exit_days_before_merger {
            signals.push(Signal::sell(symbol.clone(), pos.quantity));
        }
    }

    signals
}
```

**필요 데이터 소스**:
- 스팩 상장 정보 (공모가, 합병 예정일, 신탁가치)
- 실시간 가격 데이터

**StrategyContext 연동**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| MacroEnvironment.fed_rate | 무위험 수익률 대비 스팩 수익률 비교 |
| PositionInfo | 보유 스팩 관리 |

---

### 2. All at Once ETF (올앳원스 ETF)

다양한 자산군 ETF를 한 번에 매수하는 단순 자산배분 전략

**구현 파라미터**:
```rust
pub struct AllAtOnceConfig {
    // ETF 유니버스
    pub etf_allocations: HashMap<String, f64>,  // ETF별 목표 비중
    // 예: { "VTI": 0.3, "VXUS": 0.2, "BND": 0.2, "VNQ": 0.1, "GLD": 0.1, "TIP": 0.1 }

    // 리밸런싱
    pub rebalance_interval_days: i32,   // 리밸런싱 주기 (예: 90일)
    pub rebalance_threshold: f64,       // 리밸런싱 임계값 (예: 0.05 = 5%)

    // 매수 방식
    pub initial_buy_mode: BuyMode,      // Lump Sum | DCA
    pub dca_periods: Option<i32>,       // DCA 시 분할 횟수
}

pub enum BuyMode {
    LumpSum,        // 일시 매수
    DCA { periods: i32, interval_days: i32 }, // 분할 매수
}
```

**구현 방법**:
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    let mut signals = vec![];

    // 1️⃣ 현재 포지션 비중 계산
    let current_weights = self.calculate_current_weights(ctx);

    // 2️⃣ 목표 비중과 차이 계산
    for (etf, target_weight) in &self.config.etf_allocations {
        let current_weight = current_weights.get(etf).unwrap_or(&0.0);
        let diff = target_weight - current_weight;

        // 3️⃣ 임계값 초과 시 리밸런싱
        if diff.abs() > self.config.rebalance_threshold {
            let diff_decimal = Decimal::try_from(diff.abs()).unwrap_or(Decimal::ZERO);
            let amount = ctx.account.total_balance * diff_decimal;

            if diff > 0.0 {
                signals.push(Signal::buy(etf.clone(), amount));
            } else {
                let qty = self.calculate_sell_quantity(etf, amount, ctx);
                signals.push(Signal::sell(etf.clone(), qty));
            }
        }
    }

    signals
}
```

**StrategyContext 연동**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| AccountInfo | 총 자산 기준 비중 계산 |
| PositionInfo | 현재 ETF별 보유 수량 |

---

### 3. Rotation Savings (순환적립식)

순환적으로 자산군을 적립하는 자산배분 전략 (매달 다른 자산 매수)

**구현 파라미터**:
```rust
pub struct RotationSavingsConfig {
    // 자산 순환 목록
    pub asset_rotation: Vec<String>,    // 순환 자산 목록
    // 예: ["VTI", "VXUS", "BND", "VNQ"] → 4개월 주기

    // 적립 설정
    pub monthly_amount: Decimal,        // 월 적립금
    pub execution_day: i32,             // 매월 실행일 (예: 15일)

    // 모멘텀 필터 (선택)
    pub use_momentum_filter: bool,      // 모멘텀 음수 자산 스킵
    pub skip_to_next: bool,             // 스킵 시 다음 자산으로 이동
    pub fallback_asset: Option<String>, // 스킵 시 대체 자산 (예: "BIL")
}
```

**구현 방법**:
```rust
fn generate_signals(&self, ctx: &StrategyContext) -> Vec<Signal> {
    // 1️⃣ 현재 월 기준 순환 자산 결정
    let current_month = chrono::Utc::now().month() as usize;
    let rotation_index = (current_month - 1) % self.config.asset_rotation.len();
    let target_asset = &self.config.asset_rotation[rotation_index];

    // 2️⃣ 모멘텀 필터 적용 (선택)
    let final_asset = if self.config.use_momentum_filter {
        let score = ctx.global_scores.get(target_asset);
        if score.map(|s| s.momentum < 0.0).unwrap_or(false) {
            // 모멘텀 음수: 스킵 또는 대체
            if self.config.skip_to_next {
                let next_index = (rotation_index + 1) % self.config.asset_rotation.len();
                &self.config.asset_rotation[next_index]
            } else {
                self.config.fallback_asset.as_ref().unwrap_or(target_asset)
            }
        } else {
            target_asset
        }
    } else {
        target_asset
    };

    // 3️⃣ 적립 신호 생성
    vec![Signal::buy(final_asset.clone(), self.config.monthly_amount)]
}
```

**StrategyContext 연동**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| GlobalScore.momentum | 모멘텀 필터로 음수 자산 스킵 |

---

### 4. Trailing Stop (트레일링 스톱)

**(공통 모듈로 이동 권장)**

모든 전략에서 사용 가능한 트레일링 스톱 로직

**구현 파라미터**:
```rust
pub struct TrailingStopConfig {
    // 기본 설정
    pub initial_stop_pct: f64,          // 초기 손절선 (예: 5%)
    pub max_stop_pct: f64,              // 최대 손절선 (예: 10%)

    // 조정 로직
    pub profit_adjustment_threshold: f64, // 수익 조정 임계값 (예: 2%)
    pub adjustment_step: f64,            // 조정 단계 (예: 1%)

    // ATR 기반 (선택)
    pub use_atr: bool,
    pub atr_period: usize,
    pub atr_multiplier: f64,
}
```

**구현 방법**:
```rust
pub fn check_trailing_stop(
    &self,
    ctx: &StrategyContext,
    symbol: &str,
    candles: &[Candle],
) -> Option<Signal> {
    let pos = ctx.positions.get(symbol)?;
    let current_price = candles.last()?.close;

    // 1️⃣ 현재 손절선 계산
    let stop_pct = if self.config.use_atr {
        let atr = self.calculate_atr(candles, self.config.atr_period);
        (atr / current_price * self.config.atr_multiplier).min(self.config.max_stop_pct)
    } else {
        // 수익률에 따른 동적 조정
        let profit_pct = pos.unrealized_pnl_pct;
        let adjustments = (profit_pct / self.config.profit_adjustment_threshold).floor() as i32;
        (self.config.initial_stop_pct + adjustments as f64 * self.config.adjustment_step)
            .min(self.config.max_stop_pct)
    };

    // 2️⃣ 고점 대비 하락률 확인
    let high_since_entry = self.get_high_since_entry(symbol, pos.entry_time);
    let drawdown = (high_since_entry - current_price) / high_since_entry * 100.0;

    // 3️⃣ 손절 트리거
    if drawdown >= stop_pct {
        Some(Signal::sell(symbol.to_string(), pos.quantity))
    } else {
        None
    }
}
```

**StrategyContext 연동**:
| 데이터 소스 | 활용 방식 |
|------------|----------|
| PositionInfo | 진입가, 수익률, 진입 시점 |
| MacroEnvironment.vix | 변동성 높으면 손절선 확대 |

---

## 마이그레이션 로드맵

### Phase 1: 인프라 구축 (선행 조건)

| 작업 | 설명 | 상태 |
|------|------|------|
| StrategyContext 구조체 | 전략 실행 컨텍스트 정의 | 🔲 미구현 |
| GlobalScore 계산기 | 7팩터 점수 계산 로직 | 🔲 미구현 |
| RouteState 결정기 | TTM Squeeze + 모멘텀 기반 상태 판단 | 🔲 미구현 |
| MarketRegime 분류기 | 5가지 레짐 분류 로직 | 🔲 미구현 |
| StructuralFeatures 계산기 | 6가지 구조적 피처 계산 | 🔲 미구현 |
| MacroEnvironment 수집기 | VIX, 환율, 금리 등 매크로 데이터 | 🔲 미구현 |
| MarketBreadth 계산기 | 시장 폭 지표 계산 | 🔲 미구현 |

### Phase 2: 전략 마이그레이션 (우선순위별)

#### 높은 우선순위 (실시간 전략)

| 전략 | 연동 포인트 | 난이도 | 예상 작업량 |
|------|------------|--------|-----------|
| RSI Mean Reversion | RouteState, GlobalScore | ⭐⭐ | 4h |
| Grid Trading | MarketRegime, StructuralFeatures | ⭐⭐⭐ | 6h |
| Magic Split | RouteState, GlobalScore, MarketRegime | ⭐⭐⭐ | 6h |
| Infinity Bot | 전체 Context | ⭐⭐⭐⭐ | 8h |
| Volatility Breakout | MarketRegime, MacroEnvironment | ⭐⭐⭐ | 5h |

#### 중간 우선순위 (자산배분 전략)

| 전략 | 연동 포인트 | 난이도 | 예상 작업량 |
|------|------------|--------|-----------|
| HAA | MacroEnvironment, MarketBreadth | ⭐⭐⭐ | 6h |
| All Weather | 전체 Context | ⭐⭐⭐⭐ | 8h |
| Simple Power | MacroEnvironment | ⭐⭐ | 4h |
| Snow | MacroEnvironment | ⭐⭐ | 4h |
| Stock Rotation | GlobalScore, MarketRegime | ⭐⭐⭐ | 5h |

#### 낮은 우선순위 (기타 전략)

| 전략 | 연동 포인트 | 난이도 | 예상 작업량 |
|------|------------|--------|-----------|
| Bollinger Bands | StructuralFeatures | ⭐⭐ | 3h |
| SMA Crossover | RouteState | ⭐ | 2h |
| Candle Pattern | StructuralFeatures | ⭐⭐ | 4h |
| 기타 12개 전략 | 기본 연동 | ⭐⭐ | 각 3h |

### Phase 3: 공통 모듈 추출

마이그레이션 과정에서 발견되는 중복 로직을 공통 모듈로 추출:

```
strategies/common/
├── position_sizing.rs    # 포지션 사이징 (완료 후 추출)
├── risk_checks.rs        # 리스크 체크 (완료 후 추출)
├── signal_filters.rs     # 신호 필터 (완료 후 추출)
├── entry_exit.rs         # 진입/청산 공통 로직 (완료 후 추출)
├── indicators.rs         # 기술적 지표 (기존 활용)
├── momentum.rs           # 모멘텀 계산 (기존 활용)
└── position_sync.rs      # 포지션 동기화 (✅ 구현 완료)
```

### 마이그레이션 체크리스트 (전략별)

각 전략 마이그레이션 시 확인할 항목:

- [ ] 기존 테스트 통과 (하위 호환성)
- [ ] StrategyContext 주입 구현
- [ ] RouteState 필터 옵트인 옵션 추가
- [ ] GlobalScore 필터 옵트인 옵션 추가
- [ ] MarketRegime 기반 파라미터 조정 로직 추가
- [ ] StructuralFeatures 활용 로직 추가
- [ ] MacroEnvironment 활용 로직 추가 (해당 시)
- [ ] MarketBreadth 활용 로직 추가 (해당 시)
- [ ] 신규 설정 필드 문서화
- [ ] 신규 테스트 케이스 추가

---

## 참조 문서

| 문서 | 위치 | 설명 |
|------|------|------|
| Python 모듈 | `docs/python_strategy_modules.md` | Python 유틸리티 모듈 분석 |
| TODO | `docs/todo.md` | 구현 계획 |
| API 문서 | `docs/api.md` | REST API 명세 |
| 아키텍처 | `docs/architecture.md` | 시스템 아키텍처 |

---

*문서 생성일: 2026-02-01*
