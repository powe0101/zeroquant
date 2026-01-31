-- Trading Journal Schema
-- 매매일지 기능을 위한 체결 내역 및 포지션 스냅샷 테이블

-- =====================================================
-- TRADE EXECUTIONS TABLE
-- 체결 내역을 저장하여 매매일지 기능 지원
-- =====================================================

CREATE TABLE trade_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 자격증명 연결 (어떤 계좌의 거래인지)
    credential_id UUID NOT NULL REFERENCES exchange_credentials(id) ON DELETE CASCADE,

    -- 거래 기본 정보
    exchange VARCHAR(50) NOT NULL,
    symbol VARCHAR(50) NOT NULL,              -- "BTC/USDT", "005930" 등
    symbol_name VARCHAR(100),                 -- "삼성전자", "Bitcoin" 등 (표시용)

    -- 거래 유형
    side order_side NOT NULL,                 -- buy, sell
    order_type order_type NOT NULL,           -- market, limit 등

    -- 수량 및 가격
    quantity DECIMAL(30, 15) NOT NULL,
    price DECIMAL(30, 15) NOT NULL,           -- 체결가
    notional_value DECIMAL(30, 15) NOT NULL,  -- 거래대금 (quantity * price)

    -- 수수료
    fee DECIMAL(30, 15) DEFAULT 0,
    fee_currency VARCHAR(20),

    -- 포지션 영향
    position_effect VARCHAR(20),              -- open, close, add, reduce
    realized_pnl DECIMAL(30, 15),             -- 실현 손익 (청산 시)

    -- 주문 연결 (선택적)
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    exchange_order_id VARCHAR(100),
    exchange_trade_id VARCHAR(100),

    -- 전략 연결 (선택적)
    strategy_id VARCHAR(100),
    strategy_name VARCHAR(200),

    -- 체결 시간
    executed_at TIMESTAMPTZ NOT NULL,

    -- 메모 및 태그 (매매일지용)
    memo TEXT,                                -- 사용자 메모
    tags JSONB DEFAULT '[]',                  -- 태그 배열 ["손절", "스윙"] 등

    -- 메타데이터
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_trade_executions_credential_time
    ON trade_executions(credential_id, executed_at DESC);

CREATE INDEX idx_trade_executions_symbol
    ON trade_executions(credential_id, symbol, executed_at DESC);

CREATE INDEX idx_trade_executions_strategy
    ON trade_executions(strategy_id, executed_at DESC)
    WHERE strategy_id IS NOT NULL;

CREATE INDEX idx_trade_executions_date
    ON trade_executions(credential_id, DATE(executed_at));

-- updated_at 트리거
CREATE TRIGGER update_trade_executions_updated_at
    BEFORE UPDATE ON trade_executions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- POSITION SNAPSHOTS TABLE
-- 포지션 스냅샷을 저장하여 포지션 추적 및 분석 지원
-- =====================================================

CREATE TABLE position_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 자격증명 연결
    credential_id UUID NOT NULL REFERENCES exchange_credentials(id) ON DELETE CASCADE,

    -- 스냅샷 시간
    snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 종목 정보
    exchange VARCHAR(50) NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    symbol_name VARCHAR(100),

    -- 포지션 유형
    side order_side NOT NULL,                 -- buy(롱), sell(숏)

    -- 수량 및 가격
    quantity DECIMAL(30, 15) NOT NULL,
    entry_price DECIMAL(30, 15) NOT NULL,     -- 평균 매입가
    current_price DECIMAL(30, 15),            -- 현재가

    -- 평가 금액
    cost_basis DECIMAL(30, 15) NOT NULL,      -- 매입 원가 (entry_price * quantity)
    market_value DECIMAL(30, 15),             -- 평가 금액 (current_price * quantity)

    -- 손익
    unrealized_pnl DECIMAL(30, 15) DEFAULT 0,
    unrealized_pnl_pct DECIMAL(10, 4) DEFAULT 0,  -- 수익률 (%)
    realized_pnl DECIMAL(30, 15) DEFAULT 0,   -- 누적 실현 손익

    -- 포트폴리오 비중
    weight_pct DECIMAL(10, 4),                -- 포트폴리오 내 비중 (%)

    -- 첫 매수 및 최근 거래
    first_trade_at TIMESTAMPTZ,
    last_trade_at TIMESTAMPTZ,
    trade_count INT DEFAULT 0,                -- 해당 종목 거래 횟수

    -- 전략 연결 (선택적)
    strategy_id VARCHAR(100),

    -- 메타데이터
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- 동일 credential, symbol, 시간대에 중복 방지
    UNIQUE(credential_id, symbol, snapshot_time)
);

-- 인덱스
CREATE INDEX idx_position_snapshots_credential_time
    ON position_snapshots(credential_id, snapshot_time DESC);

CREATE INDEX idx_position_snapshots_symbol
    ON position_snapshots(credential_id, symbol, snapshot_time DESC);

CREATE INDEX idx_position_snapshots_latest
    ON position_snapshots(credential_id, snapshot_time DESC)
    WHERE quantity > 0;

-- =====================================================
-- 집계 뷰: 일별 거래 요약
-- =====================================================

CREATE OR REPLACE VIEW journal_daily_summary AS
SELECT
    credential_id,
    DATE(executed_at) as trade_date,
    COUNT(*) as total_trades,
    COUNT(*) FILTER (WHERE side = 'buy') as buy_count,
    COUNT(*) FILTER (WHERE side = 'sell') as sell_count,
    SUM(notional_value) as total_volume,
    SUM(fee) as total_fees,
    SUM(realized_pnl) FILTER (WHERE realized_pnl IS NOT NULL) as realized_pnl,
    COUNT(DISTINCT symbol) as symbol_count
FROM trade_executions
GROUP BY credential_id, DATE(executed_at);

-- =====================================================
-- 집계 뷰: 종목별 손익 요약
-- =====================================================

CREATE OR REPLACE VIEW journal_symbol_pnl AS
SELECT
    credential_id,
    symbol,
    symbol_name,
    COUNT(*) as total_trades,
    SUM(quantity) FILTER (WHERE side = 'buy') as total_buy_qty,
    SUM(quantity) FILTER (WHERE side = 'sell') as total_sell_qty,
    SUM(notional_value) FILTER (WHERE side = 'buy') as total_buy_value,
    SUM(notional_value) FILTER (WHERE side = 'sell') as total_sell_value,
    SUM(fee) as total_fees,
    SUM(COALESCE(realized_pnl, 0)) as realized_pnl,
    MIN(executed_at) as first_trade_at,
    MAX(executed_at) as last_trade_at
FROM trade_executions
GROUP BY credential_id, symbol, symbol_name;

-- =====================================================
-- 집계 뷰: 현재 포지션 (최신 스냅샷)
-- =====================================================

CREATE OR REPLACE VIEW journal_current_positions AS
SELECT DISTINCT ON (credential_id, symbol)
    id,
    credential_id,
    snapshot_time,
    exchange,
    symbol,
    symbol_name,
    side,
    quantity,
    entry_price,
    current_price,
    cost_basis,
    market_value,
    unrealized_pnl,
    unrealized_pnl_pct,
    realized_pnl,
    weight_pct,
    first_trade_at,
    last_trade_at,
    trade_count,
    strategy_id
FROM position_snapshots
WHERE quantity > 0
ORDER BY credential_id, symbol, snapshot_time DESC;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE trade_executions IS
    '매매일지용 체결 내역. 거래 기록과 메모, 태그를 저장하여 트레이딩 분석 지원.';

COMMENT ON TABLE position_snapshots IS
    '포지션 스냅샷. 시간별 포지션 상태를 기록하여 포지션 변화 추적.';

COMMENT ON COLUMN trade_executions.position_effect IS
    '포지션 영향: open(신규진입), close(청산), add(추가매수), reduce(부분청산)';

COMMENT ON COLUMN trade_executions.tags IS
    '사용자 정의 태그. 예: ["손절", "스윙", "단타"]';

COMMENT ON COLUMN position_snapshots.entry_price IS
    '가중평균 매입가. (sum(price * quantity) / sum(quantity))';

COMMENT ON COLUMN position_snapshots.weight_pct IS
    '포트폴리오 내 비중. 총 자산 대비 해당 종목 비율.';
