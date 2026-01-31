-- ==========================================
-- 017: 매매일지 통합 뷰 생성
-- ==========================================
-- execution_cache(원본 데이터)와 trade_executions(추가 정보)를 결합하여
-- 매매일지에서 사용할 통합 뷰를 제공합니다.
--
-- 아키텍처:
--   execution_cache: 거래소에서 동기화된 원본 체결 데이터 (read-only)
--   trade_executions: 사용자가 추가한 메모, 태그 등 부가 정보만 저장
--   v_journal_executions: 두 테이블을 결합한 뷰

-- 1. 체결 내역 통합 뷰
CREATE OR REPLACE VIEW v_journal_executions AS
SELECT
    ec.id,
    ec.credential_id,
    ec.exchange,
    ec.symbol,
    ec.normalized_symbol AS symbol_name,
    ec.side,
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
    te.metadata,
    ec.created_at,
    te.updated_at
FROM execution_cache ec
LEFT JOIN trade_executions te ON
    te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id;

COMMENT ON VIEW v_journal_executions IS '매매일지 체결 내역 통합 뷰 (execution_cache + trade_executions)';

-- 2. 일별 손익 집계 뷰
CREATE OR REPLACE VIEW v_daily_pnl AS
SELECT
    ec.credential_id,
    DATE(ec.executed_at AT TIME ZONE 'Asia/Seoul') AS trade_date,
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE ec.side = 'buy') AS buy_count,
    COUNT(*) FILTER (WHERE ec.side = 'sell') AS sell_count,
    COALESCE(SUM(ec.amount), 0) AS total_volume,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COALESCE(SUM(te.realized_pnl), 0) AS realized_pnl,
    COUNT(DISTINCT ec.symbol) AS symbol_count
FROM execution_cache ec
LEFT JOIN trade_executions te ON
    te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id, DATE(ec.executed_at AT TIME ZONE 'Asia/Seoul');

COMMENT ON VIEW v_daily_pnl IS '일별 손익 집계 뷰';

-- 3. 종목별 손익 집계 뷰
CREATE OR REPLACE VIEW v_symbol_pnl AS
SELECT
    ec.credential_id,
    ec.symbol,
    MAX(ec.normalized_symbol) AS symbol_name,
    COUNT(*) AS total_trades,
    COALESCE(SUM(ec.quantity) FILTER (WHERE ec.side = 'buy'), 0) AS total_buy_qty,
    COALESCE(SUM(ec.quantity) FILTER (WHERE ec.side = 'sell'), 0) AS total_sell_qty,
    COALESCE(SUM(ec.amount) FILTER (WHERE ec.side = 'buy'), 0) AS total_buy_value,
    COALESCE(SUM(ec.amount) FILTER (WHERE ec.side = 'sell'), 0) AS total_sell_value,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COALESCE(SUM(te.realized_pnl), 0) AS realized_pnl,
    MIN(ec.executed_at) AS first_trade_at,
    MAX(ec.executed_at) AS last_trade_at
FROM execution_cache ec
LEFT JOIN trade_executions te ON
    te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id, ec.symbol;

COMMENT ON VIEW v_symbol_pnl IS '종목별 손익 집계 뷰';

-- 4. 전체 PnL 요약 뷰
CREATE OR REPLACE VIEW v_total_pnl AS
SELECT
    ec.credential_id,
    COALESCE(SUM(te.realized_pnl), 0) AS total_realized_pnl,
    COALESCE(SUM(ec.fee), 0) AS total_fees,
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE ec.side = 'buy') AS buy_trades,
    COUNT(*) FILTER (WHERE ec.side = 'sell') AS sell_trades,
    COUNT(*) FILTER (WHERE te.realized_pnl > 0) AS winning_trades,
    COUNT(*) FILTER (WHERE te.realized_pnl < 0) AS losing_trades,
    COALESCE(SUM(ec.amount), 0) AS total_volume,
    MIN(ec.executed_at) AS first_trade_at,
    MAX(ec.executed_at) AS last_trade_at
FROM execution_cache ec
LEFT JOIN trade_executions te ON
    te.credential_id = ec.credential_id
    AND te.exchange = ec.exchange
    AND te.exchange_trade_id = ec.trade_id
GROUP BY ec.credential_id;

COMMENT ON VIEW v_total_pnl IS '전체 PnL 요약 뷰';

-- 5. 인덱스 추가 (뷰 성능 최적화)
-- execution_cache에 복합 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_execution_cache_credential_exchange_trade
ON execution_cache (credential_id, exchange, trade_id);

-- trade_executions에 복합 인덱스 추가 (JOIN 성능)
CREATE INDEX IF NOT EXISTS idx_trade_executions_lookup
ON trade_executions (credential_id, exchange, exchange_trade_id);

-- 일별 집계용 인덱스
CREATE INDEX IF NOT EXISTS idx_execution_cache_executed_at
ON execution_cache (credential_id, executed_at DESC);

-- 종목별 집계용 인덱스
CREATE INDEX IF NOT EXISTS idx_execution_cache_symbol
ON execution_cache (credential_id, symbol);
