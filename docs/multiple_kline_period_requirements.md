# Multiple KLine Period (다중 타임프레임) 기능 요구사항

> **버전**: 1.0  
> **작성일**: 2026-02-02  
> **참조 문서**: `prd.md`, `todo.md`, `architecture.md`, `STRATEGY_DEVELOPMENT.md`

---

## 📋 목차

1. [기능 개요](#-기능-개요)
2. [현재 시스템 분석](#-현재-시스템-분석)
3. [요구사항 정의](#-요구사항-정의)
4. [구현 방법론](#-구현-방법론)
5. [데이터 구조 설계](#-데이터-구조-설계)
6. [API 설계](#-api-설계)
7. [전략 통합 방안](#-전략-통합-방안)
8. [성능 고려사항](#-성능-고려사항)
9. [구현 우선순위](#-구현-우선순위)

---

## 🎯 기능 개요

### 1.1 목적

Multiple KLine Period(다중 타임프레임) 기능은 **단일 전략에서 여러 타임프레임의 캔들 데이터를 동시에 활용**하여 더 정교한 매매 신호를 생성하는 기능입니다.

### 1.2 배경

현재 ZeroQuant의 전략들은 단일 타임프레임(예: 5분봉, 1시간봉)을 기준으로 동작합니다. 그러나 전문 트레이더들은 **멀티 타임프레임 분석(MTF Analysis)**을 통해:

- **장기 추세 확인**: 일봉/주봉으로 전체 추세 방향 파악
- **중기 진입 타이밍**: 4시간봉/1시간봉으로 진입 시점 포착
- **단기 실행**: 5분봉/15분봉으로 정밀한 진입/청산 실행

이러한 계층적 분석을 통해 **신호의 신뢰도를 높이고 허위 신호(False Signal)를 필터링**할 수 있습니다.

### 1.3 사용 예시

**RSI 멀티 타임프레임 전략**:
- **일봉 RSI > 50**: 상승 추세 → Long 포지션만 허용
- **1시간봉 RSI < 30**: 과매도 구간 → 진입 신호 생성
- **5분봉 RSI 반등**: 실제 진입 타이밍 결정

**이동평균 계층 전략**:
- **주봉 200MA 위**: 장기 상승장 확인
- **일봉 20MA 위**: 중기 상승 확인
- **1시간봉 골든크로스**: 진입 신호

---

## 📊 현재 시스템 분석

### 2.1 현재 Timeframe 지원

ZeroQuant는 `trader-core/src/types/timeframe.rs`에서 16가지 타임프레임을 지원합니다:

| 분류 | 타임프레임 | Binance 포맷 |
|------|------------|--------------|
| **분봉** | M1, M3, M5, M15, M30 | 1m, 3m, 5m, 15m, 30m |
| **시간봉** | H1, H2, H4, H6, H8, H12 | 1h, 2h, 4h, 6h, 8h, 12h |
| **일봉 이상** | D1, D3, W1, MN1 | 1d, 3d, 1w, 1M |

### 2.2 현재 KLine 데이터 흐름

```
[거래소 API] → [trader-exchange 수집]
      ↓
[Kline 구조체] (Symbol, Timeframe, OHLCV)
      ↓
[OhlcvCache 저장] (PostgreSQL/TimescaleDB)
      ↓
[전략 실행] (단일 Timeframe 조회)
```

### 2.3 현재 한계점

❌ **전략은 생성 시 지정한 단일 Timeframe만 사용 가능**  
❌ **다른 Timeframe 데이터 조회 시 별도 쿼리 필요 (성능 저하)**  
❌ **Timeframe 간 데이터 정합성 보장 메커니즘 없음**  
❌ **백테스트에서 멀티 타임프레임 신호 재현 어려움**

---

## 🎯 요구사항 정의

### 3.1 기능 요구사항 (FR)

#### FR-1: 전략 Multi-Timeframe Config 지원

**설명**: 전략 생성 시 Primary Timeframe 외에 추가 Timeframe(Secondary) 지정 가능

**우선순위**: 🔴 Critical

**요구사항**:
- 전략 Config에 `primary_timeframe`, `secondary_timeframes: Vec<Timeframe>` 필드 추가
- SDUI 스키마에서 멀티 타임프레임 선택 UI 지원
- 최대 3개 타임프레임 동시 지원 (Primary 1개 + Secondary 2개)
- Secondary는 Primary보다 **큰 타임프레임만 허용** (예: Primary=5m일 때 Secondary=1h, 1d)

**검증 규칙**:
```rust
// 잘못된 예: Secondary가 Primary보다 작음
primary: M5 (5분)
secondary: [M1, M3] ❌ Error

// 올바른 예
primary: M5 (5분)
secondary: [H1, D1] ✅ OK
```

---

#### FR-2: KLine 데이터 동시 조회 API

**설명**: 특정 심볼의 여러 타임프레임 데이터를 한 번에 조회하는 효율적인 API

**우선순위**: 🔴 Critical

**요구사항**:
- `OhlcvCache::get_multi_timeframe_klines(symbol, timeframes, limit)` 구현
- 단일 SQL 쿼리로 여러 타임프레임 데이터 조회 (JOIN 또는 UNION ALL)
- 타임스탬프 정렬 보장 (각 타임프레임 내에서 시간순 정렬)
- 캐시 히트율 최적화 (Redis 멀티키 조회)

**성능 목표**:
- 3개 타임프레임 동시 조회 시 < 50ms (캐시 히트)
- DB 쿼리 시 < 200ms

---

#### FR-3: 전략 Context에 Multi-Timeframe 데이터 주입

**설명**: 전략 실행 시 필요한 모든 타임프레임 데이터를 Context에 미리 로드

**우선순위**: 🔴 Critical

**요구사항**:
- `StrategyContext`에 `klines_by_timeframe: HashMap<Timeframe, Vec<Kline>>` 필드 추가
- 전략 `analyze()` 메서드 호출 전에 모든 타임프레임 데이터 로드
- 각 타임프레임별로 최근 N개 캔들 제공 (설정 가능, 기본 100개)
- 데이터 누락 시 에러 처리 (일부 타임프레임 데이터 없을 경우)

**예제 코드**:
```rust
impl Strategy for RsiMultiTimeframeStrategy {
    async fn analyze(&self, ctx: &StrategyContext) -> Result<Signal> {
        // Primary Timeframe (5m)
        let klines_5m = ctx.get_klines(Timeframe::M5)?;
        
        // Secondary Timeframes
        let klines_1h = ctx.get_klines(Timeframe::H1)?;
        let klines_1d = ctx.get_klines(Timeframe::D1)?;
        
        // 멀티 타임프레임 분석 로직
        let daily_trend = analyze_trend(&klines_1d);
        let hourly_momentum = analyze_momentum(&klines_1h);
        let minute_entry = find_entry_point(&klines_5m);
        
        if daily_trend == Trend::Bullish 
           && hourly_momentum > 0.5 
           && minute_entry.is_some() {
            return Ok(Signal::Buy);
        }
        
        Ok(Signal::Hold)
    }
}
```

---

#### FR-4: Timeframe Alignment (시간 정렬)

**설명**: 여러 타임프레임 데이터의 시간을 정렬하여 정합성 보장

**우선순위**: 🟡 High

**요구사항**:
- Primary 타임프레임의 현재 캔들 시점을 기준으로 Secondary 타임프레임 데이터 정렬
- 예: Primary가 `2026-02-02 10:25:00` (5분봉)일 때, 1시간봉은 `2026-02-02 10:00:00` 캔들 제공
- 미래 데이터 누출(Look-ahead Bias) 방지: Secondary는 Primary의 `open_time` 이전 데이터만 사용

**정렬 규칙**:
```
Primary (5m): 10:25:00 캔들
   ↓
Secondary (1h): 10:00:00 캔들 (OK) ✅
               11:00:00 캔들 (NG) ❌ 미래 데이터

Secondary (1d): 2026-02-02 00:00:00 캔들 (OK) ✅
```

---

#### FR-5: 백테스트 Multi-Timeframe 지원

**설명**: 백테스트 시 멀티 타임프레임 전략이 과거 데이터에서 정확히 재현

**우선순위**: 🟡 High

**요구사항**:
- 백테스트 엔진에서 각 타임스탬프마다 올바른 Secondary 데이터 로드
- 히스토리 데이터 캐싱으로 반복 쿼리 최소화
- 테스트 결과에 타임프레임별 신호 상세 기록 (디버깅용)

---

#### FR-6: 실시간 WebSocket 멀티 타임프레임 수신

**설명**: 실시간 거래 시 여러 타임프레임 업데이트를 효율적으로 처리

**우선순위**: 🟢 Medium

**요구사항**:
- Binance WebSocket에서 여러 타임프레임 스트림 동시 구독
  - 예: `btcusdt@kline_5m`, `btcusdt@kline_1h`, `btcusdt@kline_1d`
- 각 타임프레임 업데이트 시 Context 자동 갱신
- Primary 타임프레임 완료 시에만 전략 재평가 (Secondary 업데이트는 대기)

---

### 3.2 비기능 요구사항 (NFR)

#### NFR-1: 성능

- **멀티 타임프레임 조회 오버헤드 < 2배**: 3개 타임프레임 사용 시 단일 대비 2배 이내 레이턴시
- **메모리 사용량 제한**: 전략당 최대 10MB (100개 캔들 × 3 타임프레임 × 20 전략)

#### NFR-2: 확장성

- 타임프레임 추가 시 코드 수정 최소화 (설정 변경으로 대응)
- 새로운 거래소 추가 시 멀티 타임프레임 자동 지원

#### NFR-3: 유지보수성

- 기존 단일 타임프레임 전략과 하위 호환성 유지
- 전략 코드에서 타임프레임 관련 로직 명확히 분리

---

## 🛠️ 구현 방법론

### 4.1 아키텍처 설계 원칙

#### 원칙 1: **계층 분리 (Separation of Concerns)**

```
┌─────────────────────────────────────────┐
│   Strategy Layer (전략 로직)             │
│   - analyze() 메서드에서 다중 TF 사용    │
│   - 비즈니스 로직에 집중                  │
└─────────────┬───────────────────────────┘
              │ get_klines(tf)
┌─────────────▼───────────────────────────┐
│   Context Layer (데이터 제공)            │
│   - 타임프레임별 데이터 캐싱             │
│   - 시간 정렬 처리                       │
└─────────────┬───────────────────────────┘
              │ load_multi_timeframe()
┌─────────────▼───────────────────────────┐
│   Data Layer (데이터 저장/조회)          │
│   - OhlcvCache: DB/Redis 조회            │
│   - 효율적인 멀티 쿼리                   │
└─────────────────────────────────────────┘
```

#### 원칙 2: **Lazy Loading vs Eager Loading**

**Eager Loading** (권장):
- 전략 실행 전에 필요한 모든 타임프레임 데이터 미리 로드
- 장점: 일관성 보장, 예측 가능한 성능
- 단점: 사용하지 않는 데이터도 로드

**Lazy Loading**:
- 전략에서 요청 시에만 데이터 로드
- 장점: 메모리 효율
- 단점: 런타임 에러 가능성, 성능 예측 어려움

**선택**: **Eager Loading** (신뢰성 우선)

---

### 4.2 구현 단계 (6 Phases)

#### Phase 1: 데이터 모델 확장 (1주)

**작업 항목**:
1. `StrategyConfig`에 `MultiTimeframeConfig` 필드 추가
   ```rust
   #[derive(Serialize, Deserialize)]
   pub struct MultiTimeframeConfig {
       pub primary: Timeframe,
       pub secondary: Vec<Timeframe>, // 최대 2개
   }
   ```

2. `StrategyContext`에 멀티 타임프레임 데이터 저장
   ```rust
   pub struct StrategyContext {
       // ... 기존 필드
       pub klines_by_timeframe: HashMap<Timeframe, Vec<Kline>>,
   }
   
   impl StrategyContext {
       pub fn get_klines(&self, tf: Timeframe) -> Result<&Vec<Kline>> {
           self.klines_by_timeframe.get(&tf)
               .ok_or_else(|| Error::TimeframeNotLoaded(tf))
       }
   }
   ```

3. DB 스키마 확장 (선택적)
   ```sql
   ALTER TABLE strategies 
   ADD COLUMN secondary_timeframes TEXT[]; -- ['1h', '1d']
   ```

**마일스톤**: 데이터 구조 정의 완료, 마이그레이션 스크립트 준비

---

#### Phase 2: 데이터 조회 API 구현 (1주)

**작업 항목**:
1. `OhlcvCache::get_multi_timeframe_klines()` 구현
   ```rust
   pub async fn get_multi_timeframe_klines(
       &self,
       symbol: &Symbol,
       timeframes: &[Timeframe],
       limit: usize,
   ) -> Result<HashMap<Timeframe, Vec<Kline>>> {
       // 1. Redis에서 먼저 조회 (멀티키 GET)
       // 2. 캐시 미스 시 PostgreSQL 조회 (UNION ALL)
       // 3. 결과를 Redis에 캐싱
   }
   ```

2. SQL 쿼리 최적화
   ```sql
   SELECT symbol, timeframe, open_time, open, high, low, close, volume
   FROM ohlcv
   WHERE symbol = $1
     AND timeframe = ANY($2)  -- ['5m', '1h', '1d']
     AND open_time >= $3
   ORDER BY timeframe, open_time DESC
   LIMIT $4;
   ```

3. 성능 테스트 작성
   - 단일 vs 멀티 타임프레임 조회 속도 비교
   - 캐시 히트율 측정

**마일스톤**: 멀티 조회 API 완성, 성능 목표 달성

---

#### Phase 3: Context Layer 통합 (1주)

**작업 항목**:
1. `StrategyExecutor`에서 Context 생성 시 멀티 데이터 로드
   ```rust
   async fn create_context(
       strategy: &dyn Strategy,
       symbol: &Symbol,
   ) -> Result<StrategyContext> {
       let config = strategy.multi_timeframe_config();
       let mut timeframes = vec![config.primary];
       timeframes.extend(config.secondary.iter());
       
       let klines_by_tf = ohlcv_cache
           .get_multi_timeframe_klines(symbol, &timeframes, 100)
           .await?;
       
       Ok(StrategyContext {
           klines_by_timeframe: klines_by_tf,
           // ... 기타 필드
       })
   }
   ```

2. Timeframe Alignment 로직 구현
   ```rust
   fn align_timeframes(
       primary_kline: &Kline,
       secondary_klines: Vec<Kline>,
   ) -> Vec<Kline> {
       // Primary의 open_time 이전 데이터만 필터링
       secondary_klines.into_iter()
           .filter(|k| k.open_time < primary_kline.open_time)
           .collect()
   }
   ```

**마일스톤**: Context에서 안전하게 멀티 데이터 접근 가능

---

#### Phase 4: 전략 예제 작성 (1주)

**작업 항목**:
1. 기존 RSI 전략을 멀티 타임프레임으로 확장
   - `RsiMultiTimeframeStrategy` 구현
   - 일봉 추세 + 1시간 모멘텀 + 5분 진입

2. 이동평균 계층 전략
   - `MovingAverageCascadeStrategy`
   - 주봉 200MA, 일봉 50MA, 1시간 20MA

3. 전략 테스트 작성
   - 유닛 테스트: 타임프레임별 신호 검증
   - 통합 테스트: 실제 데이터로 백테스트

**마일스톤**: 2개 이상의 멀티 전략 동작 확인

---

#### Phase 5: SDUI 및 API 업데이트 (1.5주)

**작업 항목**:
1. SDUI 스키마에 멀티 타임프레임 선택 UI 추가
   ```json
   {
     "type": "multi-select",
     "id": "secondary_timeframes",
     "label": "보조 타임프레임 (최대 2개)",
     "options": [
       {"value": "1h", "label": "1시간"},
       {"value": "4h", "label": "4시간"},
       {"value": "1d", "label": "1일"},
       {"value": "1w", "label": "1주"}
     ],
     "max_selections": 2,
     "validation": "larger_than_primary"
   }
   ```

2. API 엔드포인트 수정
   - `POST /api/v1/strategies`: `secondary_timeframes` 필드 수신
   - `GET /api/v1/strategies/{id}`: 멀티 설정 반환

3. 프론트엔드 컴포넌트 개발
   - MultiTimeframeSelector.tsx
   - 타임프레임 간 유효성 검증 UI

**마일스톤**: 프론트엔드에서 멀티 전략 생성 가능

---

#### Phase 6: 백테스트 및 실시간 통합 (1.5주)

**작업 항목**:
1. 백테스트 엔진 수정
   - 타임스탬프별 Secondary 데이터 올바른 로드
   - 히스토리 캐싱으로 성능 최적화

2. WebSocket 멀티 스트림 구독
   ```rust
   let streams = vec![
       format!("{}@kline_{}", symbol, "5m"),
       format!("{}@kline_{}", symbol, "1h"),
       format!("{}@kline_{}", symbol, "1d"),
   ];
   websocket_client.subscribe_combined(streams).await?;
   ```

3. 통합 테스트
   - 백테스트 결과와 실시간 결과 일관성 검증
   - 부하 테스트 (10개 전략 동시 실행)

**마일스톤**: 프로덕션 준비 완료

---

### 4.3 기술적 고려사항

#### 4.3.1 타임프레임 변환 (Timeframe Conversion)

**문제**: 작은 타임프레임에서 큰 타임프레임을 계산할 때 데이터 불일치 발생 가능

**해결책**: 
- **거래소 API에서 직접 각 타임프레임 데이터 수집** (변환 없음)
- 변환이 필요한 경우 명확한 규칙 문서화
  - 예: 5분봉 12개 → 1시간봉 1개 (Open: 첫 캔들, Close: 마지막 캔들, High/Low: 전체 최고/최저)

#### 4.3.2 데이터 동기화

**문제**: 실시간 거래 시 타임프레임별 업데이트 시점 불일치

**해결책**:
- **Primary 타임프레임 완료 시에만 전략 재평가**
- Secondary 업데이트는 Context에 반영만 하고 즉시 실행하지 않음
- 예: 5분봉 완료 시 → 1시간봉/일봉 최신 데이터 + 5분봉 최신 데이터로 분석

#### 4.3.3 캐시 무효화

**문제**: 타임프레임이 많아질수록 캐시 관리 복잡도 증가

**해결책**:
- Redis Key 구조: `ohlcv:{symbol}:{timeframe}:latest_100`
- TTL 설정: 타임프레임별 차등 적용
  - 분봉: 1분 TTL
  - 시간봉: 5분 TTL
  - 일봉: 1시간 TTL

---

## 📐 데이터 구조 설계

### 5.1 Config 구조체

```rust
// crates/trader-strategy/src/config.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiTimeframeConfig {
    /// Primary 타임프레임 (전략의 주 실행 주기)
    pub primary: Timeframe,
    
    /// Secondary 타임프레임들 (추가 분석용, 최대 2개)
    #[serde(default)]
    pub secondary: Vec<Timeframe>,
    
    /// 각 타임프레임별 로드할 캔들 개수
    #[serde(default = "default_lookback")]
    pub lookback_periods: HashMap<Timeframe, usize>,
}

fn default_lookback() -> HashMap<Timeframe, usize> {
    HashMap::from([
        (Timeframe::M5, 100),
        (Timeframe::H1, 50),
        (Timeframe::D1, 30),
    ])
}

impl MultiTimeframeConfig {
    /// Secondary 타임프레임 유효성 검증
    pub fn validate(&self) -> Result<()> {
        if self.secondary.len() > 2 {
            return Err(Error::TooManyTimeframes);
        }
        
        for tf in &self.secondary {
            if tf.as_secs() <= self.primary.as_secs() {
                return Err(Error::InvalidTimeframeOrder {
                    primary: self.primary,
                    secondary: *tf,
                });
            }
        }
        
        Ok(())
    }
    
    /// 모든 타임프레임 목록 반환 (Primary + Secondary)
    pub fn all_timeframes(&self) -> Vec<Timeframe> {
        let mut result = vec![self.primary];
        result.extend(self.secondary.iter().copied());
        result
    }
}
```

### 5.2 Context 구조체

```rust
// crates/trader-strategy/src/context.rs

#[derive(Debug)]
pub struct StrategyContext {
    // ... 기존 필드 (symbol, balance, position 등)
    
    /// 타임프레임별 캔들 데이터
    pub klines_by_timeframe: HashMap<Timeframe, Vec<Kline>>,
    
    /// 멀티 타임프레임 설정
    pub multi_tf_config: MultiTimeframeConfig,
    
    /// 현재 평가 중인 캔들의 타임스탬프 (Primary 기준)
    pub current_timestamp: DateTime<Utc>,
}

impl StrategyContext {
    /// 특정 타임프레임의 캔들 데이터 조회
    pub fn get_klines(&self, tf: Timeframe) -> Result<&[Kline]> {
        self.klines_by_timeframe
            .get(&tf)
            .map(|v| v.as_slice())
            .ok_or_else(|| Error::TimeframeNotLoaded(tf))
    }
    
    /// Primary 타임프레임 캔들 조회 (편의 메서드)
    pub fn primary_klines(&self) -> Result<&[Kline]> {
        self.get_klines(self.multi_tf_config.primary)
    }
    
    /// 최신 캔들 조회 (각 타임프레임별)
    pub fn latest_kline(&self, tf: Timeframe) -> Result<&Kline> {
        self.get_klines(tf)?
            .first()
            .ok_or(Error::NoKlineData)
    }
    
    /// 타임프레임 정렬 확인 (디버깅용)
    pub fn is_aligned(&self) -> bool {
        self.klines_by_timeframe.iter().all(|(tf, klines)| {
            klines.iter().all(|k| k.open_time <= self.current_timestamp)
        })
    }
}
```

### 5.3 OhlcvCache 확장

```rust
// crates/trader-data/src/storage/ohlcv.rs

impl OhlcvCache {
    /// 여러 타임프레임의 캔들을 한 번에 조회
    pub async fn get_multi_timeframe_klines(
        &self,
        symbol: &Symbol,
        timeframes: &[Timeframe],
        limit: usize,
    ) -> Result<HashMap<Timeframe, Vec<Kline>>> {
        // 1. Redis 멀티 GET (병렬 조회)
        let cache_keys: Vec<String> = timeframes
            .iter()
            .map(|tf| format!("ohlcv:{}:{}:latest_{}", symbol, tf, limit))
            .collect();
        
        let cached_results = self.redis
            .mget::<_, Vec<Option<String>>>(&cache_keys)
            .await?;
        
        let mut result = HashMap::new();
        let mut missing_tfs = Vec::new();
        
        // 2. 캐시 히트/미스 분류
        for (i, cached) in cached_results.into_iter().enumerate() {
            if let Some(json) = cached {
                let klines: Vec<Kline> = serde_json::from_str(&json)?;
                result.insert(timeframes[i], klines);
            } else {
                missing_tfs.push(timeframes[i]);
            }
        }
        
        // 3. 캐시 미스 시 DB 조회
        if !missing_tfs.is_empty() {
            let db_results = self.fetch_from_db(symbol, &missing_tfs, limit).await?;
            
            // 4. DB 결과를 Redis에 캐싱
            for (tf, klines) in db_results.iter() {
                let key = format!("ohlcv:{}:{}:latest_{}", symbol, tf, limit);
                let json = serde_json::to_string(klines)?;
                
                // TTL: 타임프레임에 따라 차등 적용
                let ttl = self.calculate_ttl(*tf);
                self.redis.set_ex(&key, json, ttl).await?;
            }
            
            result.extend(db_results);
        }
        
        Ok(result)
    }
    
    /// 타임프레임별 TTL 계산
    fn calculate_ttl(&self, tf: Timeframe) -> usize {
        match tf {
            Timeframe::M1 | Timeframe::M3 | Timeframe::M5 => 60,      // 1분
            Timeframe::M15 | Timeframe::M30 => 180,                   // 3분
            Timeframe::H1 | Timeframe::H2 | Timeframe::H4 => 300,     // 5분
            Timeframe::H6 | Timeframe::H8 | Timeframe::H12 => 600,    // 10분
            _ => 3600,                                                 // 1시간
        }
    }
    
    /// DB에서 여러 타임프레임 조회 (UNION ALL 사용)
    async fn fetch_from_db(
        &self,
        symbol: &Symbol,
        timeframes: &[Timeframe],
        limit: usize,
    ) -> Result<HashMap<Timeframe, Vec<Kline>>> {
        let tf_strings: Vec<String> = timeframes
            .iter()
            .map(|tf| tf.to_string())
            .collect();
        
        let rows = sqlx::query_as::<_, OhlcvRecord>(
            r#"
            SELECT symbol, timeframe, open_time, open, high, low, close, volume, 
                   quote_volume, num_trades, close_time
            FROM ohlcv
            WHERE symbol = $1
              AND timeframe = ANY($2)
              AND open_time >= NOW() - INTERVAL '7 days'
            ORDER BY timeframe, open_time DESC
            LIMIT $3
            "#,
        )
        .bind(symbol.to_string())
        .bind(&tf_strings)
        .bind(limit as i64 * timeframes.len() as i64)
        .fetch_all(&self.pool)
        .await?;
        
        // 타임프레임별로 그룹화
        let mut result: HashMap<Timeframe, Vec<Kline>> = HashMap::new();
        
        for row in rows {
            let tf = Timeframe::from_str(&row.timeframe)?;
            result.entry(tf).or_insert_with(Vec::new).push(row.to_kline());
        }
        
        Ok(result)
    }
}
```

---

## 🌐 API 설계

### 6.1 REST API 엔드포인트

#### POST /api/v1/strategies

**요청 Body 예제**:
```json
{
  "name": "RSI Multi Timeframe",
  "strategy_type": "RsiMultiTimeframe",
  "market": "Crypto",
  "multi_timeframe_config": {
    "primary": "5m",
    "secondary": ["1h", "1d"],
    "lookback_periods": {
      "5m": 100,
      "1h": 50,
      "1d": 30
    }
  },
  "parameters": {
    "symbol": "BTCUSDT",
    "rsi_period_5m": 14,
    "rsi_period_1h": 14,
    "rsi_period_1d": 14,
    "oversold_threshold": 30,
    "overbought_threshold": 70
  }
}
```

**응답**:
```json
{
  "id": 123,
  "name": "RSI Multi Timeframe",
  "status": "created",
  "multi_timeframe_config": {
    "primary": "5m",
    "secondary": ["1h", "1d"]
  }
}
```

---

#### GET /api/v1/strategies/{id}/timeframes

**설명**: 전략의 타임프레임 설정 조회

**응답**:
```json
{
  "strategy_id": 123,
  "primary": {
    "timeframe": "5m",
    "description": "5분봉",
    "last_update": "2026-02-02T10:25:00Z"
  },
  "secondary": [
    {
      "timeframe": "1h",
      "description": "1시간봉",
      "last_update": "2026-02-02T10:00:00Z"
    },
    {
      "timeframe": "1d",
      "description": "일봉",
      "last_update": "2026-02-02T00:00:00Z"
    }
  ]
}
```

---

#### GET /api/v1/klines/multi

**설명**: 여러 타임프레임 캔들 데이터 조회 (디버깅용)

**Query Parameters**:
- `symbol`: 심볼 (예: BTCUSDT)
- `timeframes`: 쉼표로 구분된 타임프레임 (예: 5m,1h,1d)
- `limit`: 각 타임프레임별 캔들 개수 (기본 100)

**요청 예제**:
```
GET /api/v1/klines/multi?symbol=BTCUSDT&timeframes=5m,1h,1d&limit=50
```

**응답**:
```json
{
  "symbol": "BTCUSDT",
  "data": {
    "5m": [
      {
        "open_time": "2026-02-02T10:25:00Z",
        "open": 50000.0,
        "high": 50100.0,
        "low": 49900.0,
        "close": 50050.0,
        "volume": 123.45
      }
      // ... 49개 더
    ],
    "1h": [ /* 50개 캔들 */ ],
    "1d": [ /* 50개 캔들 */ ]
  },
  "count": {
    "5m": 50,
    "1h": 50,
    "1d": 50
  }
}
```

---

### 6.2 WebSocket API

#### 스트림 구독 메시지

**요청**:
```json
{
  "method": "SUBSCRIBE",
  "params": [
    "btcusdt@kline_5m",
    "btcusdt@kline_1h",
    "btcusdt@kline_1d"
  ],
  "id": 1
}
```

**응답 (5분봉 업데이트)**:
```json
{
  "stream": "btcusdt@kline_5m",
  "data": {
    "symbol": "BTCUSDT",
    "timeframe": "5m",
    "open_time": "2026-02-02T10:25:00Z",
    "open": 50000.0,
    "close": 50050.0,
    "is_final": true
  }
}
```

---

## 🎯 전략 통합 방안

### 7.1 기존 전략 확장

**옵션 1: Config에 멀티 설정 추가** (권장)

```rust
#[derive(StrategyConfig)]
pub struct RsiStrategyConfig {
    pub symbol: Symbol,
    
    // 멀티 타임프레임 설정 (선택적)
    #[serde(default)]
    pub multi_timeframe: Option<MultiTimeframeConfig>,
    
    pub rsi_period: usize,
    pub oversold: f64,
    pub overbought: f64,
}

impl Strategy for RsiStrategy {
    async fn analyze(&self, ctx: &StrategyContext) -> Result<Signal> {
        // 멀티 타임프레임 사용 여부 확인
        if let Some(mtf) = &self.config.multi_timeframe {
            return self.analyze_multi_timeframe(ctx, mtf).await;
        }
        
        // 기존 단일 타임프레임 로직
        self.analyze_single_timeframe(ctx).await
    }
    
    async fn analyze_multi_timeframe(
        &self,
        ctx: &StrategyContext,
        mtf: &MultiTimeframeConfig,
    ) -> Result<Signal> {
        // Primary 타임프레임
        let klines_primary = ctx.primary_klines()?;
        let rsi_5m = calculate_rsi(klines_primary, self.config.rsi_period);
        
        // Secondary 타임프레임 (예: 1시간)
        if let Some(tf_1h) = mtf.secondary.get(0) {
            let klines_1h = ctx.get_klines(*tf_1h)?;
            let rsi_1h = calculate_rsi(klines_1h, self.config.rsi_period);
            
            // 필터링: 1시간 RSI가 중립~강세일 때만 매수
            if rsi_1h < 50.0 {
                return Ok(Signal::Hold); // 1시간 약세 → 매수 금지
            }
        }
        
        // 5분봉 진입 신호
        if rsi_5m < self.config.oversold {
            return Ok(Signal::Buy);
        }
        
        Ok(Signal::Hold)
    }
}
```

**옵션 2: 새로운 전략 타입 생성**

```rust
pub struct RsiMultiTimeframeStrategy {
    config: RsiMtfConfig,
}

#[derive(StrategyConfig)]
pub struct RsiMtfConfig {
    pub symbol: Symbol,
    pub multi_timeframe: MultiTimeframeConfig, // 필수
    
    pub rsi_period_primary: usize,
    pub rsi_period_secondary: usize,
    
    pub oversold_threshold: f64,
}

impl Strategy for RsiMultiTimeframeStrategy {
    async fn analyze(&self, ctx: &StrategyContext) -> Result<Signal> {
        // 항상 멀티 타임프레임 분석
        let primary_tf = self.config.multi_timeframe.primary;
        let secondary_tf = self.config.multi_timeframe.secondary[0];
        
        let klines_primary = ctx.get_klines(primary_tf)?;
        let klines_secondary = ctx.get_klines(secondary_tf)?;
        
        // 계층적 분석
        let trend = analyze_trend(klines_secondary);
        let momentum = analyze_momentum(klines_primary);
        
        if trend == Trend::Bullish && momentum > 0.5 {
            return Ok(Signal::Buy);
        }
        
        Ok(Signal::Hold)
    }
}
```

**권장**: **옵션 2 (새로운 전략 타입)**
- 명확한 의도 전달
- 기존 전략과의 혼동 방지
- 타입 안전성 향상

---

### 7.2 헬퍼 함수 제공

```rust
// crates/trader-strategy/src/utils/multi_timeframe.rs

/// 타임프레임별 추세 분석
pub fn analyze_trend(klines: &[Kline]) -> Trend {
    if klines.len() < 2 {
        return Trend::Neutral;
    }
    
    let ma_short = calculate_sma(klines, 10);
    let ma_long = calculate_sma(klines, 20);
    
    if ma_short > ma_long {
        Trend::Bullish
    } else if ma_short < ma_long {
        Trend::Bearish
    } else {
        Trend::Neutral
    }
}

/// 여러 타임프레임의 RSI 값 계산
pub fn calculate_multi_rsi(
    ctx: &StrategyContext,
    timeframes: &[Timeframe],
    period: usize,
) -> Result<HashMap<Timeframe, f64>> {
    let mut result = HashMap::new();
    
    for tf in timeframes {
        let klines = ctx.get_klines(*tf)?;
        let rsi = calculate_rsi(klines, period);
        result.insert(*tf, rsi);
    }
    
    Ok(result)
}

/// 타임프레임 간 신호 합성
pub enum SignalStrength {
    Strong,   // 모든 TF 동의
    Medium,   // 일부 TF 동의
    Weak,     // 단일 TF만
}

pub fn combine_signals(
    signals: HashMap<Timeframe, Signal>,
) -> (Signal, SignalStrength) {
    let buy_count = signals.values().filter(|s| **s == Signal::Buy).count();
    let total = signals.len();
    
    if buy_count == total {
        (Signal::Buy, SignalStrength::Strong)
    } else if buy_count > 0 {
        (Signal::Buy, SignalStrength::Medium)
    } else {
        (Signal::Hold, SignalStrength::Weak)
    }
}
```

---

## ⚡ 성능 고려사항

### 8.1 메모리 최적화

**문제**: 멀티 타임프레임 사용 시 메모리 사용량 증가

**해결책**:
1. **Lookback Period 제한**
   - Primary: 최대 200개 캔들
   - Secondary: 최대 100개 캔들
   - 더 오래된 데이터가 필요한 경우 별도 쿼리

2. **Lazy Deserialization**
   - Redis에서 조회한 JSON을 즉시 역직렬화하지 않고 필요 시에만
   - `Arc<RwLock<Option<Vec<Kline>>>>` 사용

3. **압축**
   - Redis 저장 시 LZ4 압축 적용 (큰 데이터셋에만)

---

### 8.2 쿼리 최적화

**현재 단일 타임프레임 쿼리**:
```sql
SELECT * FROM ohlcv
WHERE symbol = 'BTCUSDT' AND timeframe = '5m'
ORDER BY open_time DESC
LIMIT 100;
```
**실행 시간**: ~10ms

**멀티 타임프레임 쿼리 (비효율적)**:
```sql
-- 3번 쿼리 (30ms)
SELECT * FROM ohlcv WHERE symbol = 'BTCUSDT' AND timeframe = '5m' LIMIT 100;
SELECT * FROM ohlcv WHERE symbol = 'BTCUSDT' AND timeframe = '1h' LIMIT 100;
SELECT * FROM ohlcv WHERE symbol = 'BTCUSDT' AND timeframe = '1d' LIMIT 100;
```

**최적화된 단일 쿼리 (UNION ALL)**:
```sql
SELECT * FROM (
    SELECT *, '5m' as tf_order FROM ohlcv 
    WHERE symbol = 'BTCUSDT' AND timeframe = '5m' 
    ORDER BY open_time DESC LIMIT 100
) UNION ALL
SELECT * FROM (
    SELECT *, '1h' as tf_order FROM ohlcv 
    WHERE symbol = 'BTCUSDT' AND timeframe = '1h' 
    ORDER BY open_time DESC LIMIT 100
) UNION ALL
SELECT * FROM (
    SELECT *, '1d' as tf_order FROM ohlcv 
    WHERE symbol = 'BTCUSDT' AND timeframe = '1d' 
    ORDER BY open_time DESC LIMIT 100
)
ORDER BY tf_order, open_time DESC;
```
**실행 시간**: ~15ms (3번 쿼리 대비 50% 단축)

---

### 8.3 캐싱 전략

**계층적 캐싱**:

```
Level 1: 메모리 (StrategyContext)
   ↓ Cache Miss
Level 2: Redis (멀티키 GET)
   ↓ Cache Miss
Level 3: PostgreSQL (UNION ALL)
```

**캐시 키 설계**:
```
ohlcv:{symbol}:{timeframe}:latest_{limit}

예:
ohlcv:BTCUSDT:5m:latest_100
ohlcv:BTCUSDT:1h:latest_50
ohlcv:BTCUSDT:1d:latest_30
```

**TTL 전략**:
- 분봉: 60초 (1분)
- 시간봉: 300초 (5분)
- 일봉: 3600초 (1시간)

**캐시 워밍**:
- 전략 시작 시 필요한 모든 타임프레임 데이터 사전 로드
- 백그라운드 작업으로 주기적 갱신

---

## 📋 구현 우선순위

### 9.1 우선순위 매트릭스

| Phase | 작업 | 우선순위 | 예상 시간 | 의존성 |
|-------|------|----------|-----------|--------|
| 1 | 데이터 모델 확장 | 🔴 Critical | 1주 | 없음 |
| 2 | 데이터 조회 API | 🔴 Critical | 1주 | Phase 1 |
| 3 | Context Layer 통합 | 🔴 Critical | 1주 | Phase 2 |
| 4 | 전략 예제 작성 | 🟡 High | 1주 | Phase 3 |
| 5 | SDUI/API 업데이트 | 🟡 High | 1.5주 | Phase 4 |
| 6 | 백테스트/실시간 통합 | 🟢 Medium | 1.5주 | Phase 5 |

**총 예상 시간**: 7주

---

### 9.2 MVP (Minimum Viable Product) 범위

**Phase 1~4 완료 시 MVP 출시 가능**:
- ✅ 멀티 타임프레임 Config 정의
- ✅ 데이터 조회 API 동작
- ✅ Context에서 멀티 데이터 접근
- ✅ 2개 이상의 예제 전략 동작
- ⏳ 프론트엔드 UI (Phase 5)
- ⏳ 백테스트 완전 통합 (Phase 6)

**MVP 출시 후 점진적 개선**:
- Phase 5: 사용자 편의성 향상
- Phase 6: 검증 및 최적화

---

### 9.3 성공 지표 (KPI)

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| **멀티 TF 조회 속도** | < 50ms (캐시 히트) | 성능 테스트 |
| **메모리 사용량** | < 10MB/전략 | 프로파일링 |
| **백테스트 정확도** | 100% (실시간과 일치) | 통합 테스트 |
| **전략 작성 시간** | < 30분 (기존 전략 확장) | 개발자 피드백 |
| **API 응답 시간** | < 200ms (P95) | 모니터링 |

---

## 📚 참고 자료

### 10.1 관련 문서

- `docs/STRATEGY_DEVELOPMENT.md`: 전략 개발 가이드
- `docs/architecture.md`: 시스템 아키텍처
- `docs/api.md`: REST API 명세
- `crates/trader-core/src/types/timeframe.rs`: Timeframe enum 구현

### 10.2 외부 레퍼런스

- **TradingView Multi-Timeframe**: https://www.tradingview.com/support/solutions/43000481029
- **Binance Kline API**: https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
- **Backtrader Multi-Timeframe**: https://www.backtrader.com/docu/cerebro/

### 10.3 기술 스택

- **TimescaleDB Hypertable**: 시계열 데이터 최적화
- **Redis Pipelining**: 멀티키 조회 성능 향상
- **SQLx UNNEST**: 배치 INSERT 최적화

---

## 🎯 다음 단계

1. **팀 검토**: 이 문서를 팀과 공유하고 피드백 수렴
2. **Phase 1 착수**: 데이터 모델 확장 PR 생성
3. **성능 테스트 환경 구축**: 멀티 타임프레임 쿼리 벤치마크 작성
4. **문서 업데이트**: PRD, TODO에 Phase별 작업 항목 추가

---

**작성자**: ZeroQuant Development Team  
**마지막 검토**: 2026-02-02  
**다음 리뷰 예정**: Phase 1 완료 시
