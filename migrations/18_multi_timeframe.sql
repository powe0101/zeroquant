-- =====================================================
-- 18_multi_timeframe.sql
-- 다중 타임프레임 전략 지원
-- =====================================================
--
-- 목적: 전략이 여러 타임프레임의 데이터를 동시에 활용할 수 있도록
--       스키마를 확장합니다.
--
-- 포함 내용:
-- - strategies 테이블에 multi_timeframe_config 컬럼 추가
-- - 다중 타임프레임 전략 조회용 뷰
-- - 백테스트 결과에 사용된 타임프레임 기록
--
-- =====================================================

-- =====================================================
-- STRATEGIES TABLE 확장
-- =====================================================

-- multi_timeframe_config: 다중 타임프레임 설정 (JSONB)
-- 구조 예시:
-- {
--   "primary": "5m",
--   "secondary": [
--     {"timeframe": "1h", "candle_count": 24},
--     {"timeframe": "1d", "candle_count": 14}
--   ]
-- }
ALTER TABLE strategies
ADD COLUMN IF NOT EXISTS multi_timeframe_config JSONB DEFAULT NULL;

-- 인덱스: 다중 타임프레임 전략 필터링용
CREATE INDEX IF NOT EXISTS idx_strategies_multi_tf
ON strategies ((multi_timeframe_config IS NOT NULL))
WHERE multi_timeframe_config IS NOT NULL;

-- GIN 인덱스: JSONB 내부 검색용
CREATE INDEX IF NOT EXISTS idx_strategies_multi_tf_gin
ON strategies USING GIN (multi_timeframe_config)
WHERE multi_timeframe_config IS NOT NULL;

COMMENT ON COLUMN strategies.multi_timeframe_config IS '다중 타임프레임 설정 (JSONB): primary TF와 secondary TF 목록';

-- =====================================================
-- BACKTEST_RESULTS TABLE 확장
-- =====================================================

-- 백테스트에 사용된 타임프레임 설정 기록
ALTER TABLE backtest_results
ADD COLUMN IF NOT EXISTS timeframes_used JSONB DEFAULT NULL;

COMMENT ON COLUMN backtest_results.timeframes_used IS '백테스트에 사용된 타임프레임 설정 (JSONB)';

-- =====================================================
-- 다중 타임프레임 전략 조회 뷰
-- =====================================================

CREATE OR REPLACE VIEW v_multi_timeframe_strategies AS
SELECT
    s.id,
    s.name,
    s.strategy_type,
    s.timeframe AS primary_timeframe,
    s.multi_timeframe_config,
    -- Primary TF 추출
    s.multi_timeframe_config->>'primary' AS config_primary,
    -- Secondary TF 개수
    COALESCE(jsonb_array_length(s.multi_timeframe_config->'secondary'), 0) AS secondary_count,
    -- 모든 TF 배열 (primary + secondary)
    CASE
        WHEN s.multi_timeframe_config IS NOT NULL THEN
            jsonb_build_array(s.multi_timeframe_config->>'primary') ||
            COALESCE(
                (SELECT jsonb_agg(elem->>'timeframe')
                 FROM jsonb_array_elements(s.multi_timeframe_config->'secondary') AS elem),
                '[]'::jsonb
            )
        ELSE
            jsonb_build_array(s.timeframe)
    END AS all_timeframes,
    s.market,
    s.symbols,
    s.is_active,
    s.created_at,
    s.updated_at
FROM strategies s
WHERE s.multi_timeframe_config IS NOT NULL
ORDER BY s.updated_at DESC;

COMMENT ON VIEW v_multi_timeframe_strategies IS '다중 타임프레임 설정이 있는 전략만 조회하는 뷰';

-- =====================================================
-- 유틸리티 함수: 타임프레임 크기 비교
-- =====================================================

-- 타임프레임을 초 단위로 변환하는 함수
CREATE OR REPLACE FUNCTION timeframe_to_seconds(tf VARCHAR)
RETURNS INTEGER AS $$
BEGIN
    RETURN CASE tf
        WHEN '1m' THEN 60
        WHEN '3m' THEN 180
        WHEN '5m' THEN 300
        WHEN '15m' THEN 900
        WHEN '30m' THEN 1800
        WHEN '1h' THEN 3600
        WHEN '2h' THEN 7200
        WHEN '4h' THEN 14400
        WHEN '6h' THEN 21600
        WHEN '8h' THEN 28800
        WHEN '12h' THEN 43200
        WHEN '1d' THEN 86400
        WHEN '3d' THEN 259200
        WHEN '1w' THEN 604800
        WHEN '1M' THEN 2592000  -- 30일 기준
        ELSE 0
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION timeframe_to_seconds(VARCHAR) IS '타임프레임 문자열을 초 단위로 변환';

-- Secondary가 Primary보다 큰지 검증하는 함수
CREATE OR REPLACE FUNCTION validate_multi_timeframe_config(config JSONB)
RETURNS BOOLEAN AS $$
DECLARE
    primary_seconds INTEGER;
    secondary_record RECORD;
BEGIN
    IF config IS NULL THEN
        RETURN TRUE;  -- NULL은 단일 TF 전략
    END IF;

    -- Primary TF 크기
    primary_seconds := timeframe_to_seconds(config->>'primary');

    IF primary_seconds = 0 THEN
        RETURN FALSE;  -- 유효하지 않은 Primary TF
    END IF;

    -- Secondary TF 검증
    FOR secondary_record IN
        SELECT elem->>'timeframe' AS tf
        FROM jsonb_array_elements(config->'secondary') AS elem
    LOOP
        IF timeframe_to_seconds(secondary_record.tf) <= primary_seconds THEN
            RETURN FALSE;  -- Secondary는 Primary보다 커야 함
        END IF;
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION validate_multi_timeframe_config(JSONB) IS '다중 타임프레임 설정 유효성 검증 (Secondary > Primary)';

-- =====================================================
-- 제약조건: 타임프레임 설정 유효성 검증
-- =====================================================

-- CHECK 제약조건 추가
ALTER TABLE strategies
ADD CONSTRAINT chk_multi_timeframe_valid
CHECK (validate_multi_timeframe_config(multi_timeframe_config));

-- =====================================================
-- 사용 예시
-- =====================================================
--
-- 1. 다중 타임프레임 전략 생성:
--    INSERT INTO strategies (name, strategy_type, timeframe, multi_timeframe_config)
--    VALUES (
--        'RSI Multi TF',
--        'rsi_multi_tf',
--        '5m',
--        '{
--            "primary": "5m",
--            "secondary": [
--                {"timeframe": "1h", "candle_count": 24},
--                {"timeframe": "1d", "candle_count": 14}
--            ]
--        }'::jsonb
--    );
--
-- 2. 다중 TF 전략만 조회:
--    SELECT * FROM v_multi_timeframe_strategies WHERE is_active = true;
--
-- 3. 특정 Secondary TF를 사용하는 전략 검색:
--    SELECT * FROM strategies
--    WHERE multi_timeframe_config->'secondary' @> '[{"timeframe": "1d"}]'::jsonb;
--
-- 4. 타임프레임 유효성 검증:
--    SELECT validate_multi_timeframe_config('{"primary": "5m", "secondary": [{"timeframe": "1h"}]}'::jsonb);
--    -- TRUE 반환 (1h > 5m)
--
--    SELECT validate_multi_timeframe_config('{"primary": "1d", "secondary": [{"timeframe": "1h"}]}'::jsonb);
--    -- FALSE 반환 (1h < 1d, 잘못된 설정)
--
-- =====================================================
