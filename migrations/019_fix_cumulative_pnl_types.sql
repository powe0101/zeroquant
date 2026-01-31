-- ==========================================
-- 019: 누적 손익 뷰 타입 수정
-- ==========================================
-- SUM() 윈도우 함수가 NUMERIC을 반환하는 문제 수정
-- cumulative_trades를 BIGINT로 캐스팅

DROP VIEW IF EXISTS v_cumulative_pnl;

CREATE VIEW v_cumulative_pnl AS
SELECT
    credential_id,
    trade_date,
    total_trades,
    realized_pnl,
    total_fees,
    SUM(realized_pnl) OVER (PARTITION BY credential_id ORDER BY trade_date) AS cumulative_pnl,
    SUM(total_fees) OVER (PARTITION BY credential_id ORDER BY trade_date) AS cumulative_fees,
    (SUM(total_trades) OVER (PARTITION BY credential_id ORDER BY trade_date))::BIGINT AS cumulative_trades
FROM v_daily_pnl
ORDER BY credential_id, trade_date;

COMMENT ON VIEW v_cumulative_pnl IS '일별 누적 손익 뷰 (타입 수정됨)';
