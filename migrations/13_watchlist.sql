-- =====================================================
-- 13_watchlist.sql
-- 관심종목 관리 시스템
-- =====================================================
--
-- 포함 내용:
-- - watchlist: 관심종목 그룹 테이블
-- - watchlist_item: 관심종목 아이템 테이블
-- - 인덱스: 조회 최적화
--
-- =====================================================

-- =====================================================
-- WATCHLIST TABLE
-- 관심종목 그룹
-- =====================================================

CREATE TABLE IF NOT EXISTS watchlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 기본 정보
    name VARCHAR(100) NOT NULL,                      -- 그룹 이름 (예: "모멘텀 종목", "저평가 주")
    description TEXT,                                -- 설명

    -- 정렬 순서
    sort_order INTEGER NOT NULL DEFAULT 0,           -- 표시 순서

    -- 색상/아이콘 (UI용)
    color VARCHAR(20),                               -- 색상 코드 (#FF5733)
    icon VARCHAR(50),                                -- 아이콘 이름 (star, chart, etc)

    -- 시스템 필드
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 유일 제약 (이름 중복 방지)
    CONSTRAINT unique_watchlist_name UNIQUE (name)
);

-- 인덱스
CREATE INDEX idx_watchlist_sort ON watchlist(sort_order);

COMMENT ON TABLE watchlist IS '관심종목 그룹 (Phase 3.1)';
COMMENT ON COLUMN watchlist.name IS '그룹 이름';
COMMENT ON COLUMN watchlist.sort_order IS '표시 순서 (낮을수록 먼저)';

-- =====================================================
-- WATCHLIST_ITEM TABLE
-- 관심종목 아이템 (개별 종목)
-- =====================================================

CREATE TABLE IF NOT EXISTS watchlist_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 관계
    watchlist_id UUID NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,

    -- 종목 정보
    symbol VARCHAR(20) NOT NULL,                     -- 종목 코드 (005930, AAPL)
    market VARCHAR(20) NOT NULL DEFAULT 'KR',        -- 시장 (KR, US)

    -- 메모
    memo TEXT,                                       -- 사용자 메모

    -- 추가 정보
    target_price NUMERIC(20, 4),                     -- 목표가
    stop_price NUMERIC(20, 4),                       -- 손절가
    alert_enabled BOOLEAN DEFAULT false,             -- 알림 활성화

    -- 정렬 순서
    sort_order INTEGER NOT NULL DEFAULT 0,

    -- 추가 시점 가격 (비교용)
    added_price NUMERIC(20, 4),                      -- 추가 시점 가격

    -- 시스템 필드
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 유일 제약 (그룹 내 종목 중복 방지)
    CONSTRAINT unique_watchlist_symbol UNIQUE (watchlist_id, symbol, market)
);

-- 인덱스
CREATE INDEX idx_watchlist_item_watchlist ON watchlist_item(watchlist_id);
CREATE INDEX idx_watchlist_item_symbol ON watchlist_item(symbol, market);
CREATE INDEX idx_watchlist_item_sort ON watchlist_item(watchlist_id, sort_order);

COMMENT ON TABLE watchlist_item IS '관심종목 아이템 (Phase 3.1)';
COMMENT ON COLUMN watchlist_item.symbol IS '종목 코드';
COMMENT ON COLUMN watchlist_item.market IS '시장 (KR/US)';
COMMENT ON COLUMN watchlist_item.target_price IS '목표가';
COMMENT ON COLUMN watchlist_item.stop_price IS '손절가';
COMMENT ON COLUMN watchlist_item.added_price IS '추가 시점 가격';

-- =====================================================
-- 기본 관심종목 그룹 생성
-- =====================================================

INSERT INTO watchlist (name, description, sort_order, icon, color)
VALUES
    ('기본', '기본 관심종목 목록', 0, 'star', '#FFD700'),
    ('모멘텀', '모멘텀 상위 종목', 1, 'trending-up', '#10B981'),
    ('가치주', '저평가 가치 종목', 2, 'search', '#3B82F6')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- schema_migrations 기록
-- =====================================================

INSERT INTO schema_migrations (version, filename, success, applied_at)
VALUES (13, '13_watchlist.sql', true, NOW())
ON CONFLICT (version) DO NOTHING;
