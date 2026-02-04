-- 백테스트 결과에 타임프레임 설정 컬럼 추가
-- 다중 타임프레임 백테스트 시 사용된 설정을 저장

ALTER TABLE backtest_results
ADD COLUMN IF NOT EXISTS timeframes_used JSONB DEFAULT NULL;

COMMENT ON COLUMN backtest_results.timeframes_used IS '백테스트에 사용된 타임프레임 설정 (JSONB)';

-- 예시 데이터 형식:
-- {
--   "primary": "5m",
--   "secondary": [
--     {"timeframe": "1h", "candle_count": 24},
--     {"timeframe": "1d", "candle_count": 14}
--   ]
-- }
