# TickSizeProvider 사용 가이드

> 작성일: 2026-02-02
> 버전: v0.5.6

---

## 개요

`TickSizeProvider`는 거래소별 호가 단위(Tick Size) 규칙을 추상화한 trait입니다. 각 거래소는 고유한 호가 단위를 가지며, 이를 준수하지 않으면 주문이 거부될 수 있습니다.

---

## 지원 거래소

### 1. KRX (한국거래소)

**7단계 호가 규칙**:

| 가격 구간 | 호가 단위 |
|----------|---------|
| 100원 미만 | 1원 |
| 100 ~ 1,000원 | 5원 |
| 1,000 ~ 10,000원 | 10원 |
| 10,000 ~ 50,000원 | 50원 |
| 50,000 ~ 100,000원 | 100원 |
| 100,000 ~ 500,000원 | 500원 |
| 500,000원 이상 | 1,000원 |

**사용 예시**:

```rust
use trader_core::{KrxTickSize, TickSizeProvider, RoundMethod};
use rust_decimal_macros::dec;

let provider = KrxTickSize::new();

// 35,432원 -> 50원 단위
let price = dec!(35_432);
let rounded = provider.round_to_tick(price, RoundMethod::Round);
assert_eq!(rounded, dec!(35_450));

// 가격 검증
assert!(!provider.is_valid_price(dec!(35_432))); // 무효
assert!(provider.is_valid_price(dec!(35_450)));  // 유효
```

---

### 2. US Equity (미국 주식)

**고정 $0.01 호가**:

```rust
use trader_core::{UsEquityTickSize, TickSizeProvider, RoundMethod};
use rust_decimal_macros::dec;

let provider = UsEquityTickSize::new();

// 모든 가격은 $0.01 단위
let price = dec!(123.456);
let rounded = provider.round_to_tick(price, RoundMethod::Round);
assert_eq!(rounded, dec!(123.46));
```

---

### 3. Binance (암호화폐)

**심볼별 tick_size**:

```rust
use trader_core::{BinanceTickSize, TickSizeProvider, RoundMethod};
use rust_decimal_macros::dec;
use std::collections::HashMap;

let mut tick_sizes = HashMap::new();
tick_sizes.insert("BTCUSDT".to_string(), dec!(0.01));
tick_sizes.insert("DOGEUSDT".to_string(), dec!(0.00001));

let provider = BinanceTickSize::new(tick_sizes, Some(dec!(0.01)));

// 심볼별 조회
let btc_tick = provider.get_tick_size_for_symbol("BTCUSDT");
assert_eq!(btc_tick, dec!(0.01));

let doge_tick = provider.get_tick_size_for_symbol("DOGEUSDT");
assert_eq!(doge_tick, dec!(0.00001));
```

---

## 라운딩 방법

`RoundMethod` enum은 3가지 라운딩 전략을 제공합니다:

### 1. Round (일반 반올림)
```rust
provider.round_to_tick(dec!(35_432), RoundMethod::Round);
// -> 35,450원 (가까운 쪽)
```

### 2. Floor (내림)
```rust
provider.round_to_tick(dec!(35_432), RoundMethod::Floor);
// -> 35,400원 (보수적, 매수 시 유리)
```

### 3. Ceil (올림)
```rust
provider.round_to_tick(dec!(35_432), RoundMethod::Ceil);
// -> 35,450원 (공격적, 매도 시 유리)
```

**권장 사용**:
- **매수 주문**: `Floor` (더 낮은 가격으로 매수)
- **매도 주문**: `Ceil` (더 높은 가격으로 매도)
- **일반**: `Round` (중립적)

---

## 백테스트 통합

백테스트 엔진에서 호가 단위를 사용하려면:

```rust
use trader_exchange::MatchingEngine;
use trader_core::{KrxTickSize, TickSizeProvider};
use rust_decimal_macros::dec;
use std::sync::Arc;

// 1. 호가 단위 제공자 생성
let tick_provider: Arc<dyn TickSizeProvider> = Arc::new(KrxTickSize::new());

// 2. 매칭 엔진에 설정
let engine = MatchingEngine::new(dec!(0.001), dec!(0.0005))
    .with_tick_size_provider(tick_provider);

// 3. 이제 모든 가격이 호가 단위로 라운딩됩니다
```

**효과**:
- ✅ 시장가 주문: 슬리피지 적용 후 호가 단위로 라운딩
- ✅ 지정가 주문: 입력 가격을 호가 단위로 조정
- ✅ 백테스트 정확도 향상 (실제 거래소와 동일한 가격 처리)

---

## 실거래 통합 (예정)

거래소 커넥터에서 사용:

```rust
// KIS 커넥터 예시
use trader_exchange::kis::ClientKr;
use trader_core::{KrxTickSize, TickSizeProvider};

let provider = KrxTickSize::new();
let mut client = ClientKr::new(app_key, secret_key);

// 주문 전 가격 검증 및 라운딩
let order_price = dec!(35_432);
if !provider.is_valid_price(order_price) {
    let rounded_price = provider.round_to_tick(order_price, RoundMethod::Round);
    println!("가격 조정: {} -> {}", order_price, rounded_price);
}
```

---

## 직접 생성

각 거래소의 TickSizeProvider는 직접 생성하여 사용합니다:

```rust
use trader_core::{KrxTickSize, UsEquityTickSize, BinanceTickSize};
use std::sync::Arc;

// 거래소별 생성
let krx_provider = Arc::new(KrxTickSize::new());
let us_provider = Arc::new(UsEquityTickSize::new());
let binance_provider = Arc::new(BinanceTickSize::default());
```

> **참고**: trader-core는 거래소 중립적인 trait과 구현체만 제공합니다.
> 거래소별 팩토리 함수는 trader-exchange 크레이트에서 제공될 예정입니다.

---

## 테스트

전체 테스트 실행:

```bash
cargo test -p trader-core tick_size
```

**테스트 커버리지**:
- ✅ KRX 7단계 호가 규칙
- ✅ KRX 라운딩 (Round/Floor/Ceil)
- ✅ KRX 가격 검증
- ✅ US Equity 고정 호가
- ✅ Binance 심볼별 tick_size

---

## 마이그레이션 가이드

기존 코드에서 TickSizeProvider로 마이그레이션:

### Before (호가 단위 미적용)
```rust
let fill_price = current_price + slippage;
```

### After (호가 단위 적용)
```rust
let raw_price = current_price + slippage;
let fill_price = provider.round_to_tick(raw_price, RoundMethod::Ceil);
```

---

## 주의사항

1. **Binance 심볼 정보**: Exchange Info API에서 심볼별 tick_size를 가져와 캐싱해야 합니다.
2. **가격 검증**: 주문 제출 전 `is_valid_price()`로 검증 권장
3. **라운딩 방향**: 매수/매도에 따라 적절한 RoundMethod 선택

---

## 향후 개선 계획

- [ ] Binance Exchange Info API 자동 조회
- [ ] 거래소 커넥터 통합 (KIS, Binance)
- [ ] 실시간 호가 단위 업데이트
- [ ] StrategyContext에 통합

---

## 참고 자료

- [KRX 호가 규칙](https://kind.krx.co.kr/)
- [Binance API 문서](https://binance-docs.github.io/apidocs/spot/en/)
- `crates/trader-core/src/domain/tick_size.rs`
