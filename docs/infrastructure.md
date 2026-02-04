# 인프라 환경 가이드

> **버전**: v0.6.0 | **최종 업데이트**: 2026-02-04
>
> ⚠️ **PostgreSQL과 Redis는 Podman/Docker 컨테이너에서 실행됩니다.**
> 로컬 `psql` 또는 `redis-cli` 명령어를 직접 사용하지 마세요.

---

## 컨테이너 정보

| 서비스 | 컨테이너명 | 포트 | 이미지 |
|--------|------------|------|--------|
| PostgreSQL | `trader-timescaledb` | 5432 | timescale/timescaledb:latest-pg15 |
| Redis | `trader-redis` | 6379 | redis:7-alpine |

---

## 접속 정보

```bash
# 환경 변수 (.env)
DATABASE_URL=postgresql://trader:trader_secret@localhost:5432/trader
REDIS_URL=redis://localhost:6379
```

| 항목 | 값 |
|------|-----|
| DB 사용자 | `trader` |
| DB 비밀번호 | `trader_secret` |
| DB 이름 | `trader` |

---

## 인프라 명령어

```bash
# 인프라 시작/중지
podman compose up -d          # 시작
podman compose down           # 중지
podman compose logs -f        # 로그 확인

# PostgreSQL 접속 (컨테이너 내부)
podman exec -it trader-timescaledb psql -U trader -d trader

# Redis 접속 (컨테이너 내부)
podman exec -it trader-redis redis-cli

# 컨테이너 상태 확인
podman ps
```

---

## 자주 사용하는 DB 쿼리

```bash
# 컨테이너 내부에서 SQL 실행
podman exec -it trader-timescaledb psql -U trader -d trader -c "SELECT COUNT(*) FROM symbol_info;"

# 테이블 목록 확인
podman exec -it trader-timescaledb psql -U trader -d trader -c "\dt"

# 마이그레이션 상태 확인
podman exec -it trader-timescaledb psql -U trader -d trader -c "SELECT * FROM _sqlx_migrations ORDER BY installed_on DESC LIMIT 5;"
```

---

## ❌ 잘못된 사용 예시

```bash
# ❌ 로컬 psql 직접 사용 (설치되어 있지 않거나 연결 실패)
psql -U trader -d trader

# ❌ 로컬 redis-cli 직접 사용
redis-cli
```

## ✅ 올바른 사용 예시

```bash
# ✅ 컨테이너를 통한 접속
podman exec -it trader-timescaledb psql -U trader -d trader
podman exec -it trader-redis redis-cli
```

---

## 환경변수 설정 (v0.6.0)

### 기본 설정

```bash
# .env 파일 예시
DATABASE_URL=postgresql://trader:trader_secret@localhost:5432/trader
REDIS_URL=redis://localhost:6379
```

### 데이터 프로바이더 토글

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PROVIDER_KRX_API_ENABLED` | false | KRX OPEN API 활성화 (승인 필요) |
| `PROVIDER_YAHOO_ENABLED` | true | Yahoo Finance 활성화 |

### 심볼 동기화 설정

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `SYMBOL_SYNC_MIN_COUNT` | 100 | 이 수 이하면 자동 동기화 |
| `SYMBOL_SYNC_KRX` | true | KRX 종목 동기화 |
| `SYMBOL_SYNC_BINANCE` | true | Binance USDT 페어 동기화 |
| `SYMBOL_SYNC_YAHOO` | true | Yahoo Finance 주요 종목 동기화 |
| `SYMBOL_SYNC_YAHOO_MAX` | 500 | Yahoo 최대 수집 종목 수 |

### OHLCV 수집 설정

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `OHLCV_BATCH_SIZE` | 50 | 배치당 심볼 수 |
| `OHLCV_STALE_DAYS` | 1 | 갱신 기준 일수 |
| `OHLCV_REQUEST_DELAY_MS` | 500 | API 요청 간 딜레이 (ms) |

### 지표/Fundamental 설정

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `INDICATOR_BATCH_SIZE` | 100 | 배치당 심볼 수 |
| `INDICATOR_STALE_DAYS` | 1 | 갱신 기준 일수 |
| `INDICATOR_REQUEST_DELAY_MS` | 50 | 요청 간 딜레이 |
| `FUNDAMENTAL_COLLECT_ENABLED` | true | Fundamental 수집 활성화 |
| `FUNDAMENTAL_STALE_DAYS` | 7 | 갱신 기준 (일) |
| `FUNDAMENTAL_BATCH_SIZE` | 50 | 배치당 처리 심볼 수 |

### 데몬 모드 설정 (trader-collector)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DAEMON_INTERVAL_MINUTES` | 60 | 워크플로우 실행 주기 |

### 완전한 .env 예시

```bash
# 기본 연결
DATABASE_URL=postgresql://trader:trader_secret@localhost:5432/trader
REDIS_URL=redis://localhost:6379

# 데이터 프로바이더 토글
PROVIDER_KRX_API_ENABLED=false   # KRX API 승인 전까지 false
PROVIDER_YAHOO_ENABLED=true      # Yahoo Finance 활성화

# 심볼 동기화
SYMBOL_SYNC_MIN_COUNT=100
SYMBOL_SYNC_KRX=true
SYMBOL_SYNC_BINANCE=true
SYMBOL_SYNC_YAHOO=true
SYMBOL_SYNC_YAHOO_MAX=500

# OHLCV 수집
OHLCV_BATCH_SIZE=50
OHLCV_STALE_DAYS=1
OHLCV_REQUEST_DELAY_MS=500

# 지표 동기화
INDICATOR_BATCH_SIZE=100
INDICATOR_STALE_DAYS=1
INDICATOR_REQUEST_DELAY_MS=50

# 데몬 모드
DAEMON_INTERVAL_MINUTES=60

# 로깅
RUST_LOG=info
```

---

## 참고 문서

- [Collector 빠른 시작](./collector_quick_start.md) - Standalone Collector 가이드
- [아키텍처](./architecture.md) - 시스템 구조
- [API 문서](./api.md) - REST API 명세
