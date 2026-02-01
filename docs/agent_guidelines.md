# AI 에이전트 구현 가이드라인

> **중요**: 코드 예시는 **참조용**입니다. 실제 구현 시 반드시 아래 가이드라인을 준수하세요.

---

## 🚨 핵심 원칙: 학습 데이터 의존 금지

AI 에이전트의 학습 데이터는 **과거 시점**의 정보입니다.
라이브러리 API는 지속적으로 변경되므로, **학습 데이터 기반 추측으로 코드를 작성하지 마세요**.

---

## ✅ 구현 전 필수 검증 절차

| 단계 | 작업 | 도구 |
|------|------|------|
| 1 | 대상 라이브러리의 현재 버전 확인 | `Cargo.toml`, `package.json` |
| 2 | 최신 API 문서 조회 | **Context7**, 공식 문서 |
| 3 | Breaking Changes 확인 | CHANGELOG, Migration Guide |
| 4 | 코드 예시 검증 | 공식 예제 저장소 |

---

## 📋 주요 라이브러리 검증 체크리스트

**Rust (Backend)**
- **Tokio**: select!, spawn, channel API 변경 빈번
- **Axum**: 0.6 → 0.7에서 Router, State API 대폭 변경됨
- **SQLx**: query!, query_as! 매크로 동작 변경 가능
- **Serde**: 안정적이나, derive 매크로 속성 확인 필요

**TypeScript/JavaScript (Frontend)**
- **SolidJS**: 1.x → 2.x 전환 시 reactivity 변경
- **Vite**: 설정 파일 구조 변경 빈번

---

## ❌ 금지 사항

1. **버전 미확인 코드 작성**
   - ❌ "tokio 1.x에서는 이렇게 합니다" (버전 미명시)
   - ✅ "tokio 1.35 기준으로 Context7에서 확인한 패턴입니다"

2. **Deprecated API 사용**
   - ❌ 학습 데이터에 있던 과거 API 사용
   - ✅ 현재 권장 API를 Context7/공식 문서에서 확인 후 사용

3. **추측 기반 import 경로**
   - ❌ `use tokio::something::Maybe;` (존재 여부 불확실)
   - ✅ 실제 코드베이스 또는 docs.rs에서 import 경로 확인

4. **Feature flag 미확인 사용**
   - ❌ tokio의 "full" feature에 포함되어 있을 것으로 가정
   - ✅ Cargo.toml의 features 섹션 확인 후 사용

5. **주석은 한글로 작성**
   - ✅ 모든 주석은 한글로 작성합니다
   - ✅ 이미 영문이라면 한글로 변경합니다

---

## 🔍 Context7 사용 가이드

```
# 구현 전 반드시 실행
1. resolve-library-id로 라이브러리 ID 획득
2. query-docs로 구체적인 API 패턴 조회

# 예시 쿼리
- "tokio select graceful shutdown pattern"
- "axum 0.7 HandleErrorLayer timeout middleware"
- "sqlx transaction rollback on error"
- "solidjs createStore nested update"
```

---

## 📝 코드 작성 시 주석 규칙

```rust
// API 검증: Context7 조회 (2026-01-31)
// Tokio 1.35, Axum 0.7.4 기준
// 참조: https://docs.rs/tokio/latest/tokio/macro.select.html
tokio::select! {
    // ...
}
```

```typescript
// API 검증: Context7 조회 (2026-01-31)
// SolidJS 1.8 기준
// 참조: https://docs.solidjs.com/concepts/stores
const [state, setState] = createStore({ ... });
```

---

## ⚡ 빠른 검증 명령어

```bash
# Rust 의존성 버전 확인
cargo tree -p tokio
cargo tree -p axum
cargo tree -p sqlx

# Node.js 의존성 버전 확인
npm ls solid-js
npm ls vite

# Rust 문서 로컬 생성 (오프라인 참조)
cargo doc --open --no-deps
```
