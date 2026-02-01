-- =====================================================
-- 최신 가격 Materialized View
--
-- 목적: 스크리닝 쿼리 성능 최적화
-- 문제: DISTINCT ON 쿼리가 전체 ohlcv 테이블 스캔 (1.5초+)
-- 해결: 심볼별 최신 가격을 미리 계산하여 저장
-- =====================================================

-- 일봉 기준 심볼별 최신 가격 정보
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_latest_prices AS
SELECT DISTINCT ON (symbol)
    symbol,
    open_time,
    open,
    high,
    low,
    close,
    volume
FROM ohlcv
WHERE timeframe = '1d'
ORDER BY symbol, open_time DESC
WITH DATA;

-- 고유 인덱스 (REFRESH CONCURRENTLY 필수)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_latest_prices_symbol
    ON mv_latest_prices(symbol);

-- 가격 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_mv_latest_prices_close
    ON mv_latest_prices(close);

-- 시간 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_mv_latest_prices_time
    ON mv_latest_prices(open_time DESC);

-- =====================================================
-- 자동 갱신 함수
-- =====================================================

-- Materialized View 갱신 함수
CREATE OR REPLACE FUNCTION refresh_latest_prices()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_latest_prices;
END;
$$ LANGUAGE plpgsql;

-- 코멘트
COMMENT ON MATERIALIZED VIEW mv_latest_prices IS
'심볼별 최신 일봉 가격. 스크리닝 쿼리 성능 최적화용. REFRESH MATERIALIZED VIEW CONCURRENTLY로 갱신.';

COMMENT ON FUNCTION refresh_latest_prices() IS
'mv_latest_prices 뷰 갱신. 새 데이터 입력 후 호출하거나 스케줄러로 주기적 실행.';

-- =====================================================
-- 사용 예시
-- =====================================================
--
-- 스크리닝 쿼리에서 기존:
--   WITH price_data AS (
--       SELECT DISTINCT ON (symbol) symbol, close as current_price
--       FROM ohlcv WHERE timeframe = '1d'
--       ORDER BY symbol, open_time DESC
--   )
--
-- 변경 후:
--   SELECT symbol, close as current_price FROM mv_latest_prices
--
-- 갱신 (트레이딩 시간 종료 후 또는 새 데이터 입력 시):
--   SELECT refresh_latest_prices();
--   -- 또는
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_latest_prices;
-- =====================================================
