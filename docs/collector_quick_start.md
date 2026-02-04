# Standalone Collector 가이드

> **버전**: v0.6.0 | **최종 업데이트**: 2026-02-04
>
> API 서버와 독립적으로 데이터를 수집하는 `trader-collector` crate 사용 가이드

---

## 📋 개요

`trader-collector`는 ZeroQuant의 Standalone 데이터 수집 바이너리입니다.

### 주요 기능
- **심볼 동기화**: KRX, Binance, Yahoo Finance에서 종목 목록 동기화
- **OHLCV 수집**: 일봉 데이터 수집 (KRX API / Yahoo Finance)
- **지표 동기화**: RouteState, MarketRegime, TTM Squeeze 등 분석 지표
- **GlobalScore 동기화**: 7Factor 기반 종합 점수 계산
- **KRX Fundamental**: PER/PBR/배당수익률/섹터 정보 (KRX API 활성화 시)

### 데이터 프로바이더 이중화
| 시장 | Primary | Fallback |
|------|---------|----------|
| 국내 주식 (KR) | KRX OPEN API | Yahoo Finance |
| 해외 주식 (US) | Yahoo Finance | - |
| 암호화폐 (CRYPTO) | Yahoo Finance | - |

---

## 🚀 빠른 시작

### 1. 환경변수 설정

```bash
# .env 파일
DATABASE_URL=postgresql://trader:trader_secret@localhost:5432/trader

# 데이터 프로바이더 토글
PROVIDER_KRX_API_ENABLED=false   # KRX API 승인 전까지 false
PROVIDER_YAHOO_ENABLED=true      # Yahoo Finance 활성화

# 심볼 동기화 설정
SYMBOL_SYNC_MIN_COUNT=100        # 이 수 이하면 자동 동기화
SYMBOL_SYNC_KRX=true             # KRX 종목 동기화
SYMBOL_SYNC_BINANCE=true         # Binance USDT 페어 동기화
SYMBOL_SYNC_YAHOO=true           # Yahoo Finance 주요 종목 동기화
SYMBOL_SYNC_YAHOO_MAX=500        # Yahoo 최대 수집 종목 수

# OHLCV 수집 설정
OHLCV_BATCH_SIZE=50              # 배치당 심볼 수
OHLCV_STALE_DAYS=1               # 갱신 기준 일수
OHLCV_REQUEST_DELAY_MS=500       # API 요청 간 딜레이

# 지표/Fundamental 설정
INDICATOR_BATCH_SIZE=100
INDICATOR_STALE_DAYS=1
INDICATOR_REQUEST_DELAY_MS=50

# 데몬 모드 설정
DAEMON_INTERVAL_MINUTES=60       # 워크플로우 실행 주기
```

### 2. 빌드

```bash
cargo build --release --bin trader-collector
```

### 3. 실행

```bash
# 전체 워크플로우 1회 실행
./target/release/trader-collector run-all

# 데몬 모드 (주기적 자동 실행)
./target/release/trader-collector daemon
```

---

## 📖 CLI 명령어

### 개별 명령어

```bash
# 심볼 정보 동기화 (KRX, Binance, Yahoo)
trader-collector sync-symbols

# OHLCV 데이터 수집
trader-collector collect-ohlcv
trader-collector collect-ohlcv --symbols "005930,000660"  # 특정 심볼만
trader-collector collect-ohlcv --stale-hours 24           # 24시간 이상 지난 것만

# 분석 지표 동기화 (RouteState, MarketRegime, TTM Squeeze)
trader-collector sync-indicators
trader-collector sync-indicators --symbols "005930,000660"

# GlobalScore 동기화 (7Factor 랭킹)
trader-collector sync-global-scores
trader-collector sync-global-scores --symbols "005930,000660"

# KRX Fundamental 동기화 (KRX API 활성화 필요)
trader-collector sync-krx-fundamentals
```

### 전체 워크플로우

```bash
# 1회 실행 (심볼 → OHLCV → 지표 → GlobalScore)
trader-collector run-all

# 데몬 모드 (DAEMON_INTERVAL_MINUTES 주기로 반복)
trader-collector daemon
```

### 옵션

```bash
# 로그 레벨 설정
trader-collector --log-level debug run-all
trader-collector --log-level trace sync-symbols
```

---

## 🔧 워크플로우 상세

### run-all 실행 순서

```
Step 1/5: 심볼 동기화
  └── KRX/Binance/Yahoo에서 종목 목록 가져오기
  └── symbol_info 테이블 업데이트

Step 2/5: KRX Fundamental 동기화 (KRX API 활성화 시)
  └── PER, PBR, 배당수익률, 시가총액
  └── 섹터/업종 정보

Step 3/5: OHLCV 수집
  └── 일봉 데이터 수집 (Yahoo Finance)
  └── ohlcv_daily 테이블 저장

Step 4/5: 분석 지표 동기화
  └── RouteState, MarketRegime 계산
  └── TTM Squeeze, Trigger 감지
  └── symbol_indicator 테이블 저장

Step 5/5: GlobalScore 동기화
  └── 7Factor 점수 계산
  └── 종합 랭킹 생성
  └── global_score 테이블 저장
```

---

## 📊 예상 성능

| 작업 | 예상 시간 | 비고 |
|------|----------|------|
| 심볼 동기화 | ~1분 | KRX 2,500개 + Binance 300개 + Yahoo 500개 |
| OHLCV 수집 (전체) | ~1.5시간 | 3,000개 종목, 500ms 딜레이 |
| OHLCV 수집 (증분) | ~5분 | stale 종목만 |
| 지표 동기화 | ~10분 | 3,000개 종목 |
| GlobalScore 동기화 | ~5분 | 3,000개 종목 |
| **전체 워크플로우** | **~2시간** | 첫 실행 시 |

---

## 🐳 운영 환경 설정

### Cron 스케줄 예시

```cron
# 매일 오전 7시 전체 워크플로우 실행
0 7 * * * cd /path/to/trader && ./target/release/trader-collector run-all >> /var/log/collector.log 2>&1

# 1시간마다 증분 OHLCV 수집
0 * * * * cd /path/to/trader && ./target/release/trader-collector collect-ohlcv --stale-hours 2 >> /var/log/collector.log 2>&1
```

### systemd 서비스 예시

```ini
# /etc/systemd/system/trader-collector.service
[Unit]
Description=ZeroQuant Data Collector
After=network.target postgresql.service

[Service]
Type=simple
User=trader
WorkingDirectory=/opt/zeroquant
ExecStart=/opt/zeroquant/target/release/trader-collector daemon
Restart=always
RestartSec=10
Environment=DATABASE_URL=postgresql://trader:secret@localhost:5432/trader
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
```

---

## 🔍 트러블슈팅

### KRX API 401 Unauthorized

```
KRX API가 비활성화되어 있습니다.
PROVIDER_KRX_API_ENABLED=true로 활성화하세요.
```

**원인**: KRX OPEN API 사용 권한이 없음
**해결**:
1. https://openapi.krx.co.kr 에서 API 사용 신청
2. 승인 후 `PROVIDER_KRX_API_ENABLED=true` 설정
3. 승인 전까지는 Yahoo Finance로 대체 운영

### CRYPTO 심볼 수집 실패

```
Yahoo Finance 심볼이 설정되지 않음: BTCUSDT
```

**원인**: yahoo_symbol 컬럼이 없는 CRYPTO 종목
**해결**: 해당 종목은 자동으로 비활성화됨. 정상 동작.

### DB 연결 실패

```bash
# Podman 컨테이너 상태 확인
podman ps | grep timescaledb

# 로그 확인
podman logs trader-timescaledb
```

---

## 📚 참고 문서

- [아키텍처](./architecture.md) - 데이터 프로바이더 이중화 구조
- [KRX API 스펙](./krx_openapi_spec.md) - KRX OPEN API 명세
- [인프라 가이드](./infrastructure.md) - Podman 컨테이너 설정

---

## ✅ 체크리스트

**개발 전 확인:**
- [ ] Podman 컨테이너 (PostgreSQL) 실행 중
- [ ] `.env` 파일 설정 완료
- [ ] `PROVIDER_*` 환경변수 확인

**운영 전 확인:**
- [ ] 로그 레벨 설정 (info 권장)
- [ ] Cron/systemd 스케줄 설정
- [ ] 디스크 공간 확인 (OHLCV 데이터)
- [ ] 모니터링 알림 설정
