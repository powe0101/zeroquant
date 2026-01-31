-- ==========================================
-- 018: 매매일지 기간별 손익 뷰 추가
-- ==========================================
-- 주별, 월별, 연도별 손익 집계 뷰를 추가합니다.
-- v_daily_pnl을 기반으로 집계합니다.

-- 1. 주별 손익 집계 뷰
CREATE OR REPLACE VIEW v_weekly_pnl AS
SELECT
    ec.credential_id,
    DATE_TRUNC('week', ec.executed_at AT TIME ZONE 'Asia/Seoul')::date AS week_start,
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE ec.side = 'buy') AS buy_count,
    COUNT(*) FILTER (WHERE ec.side = 'sell') AS sell_count,
    COALESCE(SUM(ec.amount), 0) AS total_volume,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COALESCE(SUM(te.realized_pnl), 0) AS realized_pnl,
    COUNT(DISTINCT ec.symbol) AS symbol_count,
    COUNT(DISTINCT DATE(ec.executed_at AT TIME ZONE 'Asia/Seoul')) AS trading_days
FROM execution_cache ec
LEFT JOIN trade_executions te ON
    te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id, DATE_TRUNC('week', ec.executed_at AT TIME ZONE 'Asia/Seoul');

COMMENT ON VIEW v_weekly_pnl IS '주별 손익 집계 뷰';

-- 2. 월별 손익 집계 뷰
CREATE OR REPLACE VIEW v_monthly_pnl AS
SELECT
    ec.credential_id,
    EXTRACT(YEAR FROM ec.executed_at AT TIME ZONE 'Asia/Seoul')::int AS year,
    EXTRACT(MONTH FROM ec.executed_at AT TIME ZONE 'Asia/Seoul')::int AS month,
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE ec.side = 'buy') AS buy_count,
    COUNT(*) FILTER (WHERE ec.side = 'sell') AS sell_count,
    COALESCE(SUM(ec.amount), 0) AS total_volume,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COALESCE(SUM(te.realized_pnl), 0) AS realized_pnl,
    COUNT(DISTINCT ec.symbol) AS symbol_count,
    COUNT(DISTINCT DATE(ec.executed_at AT TIME ZONE 'Asia/Seoul')) AS trading_days
FROM execution_cache ec
LEFT JOIN trade_executions te ON
    te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id,
         EXTRACT(YEAR FROM ec.executed_at AT TIME ZONE 'Asia/Seoul'),
         EXTRACT(MONTH FROM ec.executed_at AT TIME ZONE 'Asia/Seoul');

COMMENT ON VIEW v_monthly_pnl IS '월별 손익 집계 뷰';

-- 3. 연도별 손익 집계 뷰
CREATE OR REPLACE VIEW v_yearly_pnl AS
SELECT
    ec.credential_id,
    EXTRACT(YEAR FROM ec.executed_at AT TIME ZONE 'Asia/Seoul')::int AS year,
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE ec.side = 'buy') AS buy_count,
    COUNT(*) FILTER (WHERE ec.side = 'sell') AS sell_count,
    COALESCE(SUM(ec.amount), 0) AS total_volume,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COALESCE(SUM(te.realized_pnl), 0) AS realized_pnl,
    COUNT(DISTINCT ec.symbol) AS symbol_count,
    COUNT(DISTINCT DATE(ec.executed_at AT TIME ZONE 'Asia/Seoul')) AS trading_days,
    COUNT(DISTINCT EXTRACT(MONTH FROM ec.executed_at AT TIME ZONE 'Asia/Seoul')) AS trading_months
FROM execution_cache ec
LEFT JOIN trade_executions te ON
    te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id, EXTRACT(YEAR FROM ec.executed_at AT TIME ZONE 'Asia/Seoul');

COMMENT ON VIEW v_yearly_pnl IS '연도별 손익 집계 뷰';

-- 4. 누적 손익 뷰 (일별 누적)
CREATE OR REPLACE VIEW v_cumulative_pnl AS
SELECT
    credential_id,
    trade_date,
    total_trades,
    realized_pnl,
    total_fees,
    SUM(realized_pnl) OVER (PARTITION BY credential_id ORDER BY trade_date) AS cumulative_pnl,
    SUM(total_fees) OVER (PARTITION BY credential_id ORDER BY trade_date) AS cumulative_fees,
    SUM(total_trades) OVER (PARTITION BY credential_id ORDER BY trade_date) AS cumulative_trades
FROM v_daily_pnl
ORDER BY credential_id, trade_date;

COMMENT ON VIEW v_cumulative_pnl IS '일별 누적 손익 뷰';

-- 5. 투자 인사이트 통계 뷰
CREATE OR REPLACE VIEW v_trading_insights AS
SELECT
    ec.credential_id,
    -- 총 거래 통계
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE ec.side = 'buy') AS buy_trades,
    COUNT(*) FILTER (WHERE ec.side = 'sell') AS sell_trades,
    COUNT(DISTINCT ec.symbol) AS unique_symbols,

    -- 손익 통계
    COALESCE(SUM(te.realized_pnl), 0) AS total_realized_pnl,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COUNT(*) FILTER (WHERE te.realized_pnl > 0) AS winning_trades,
    COUNT(*) FILTER (WHERE te.realized_pnl < 0) AS losing_trades,

    -- 승률
    CASE
        WHEN COUNT(*) FILTER (WHERE te.realized_pnl IS NOT NULL) > 0
        THEN ROUND(
            COUNT(*) FILTER (WHERE te.realized_pnl > 0)::numeric * 100 /
            NULLIF(COUNT(*) FILTER (WHERE te.realized_pnl IS NOT NULL), 0),
            2
        )
        ELSE 0
    END AS win_rate_pct,

    -- 평균 승/패
    COALESCE(AVG(te.realized_pnl) FILTER (WHERE te.realized_pnl > 0), 0) AS avg_win,
    COALESCE(ABS(AVG(te.realized_pnl) FILTER (WHERE te.realized_pnl < 0)), 0) AS avg_loss,

    -- 손익비 (Profit Factor)
    CASE
        WHEN COALESCE(ABS(SUM(te.realized_pnl) FILTER (WHERE te.realized_pnl < 0)), 0) > 0
        THEN ROUND(
            COALESCE(SUM(te.realized_pnl) FILTER (WHERE te.realized_pnl > 0), 0)::numeric /
            ABS(COALESCE(SUM(te.realized_pnl) FILTER (WHERE te.realized_pnl < 0), 1)),
            2
        )
        ELSE NULL
    END AS profit_factor,

    -- 거래 기간 (일)
    EXTRACT(DAY FROM MAX(ec.executed_at) - MIN(ec.executed_at))::int AS trading_period_days,

    -- 거래 빈도
    COUNT(DISTINCT DATE(ec.executed_at AT TIME ZONE 'Asia/Seoul')) AS active_trading_days,

    -- 최대 손익
    MAX(te.realized_pnl) AS largest_win,
    MIN(te.realized_pnl) AS largest_loss,

    -- 거래 기간
    MIN(ec.executed_at) AS first_trade_at,
    MAX(ec.executed_at) AS last_trade_at

FROM execution_cache ec
LEFT JOIN trade_executions te ON
    te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id;

COMMENT ON VIEW v_trading_insights IS '투자 인사이트 통계 뷰';

-- 6. 전략별 성과 분석 뷰
CREATE OR REPLACE VIEW v_strategy_performance AS
SELECT
    ec.credential_id,
    COALESCE(te.strategy_id, 'manual') AS strategy_id,
    COALESCE(te.strategy_name, '수동 거래') AS strategy_name,

    -- 거래 통계
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE ec.side = 'buy') AS buy_trades,
    COUNT(*) FILTER (WHERE ec.side = 'sell') AS sell_trades,
    COUNT(DISTINCT ec.symbol) AS unique_symbols,

    -- 손익 통계
    COALESCE(SUM(ec.amount), 0) AS total_volume,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COALESCE(SUM(te.realized_pnl), 0) AS realized_pnl,
    COUNT(*) FILTER (WHERE te.realized_pnl > 0) AS winning_trades,
    COUNT(*) FILTER (WHERE te.realized_pnl < 0) AS losing_trades,

    -- 승률
    CASE
        WHEN COUNT(*) FILTER (WHERE te.realized_pnl IS NOT NULL) > 0
        THEN ROUND(
            COUNT(*) FILTER (WHERE te.realized_pnl > 0)::numeric * 100 /
            NULLIF(COUNT(*) FILTER (WHERE te.realized_pnl IS NOT NULL), 0),
            2
        )
        ELSE 0
    END AS win_rate_pct,

    -- 평균 승/패
    COALESCE(AVG(te.realized_pnl) FILTER (WHERE te.realized_pnl > 0), 0) AS avg_win,
    COALESCE(ABS(AVG(te.realized_pnl) FILTER (WHERE te.realized_pnl < 0)), 0) AS avg_loss,

    -- 손익비 (Profit Factor)
    CASE
        WHEN COALESCE(ABS(SUM(te.realized_pnl) FILTER (WHERE te.realized_pnl < 0)), 0) > 0
        THEN ROUND(
            COALESCE(SUM(te.realized_pnl) FILTER (WHERE te.realized_pnl > 0), 0)::numeric /
            ABS(COALESCE(SUM(te.realized_pnl) FILTER (WHERE te.realized_pnl < 0), 1)),
            2
        )
        ELSE NULL
    END AS profit_factor,

    -- 최대 손익
    MAX(te.realized_pnl) AS largest_win,
    MIN(te.realized_pnl) AS largest_loss,

    -- 거래 빈도
    COUNT(DISTINCT DATE(ec.executed_at AT TIME ZONE 'Asia/Seoul')) AS active_trading_days,

    -- 거래 기간
    MIN(ec.executed_at) AS first_trade_at,
    MAX(ec.executed_at) AS last_trade_at

FROM execution_cache ec
LEFT JOIN trade_executions te ON
    te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id, COALESCE(te.strategy_id, 'manual'), COALESCE(te.strategy_name, '수동 거래');

COMMENT ON VIEW v_strategy_performance IS '전략별 성과 분석 뷰';

-- 7. 전략별 월간 성과 추이 뷰
CREATE OR REPLACE VIEW v_strategy_monthly_performance AS
SELECT
    ec.credential_id,
    COALESCE(te.strategy_id, 'manual') AS strategy_id,
    COALESCE(te.strategy_name, '수동 거래') AS strategy_name,
    EXTRACT(YEAR FROM ec.executed_at AT TIME ZONE 'Asia/Seoul')::int AS year,
    EXTRACT(MONTH FROM ec.executed_at AT TIME ZONE 'Asia/Seoul')::int AS month,
    COUNT(*) AS total_trades,
    COALESCE(SUM(ec.amount), 0) AS total_volume,
    COALESCE(SUM(te.realized_pnl), 0) AS realized_pnl,
    COUNT(*) FILTER (WHERE te.realized_pnl > 0) AS winning_trades,
    COUNT(*) FILTER (WHERE te.realized_pnl < 0) AS losing_trades
FROM execution_cache ec
LEFT JOIN trade_executions te ON
    te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id,
         COALESCE(te.strategy_id, 'manual'),
         COALESCE(te.strategy_name, '수동 거래'),
         EXTRACT(YEAR FROM ec.executed_at AT TIME ZONE 'Asia/Seoul'),
         EXTRACT(MONTH FROM ec.executed_at AT TIME ZONE 'Asia/Seoul');

COMMENT ON VIEW v_strategy_monthly_performance IS '전략별 월간 성과 추이 뷰';
