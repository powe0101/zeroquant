-- =====================================================
-- 심볼 데이터 수집 실패 추적 컬럼 추가
--
-- 목적: Yahoo Finance 등 외부 API에서 데이터 수집 실패 시 추적
-- 기능: 연속 실패 횟수 기록, N회 이상 실패 시 자동 비활성화
-- =====================================================

-- 실패 추적 컬럼 추가
ALTER TABLE symbol_info
ADD COLUMN IF NOT EXISTS fetch_fail_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_fetch_error TEXT,
ADD COLUMN IF NOT EXISTS last_fetch_attempt TIMESTAMPTZ;

-- 실패 횟수 기반 조회용 인덱스 (비활성화 후보 조회)
CREATE INDEX IF NOT EXISTS idx_symbol_info_fail_count
    ON symbol_info(fetch_fail_count DESC)
    WHERE is_active = true AND fetch_fail_count > 0;

-- 마지막 시도 시간 기반 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_symbol_info_last_attempt
    ON symbol_info(last_fetch_attempt DESC)
    WHERE is_active = true;

-- =====================================================
-- 실패 기록 함수
-- =====================================================

-- 심볼 데이터 수집 실패 기록 함수
CREATE OR REPLACE FUNCTION record_symbol_fetch_failure(
    p_symbol_info_id UUID,
    p_error_message TEXT,
    p_max_failures INTEGER DEFAULT 3
)
RETURNS BOOLEAN AS $$
DECLARE
    v_new_count INTEGER;
    v_deactivated BOOLEAN := FALSE;
BEGIN
    UPDATE symbol_info
    SET fetch_fail_count = fetch_fail_count + 1,
        last_fetch_error = p_error_message,
        last_fetch_attempt = NOW(),
        updated_at = NOW()
    WHERE id = p_symbol_info_id
    RETURNING fetch_fail_count INTO v_new_count;

    -- N회 이상 실패 시 자동 비활성화
    IF v_new_count >= p_max_failures THEN
        UPDATE symbol_info
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE id = p_symbol_info_id;
        v_deactivated := TRUE;
    END IF;

    RETURN v_deactivated;
END;
$$ LANGUAGE plpgsql;

-- 심볼 데이터 수집 성공 시 실패 카운트 초기화 함수
CREATE OR REPLACE FUNCTION reset_symbol_fetch_failure(
    p_symbol_info_id UUID
)
RETURNS void AS $$
BEGIN
    UPDATE symbol_info
    SET fetch_fail_count = 0,
        last_fetch_error = NULL,
        last_fetch_attempt = NOW(),
        updated_at = NOW()
    WHERE id = p_symbol_info_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 통계 조회 뷰
-- =====================================================

-- 실패 심볼 현황 뷰
CREATE OR REPLACE VIEW v_symbol_fetch_failures AS
SELECT
    si.id,
    si.ticker,
    si.name,
    si.market,
    si.exchange,
    si.yahoo_symbol,
    si.is_active,
    si.fetch_fail_count,
    si.last_fetch_error,
    si.last_fetch_attempt,
    CASE
        WHEN si.fetch_fail_count >= 3 THEN 'CRITICAL'
        WHEN si.fetch_fail_count >= 2 THEN 'WARNING'
        WHEN si.fetch_fail_count >= 1 THEN 'MINOR'
        ELSE 'OK'
    END AS failure_level
FROM symbol_info si
WHERE si.fetch_fail_count > 0
ORDER BY si.fetch_fail_count DESC, si.last_fetch_attempt DESC;

-- =====================================================
-- 코멘트
-- =====================================================

COMMENT ON COLUMN symbol_info.fetch_fail_count IS '연속 데이터 수집 실패 횟수';
COMMENT ON COLUMN symbol_info.last_fetch_error IS '마지막 수집 실패 오류 메시지';
COMMENT ON COLUMN symbol_info.last_fetch_attempt IS '마지막 데이터 수집 시도 시간';

COMMENT ON FUNCTION record_symbol_fetch_failure(UUID, TEXT, INTEGER) IS
'심볼 데이터 수집 실패 기록. max_failures 초과 시 자동 비활성화하고 TRUE 반환';

COMMENT ON FUNCTION reset_symbol_fetch_failure(UUID) IS
'심볼 데이터 수집 성공 시 실패 카운트 초기화';

COMMENT ON VIEW v_symbol_fetch_failures IS
'데이터 수집 실패 심볼 현황 뷰. 실패 횟수별 레벨 표시';
