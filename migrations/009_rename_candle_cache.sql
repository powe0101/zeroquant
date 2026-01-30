-- Rename Yahoo-specific table names to standard OHLCV names
-- 데이터 소스가 Yahoo 뿐만 아니라 KRX 등 여러 곳에서 오므로 표준 금융 용어로 변경
-- OHLCV = Open, High, Low, Close, Volume

-- =====================================================
-- RENAME TABLES
-- =====================================================

-- 기존 트리거 삭제 (테이블 이름 변경 전)
DROP TRIGGER IF EXISTS trigger_update_ohlcv_metadata ON ohlcv;

-- 테이블 이름 변경
ALTER TABLE ohlcv RENAME TO ohlcv;
ALTER TABLE ohlcv_metadata RENAME TO ohlcv_metadata;

-- 인덱스 이름 변경
ALTER INDEX idx_ohlcv_symbol_tf_time RENAME TO idx_ohlcv_symbol_tf_time;
ALTER INDEX idx_ohlcv_last_fetch RENAME TO idx_ohlcv_last_fetch;

-- =====================================================
-- UPDATE COMPRESSION POLICY (TimescaleDB)
-- =====================================================

-- 기존 압축 정책 제거 후 재생성 (테이블 이름 변경 시 정책도 자동 유지되지만 명시적으로 확인)
-- SELECT remove_compression_policy('ohlcv', if_exists => TRUE);
-- SELECT add_compression_policy('ohlcv', INTERVAL '30 days', if_not_exists => TRUE);

-- =====================================================
-- UPDATE TRIGGER FUNCTION
-- =====================================================

-- 트리거 함수 재생성 (새 테이블 이름 참조)
CREATE OR REPLACE FUNCTION update_ohlcv_metadata()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO ohlcv_metadata (symbol, timeframe, first_cached_time, last_cached_time, total_candles)
    VALUES (NEW.symbol, NEW.timeframe, NEW.open_time, NEW.open_time, 1)
    ON CONFLICT (symbol, timeframe) DO UPDATE SET
        first_cached_time = LEAST(ohlcv_metadata.first_cached_time, NEW.open_time),
        last_cached_time = GREATEST(ohlcv_metadata.last_cached_time, NEW.open_time),
        last_updated_at = NOW(),
        total_candles = (
            SELECT COUNT(*) FROM ohlcv
            WHERE symbol = NEW.symbol AND timeframe = NEW.timeframe
        );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 새 트리거 생성
CREATE TRIGGER trigger_update_ohlcv_metadata
    AFTER INSERT ON ohlcv
    FOR EACH ROW
    EXECUTE FUNCTION update_ohlcv_metadata();

-- 기존 트리거 함수 삭제
DROP FUNCTION IF EXISTS update_ohlcv_metadata();

-- =====================================================
-- UPDATE HELPER FUNCTIONS
-- =====================================================

-- 갭 확인 함수 재생성
CREATE OR REPLACE FUNCTION get_ohlcv_gaps(
    p_symbol VARCHAR(50),
    p_timeframe VARCHAR(10),
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    gap_start TIMESTAMPTZ,
    gap_end TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        open_time AS gap_start,
        LEAD(open_time) OVER (ORDER BY open_time) AS gap_end
    FROM ohlcv
    WHERE symbol = p_symbol
      AND timeframe = p_timeframe
      AND open_time BETWEEN p_start_time AND p_end_time
    ORDER BY open_time;
END;
$$ LANGUAGE plpgsql;

-- 캐시 통계 조회 함수 재생성
CREATE OR REPLACE FUNCTION get_ohlcv_stats()
RETURNS TABLE (
    symbol VARCHAR(50),
    timeframe VARCHAR(10),
    first_time TIMESTAMPTZ,
    last_time TIMESTAMPTZ,
    candle_count BIGINT,
    last_updated TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.symbol,
        m.timeframe,
        m.first_cached_time,
        m.last_cached_time,
        m.total_candles::BIGINT,
        m.last_updated_at
    FROM ohlcv_metadata m
    ORDER BY m.last_updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- 기존 함수 삭제
DROP FUNCTION IF EXISTS get_ohlcv_gaps(VARCHAR, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS get_ohlcv_stats();

-- =====================================================
-- UPDATE COMMENTS
-- =====================================================

COMMENT ON TABLE ohlcv IS
'OHLCV(Open-High-Low-Close-Volume) 캔들 데이터. 다양한 데이터 소스(Yahoo Finance, KRX 등)에서 통합 관리.';

COMMENT ON TABLE ohlcv_metadata IS
'심볼/타임프레임별 OHLCV 데이터 메타정보. 증분 업데이트 및 캐시 상태 관리용.';

COMMENT ON COLUMN ohlcv.symbol IS
'종목 심볼 (예: AAPL, 005930.KS, SPY, BTC-USD)';

COMMENT ON COLUMN ohlcv.timeframe IS
'시간 간격: 1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo';

COMMENT ON COLUMN ohlcv.open_time IS
'캔들 시작 시간 (UTC)';

COMMENT ON COLUMN ohlcv.open IS
'시가 (Opening price)';

COMMENT ON COLUMN ohlcv.high IS
'고가 (Highest price)';

COMMENT ON COLUMN ohlcv.low IS
'저가 (Lowest price)';

COMMENT ON COLUMN ohlcv.close IS
'종가 (Closing price)';

COMMENT ON COLUMN ohlcv.volume IS
'거래량 (Trading volume)';
