# 인프라 환경 가이드

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
