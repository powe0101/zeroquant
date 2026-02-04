-- =====================================================
-- 17_journal_executions_view.sql
-- 통합 체결 내역 뷰 (execution_cache + trade_executions)
-- =====================================================
--
-- 이 뷰는 거래소에서 수집된 체결 내역(execution_cache)과
-- 사용자가 추가한 메모/태그(trade_executions)를 통합합니다.
--
-- =====================================================

-- 기존 뷰가 있으면 삭제
DROP VIEW IF EXISTS v_journal_executions;

-- 통합 체결 내역 뷰 생성
-- IMPORTANT: side 컬럼을 ::text로 캐스팅하여 sqlx VARCHAR/TEXT 호환성 확보
CREATE VIEW v_journal_executions AS
SELECT
    ec.id,
    ec.credential_id,
    ec.exchange,
    ec.symbol,
    ec.normalized_symbol AS symbol_name,
    ec.side::text AS side,                          -- VARCHAR -> TEXT 캐스팅 (sqlx 호환)
    COALESCE(ec.order_type, 'market') AS order_type,
    ec.quantity,
    ec.price,
    ec.amount AS notional_value,
    ec.fee,
    ec.fee_currency,
    te.position_effect,
    te.realized_pnl,
    te.order_id,
    ec.order_id AS exchange_order_id,
    ec.trade_id AS exchange_trade_id,
    te.strategy_id,
    te.strategy_name,
    ec.executed_at,
    te.memo,
    te.tags,
    COALESCE(te.metadata, '{}'::jsonb) AS metadata,
    ec.created_at,
    te.updated_at
FROM execution_cache ec
LEFT JOIN trade_executions te
    ON te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
ORDER BY ec.executed_at DESC;

COMMENT ON VIEW v_journal_executions IS '통합 체결 내역 뷰. execution_cache(거래소 데이터)와 trade_executions(메모/태그)를 결합.';

-- =====================================================
-- 일별 손익 뷰 (기존 v_daily_pnl이 없으면 생성)
-- =====================================================
CREATE OR REPLACE VIEW v_daily_pnl AS
SELECT
    ec.credential_id,
    (ec.executed_at AT TIME ZONE 'Asia/Seoul')::date AS trade_date,
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE ec.side = 'buy') AS buy_count,
    COUNT(*) FILTER (WHERE ec.side = 'sell') AS sell_count,
    COALESCE(SUM(ec.amount), 0) AS total_volume,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COALESCE(SUM(te.realized_pnl), 0) AS realized_pnl,
    COUNT(DISTINCT ec.symbol) AS symbol_count
FROM execution_cache ec
LEFT JOIN trade_executions te
    ON te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id, (ec.executed_at AT TIME ZONE 'Asia/Seoul')::date;

COMMENT ON VIEW v_daily_pnl IS '일별 거래 요약 뷰';

-- =====================================================
-- 주별 손익 뷰
-- =====================================================
CREATE OR REPLACE VIEW v_weekly_pnl AS
SELECT
    ec.credential_id,
    date_trunc('week', ec.executed_at AT TIME ZONE 'Asia/Seoul')::date AS week_start,
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE ec.side = 'buy') AS buy_count,
    COUNT(*) FILTER (WHERE ec.side = 'sell') AS sell_count,
    COALESCE(SUM(ec.amount), 0) AS total_volume,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COALESCE(SUM(te.realized_pnl), 0) AS realized_pnl,
    COUNT(DISTINCT ec.symbol) AS symbol_count,
    COUNT(DISTINCT (ec.executed_at AT TIME ZONE 'Asia/Seoul')::date) AS trading_days
FROM execution_cache ec
LEFT JOIN trade_executions te
    ON te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id, date_trunc('week', ec.executed_at AT TIME ZONE 'Asia/Seoul');

COMMENT ON VIEW v_weekly_pnl IS '주별 거래 요약 뷰';

-- =====================================================
-- 월별 손익 뷰
-- =====================================================
CREATE OR REPLACE VIEW v_monthly_pnl AS
SELECT
    ec.credential_id,
    EXTRACT(year FROM ec.executed_at AT TIME ZONE 'Asia/Seoul')::integer AS year,
    EXTRACT(month FROM ec.executed_at AT TIME ZONE 'Asia/Seoul')::integer AS month,
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE ec.side = 'buy') AS buy_count,
    COUNT(*) FILTER (WHERE ec.side = 'sell') AS sell_count,
    COALESCE(SUM(ec.amount), 0) AS total_volume,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COALESCE(SUM(te.realized_pnl), 0) AS realized_pnl,
    COUNT(DISTINCT ec.symbol) AS symbol_count,
    COUNT(DISTINCT (ec.executed_at AT TIME ZONE 'Asia/Seoul')::date) AS trading_days
FROM execution_cache ec
LEFT JOIN trade_executions te
    ON te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id,
         EXTRACT(year FROM ec.executed_at AT TIME ZONE 'Asia/Seoul'),
         EXTRACT(month FROM ec.executed_at AT TIME ZONE 'Asia/Seoul');

COMMENT ON VIEW v_monthly_pnl IS '월별 거래 요약 뷰';

-- =====================================================
-- 연도별 손익 뷰
-- =====================================================
CREATE OR REPLACE VIEW v_yearly_pnl AS
SELECT
    ec.credential_id,
    EXTRACT(year FROM ec.executed_at AT TIME ZONE 'Asia/Seoul')::integer AS year,
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE ec.side = 'buy') AS buy_count,
    COUNT(*) FILTER (WHERE ec.side = 'sell') AS sell_count,
    COALESCE(SUM(ec.amount), 0) AS total_volume,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COALESCE(SUM(te.realized_pnl), 0) AS realized_pnl,
    COUNT(DISTINCT ec.symbol) AS symbol_count,
    COUNT(DISTINCT (ec.executed_at AT TIME ZONE 'Asia/Seoul')::date) AS trading_days,
    COUNT(DISTINCT EXTRACT(month FROM ec.executed_at AT TIME ZONE 'Asia/Seoul')) AS trading_months
FROM execution_cache ec
LEFT JOIN trade_executions te
    ON te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id,
         EXTRACT(year FROM ec.executed_at AT TIME ZONE 'Asia/Seoul');

COMMENT ON VIEW v_yearly_pnl IS '연도별 거래 요약 뷰';

-- =====================================================
-- 누적 손익 뷰
-- =====================================================
DROP VIEW IF EXISTS v_cumulative_pnl CASCADE;

CREATE VIEW v_cumulative_pnl AS
WITH daily AS (
    SELECT
        credential_id,
        trade_date,
        total_trades,
        realized_pnl,
        total_fees
    FROM v_daily_pnl
)
SELECT
    d.credential_id,
    d.trade_date,
    d.total_trades,
    d.realized_pnl,
    d.total_fees,
    SUM(d.realized_pnl) OVER (PARTITION BY d.credential_id ORDER BY d.trade_date) AS cumulative_pnl,
    SUM(d.total_fees) OVER (PARTITION BY d.credential_id ORDER BY d.trade_date) AS cumulative_fees,
    SUM(d.total_trades) OVER (PARTITION BY d.credential_id ORDER BY d.trade_date)::bigint AS cumulative_trades
FROM daily d;

COMMENT ON VIEW v_cumulative_pnl IS '누적 손익 추이 뷰';
