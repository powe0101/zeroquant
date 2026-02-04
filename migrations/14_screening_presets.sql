-- =====================================================
-- 14_screening_presets.sql
-- 스크리닝 프리셋 저장
-- =====================================================
--
-- 사용자 정의 스크리닝 필터 프리셋을 저장합니다.
--
-- =====================================================

-- =====================================================
-- SCREENING_PRESET TABLE
-- 사용자 정의 스크리닝 프리셋
-- =====================================================

CREATE TABLE IF NOT EXISTS screening_preset (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 프리셋 기본 정보
    name VARCHAR(100) NOT NULL,                       -- 프리셋 이름
    description TEXT,                                 -- 설명

    -- 필터 설정 (JSONB)
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,       -- ScreeningRequest 형식

    -- 기본 프리셋 여부 (삭제 불가)
    is_default BOOLEAN DEFAULT false,

    -- 정렬 순서
    sort_order INTEGER NOT NULL DEFAULT 0,

    -- 시스템 필드
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 유일 제약 (이름 중복 방지)
    CONSTRAINT unique_preset_name UNIQUE (name)
);

-- 인덱스
CREATE INDEX idx_screening_preset_sort ON screening_preset(sort_order, name);
CREATE INDEX idx_screening_preset_default ON screening_preset(is_default);

COMMENT ON TABLE screening_preset IS '스크리닝 프리셋 (Phase 3.3)';
COMMENT ON COLUMN screening_preset.name IS '프리셋 이름';
COMMENT ON COLUMN screening_preset.filters IS '필터 설정 JSON';
COMMENT ON COLUMN screening_preset.is_default IS '기본 프리셋 (삭제 불가)';

-- =====================================================
-- 기본 프리셋 마이그레이션
-- =====================================================

INSERT INTO screening_preset (name, description, filters, is_default, sort_order)
VALUES
    -- 가치주
    ('가치주', '저PER, 저PBR, 적정 ROE를 가진 저평가 종목',
     '{"max_per": "15", "max_pbr": "1.5", "min_roe": "5"}'::jsonb, true, 0),
    -- 고배당주
    ('고배당주', '배당수익률 3% 이상, 안정적인 수익성',
     '{"min_dividend_yield": "3", "min_roe": "5"}'::jsonb, true, 1),
    -- 성장주
    ('성장주', '매출/이익 20% 이상 성장, 높은 ROE',
     '{"min_revenue_growth": "20", "min_earnings_growth": "20", "min_roe": "10"}'::jsonb, true, 2),
    -- 스노우볼
    ('스노우볼', '저PBR + 고배당 + 낮은 부채비율의 안정 성장주',
     '{"max_pbr": "1.0", "min_dividend_yield": "2", "max_debt_ratio": "100"}'::jsonb, true, 3),
    -- 대형주
    ('대형주', '시가총액 10조원 이상 우량 대형주',
     '{"min_market_cap": "10000000000000"}'::jsonb, true, 4),
    -- 52주 신저가 근접
    ('52주 신저가 근접', '52주 저가 근처에서 거래되는 수익성 있는 종목',
     '{"max_distance_from_52w_high": "-30", "min_roe": "5"}'::jsonb, true, 5)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- schema_migrations 기록
-- =====================================================

INSERT INTO schema_migrations (version, filename, success, applied_at)
VALUES (14, '14_screening_presets.sql', true, NOW())
ON CONFLICT (version) DO NOTHING;
