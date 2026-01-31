# Trader Bot 모니터링 가이드

## 목차

1. [개요](#개요)
2. [헬스체크](#헬스체크)
3. [로깅](#로깅)
4. [알림 설정](#알림-설정)
5. [성능 모니터링](#성능-모니터링)

---

## 개요

### 모니터링 아키텍처

현재 시스템은 다음과 같은 모니터링 구성을 사용합니다:

```
┌─────────────────┐     ┌─────────────────┐
│  Trader API     │────▶│   Tracing       │
│  /health        │     │  (로그 수집)     │
└─────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────┐     ┌─────────────────┐
│  알림 서비스     │────▶│   Telegram      │
│  (Notification) │     │   Discord       │
└─────────────────┘     └─────────────────┘
```

### 주요 모니터링 포인트

| 영역 | 방법 | 설명 |
|------|------|------|
| API 상태 | 헬스체크 | `/health`, `/health/ready` |
| 애플리케이션 로그 | tracing | 구조화된 로그 |
| 거래 알림 | Telegram/Discord | 주문/체결 알림 |
| 데이터베이스 | pg_stat | PostgreSQL 통계 |
| Redis | INFO 명령 | 캐시 상태 |

---

## 헬스체크

### 기본 헬스체크

```bash
# Liveness 체크
curl http://localhost:3000/health
```

**응답:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-31T12:00:00Z"
}
```

### 상세 헬스체크

```bash
# Readiness 체크 (모든 컴포넌트 상태)
curl http://localhost:3000/health/ready
```

**응답:**
```json
{
  "status": "healthy",
  "components": {
    "database": { "status": "healthy", "latency_ms": 5 },
    "redis": { "status": "healthy", "latency_ms": 2 },
    "exchange": { "status": "healthy" }
  },
  "timestamp": "2026-01-31T12:00:00Z"
}
```

### 자동화된 헬스체크 스크립트

```bash
#!/bin/bash
# scripts/healthcheck.sh

ENDPOINT="http://localhost:3000/health/ready"
TIMEOUT=5

response=$(curl -s -w "\n%{http_code}" --max-time $TIMEOUT $ENDPOINT)
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)

if [ "$http_code" -eq 200 ]; then
    echo "✅ API healthy"
    exit 0
else
    echo "❌ API unhealthy (HTTP $http_code)"
    echo "$body"
    exit 1
fi
```

---

## 로깅

### 로그 레벨 설정

환경변수 `RUST_LOG`로 로그 레벨을 제어합니다:

```bash
# 기본 (프로덕션 권장)
RUST_LOG=info,trader_api=info

# 디버깅
RUST_LOG=debug,trader_api=debug

# 상세 추적
RUST_LOG=trace,trader_api=trace

# 특정 모듈만 상세 로깅
RUST_LOG=info,trader_strategy=debug,trader_exchange=debug
```

### 로그 확인

```bash
# API 서버 로그 (로컬 실행 시)
# 터미널에 직접 출력됨

# Docker로 실행 시
docker compose logs -f timescaledb
docker compose logs -f redis
```

### 로그 포맷

tracing 라이브러리를 사용하여 구조화된 로그를 생성합니다:

```
2026-01-31T12:00:00.123Z  INFO trader_api::routes::backtest: Backtest started strategy_id="rsi_mean_reversion" symbol="005930"
2026-01-31T12:00:01.456Z  INFO trader_api::routes::backtest: Backtest completed trades=15 total_return=2.5%
```

### 로그 파일 저장 (선택)

```bash
# 로그를 파일로 리다이렉트
cargo run --bin trader-api --release 2>&1 | tee -a logs/trader-api.log

# 날짜별 로그 파일
cargo run --bin trader-api --release 2>&1 | tee -a logs/trader-api-$(date +%Y%m%d).log
```

---

## 알림 설정

### Telegram 알림

모든 알림 설정은 웹 UI를 통해 관리됩니다. API 키는 AES-256-GCM으로 암호화되어 데이터베이스에 저장됩니다.

#### 1. 봇 생성

1. Telegram에서 @BotFather에게 `/newbot` 명령
2. 봇 이름과 username 설정
3. 발급된 API 토큰 복사

#### 2. Chat ID 확인

```bash
# 봇에게 메시지 전송 후
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
```

#### 3. UI에서 설정

1. 웹 대시보드 접속 → **Settings** 페이지
2. **Notifications** 섹션에서 Telegram 설정
3. Bot Token과 Chat ID 입력
4. "저장" 버튼 클릭 (자동 암호화 저장)

#### 4. 테스트

UI의 "테스트 메시지 전송" 버튼을 사용하거나:

```bash
curl -X POST http://localhost:3000/api/v1/notifications/telegram/test
```

### Discord 알림 (선택)

웹 UI의 Settings → Notifications 섹션에서 Discord 웹훅 URL을 설정할 수 있습니다.

### 알림 유형

| 이벤트 | 알림 | 설명 |
|--------|------|------|
| 주문 체결 | ✅ | 매수/매도 체결 시 |
| 손절/익절 | ✅ | SL/TP 발동 시 |
| 일일 손실 한도 | ✅ | 한도 도달 시 경고 |
| 전략 시작/중지 | ✅ | 상태 변경 시 |
| API 오류 | ✅ | 거래소 연결 실패 등 |

---

## 성능 모니터링

### 데이터베이스 모니터링

```bash
# PostgreSQL 연결 상태
docker compose exec timescaledb pg_isready -U trader

# 활성 쿼리 확인
docker compose exec timescaledb psql -U trader -d trader -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC
LIMIT 10;
"

# 테이블 크기
docker compose exec timescaledb psql -U trader -d trader -c "
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;
"

# TimescaleDB 청크 정보
docker compose exec timescaledb psql -U trader -d trader -c "
SELECT hypertable_name, chunk_name, range_start, range_end
FROM timescaledb_information.chunks
ORDER BY range_end DESC
LIMIT 10;
"
```

### Redis 모니터링

```bash
# Redis 상태 확인
docker compose exec redis redis-cli INFO

# 메모리 사용량
docker compose exec redis redis-cli INFO memory | grep used_memory_human

# 키 개수
docker compose exec redis redis-cli DBSIZE

# 연결 수
docker compose exec redis redis-cli INFO clients | grep connected_clients
```

### 시스템 리소스 모니터링

```bash
# Docker 컨테이너 리소스 사용량
docker stats --no-stream

# 디스크 사용량
df -h

# Docker 볼륨 사용량
docker system df -v
```

---

## 문제 진단 명령어

### 빠른 진단 스크립트

```bash
#!/bin/bash
# scripts/diagnose.sh

echo "=== System Status ==="
echo ""

echo "1. API Health:"
curl -s http://localhost:3000/health | jq . || echo "API not responding"
echo ""

echo "2. Docker Containers:"
docker compose ps
echo ""

echo "3. Database:"
docker compose exec -T timescaledb pg_isready -U trader
echo ""

echo "4. Redis:"
docker compose exec -T redis redis-cli ping
echo ""

echo "5. Disk Usage:"
df -h | head -5
echo ""

echo "6. Docker Stats:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

### 로그 필터링

```bash
# 에러만 확인
cargo run --bin trader-api 2>&1 | grep -i error

# 특정 전략 로그
cargo run --bin trader-api 2>&1 | grep "strategy_id=rsi"

# 주문 관련 로그
cargo run --bin trader-api 2>&1 | grep -E "order|trade|fill"
```

---

## 참고 문서

- [배포 가이드](./deployment.md)
- [운영 절차](./operations.md)
- [트러블슈팅](./troubleshooting.md)
