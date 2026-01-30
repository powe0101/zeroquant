-- =====================================================
-- 010: BACKTEST RESULTS TABLE
-- =====================================================
-- 백테스트 결과를 영구 저장하는 테이블

-- =====================================================
-- CREATE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS backtest_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 전략 정보
    strategy_id VARCHAR(100) NOT NULL,       -- strategies 테이블의 id 참조
    strategy_type VARCHAR(50) NOT NULL,      -- 전략 타입 (sma_crossover, bollinger 등)

    -- 백테스트 설정
    symbol VARCHAR(500) NOT NULL,            -- 심볼 (다중 자산은 콤마 구분)
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    initial_capital DECIMAL(20, 2) NOT NULL,
    slippage_rate DECIMAL(10, 6) DEFAULT 0.0005,

    -- 결과 (JSONB로 저장하여 유연성 확보)
    metrics JSONB NOT NULL,                   -- 성과 지표
    config_summary JSONB NOT NULL,            -- 설정 요약
    equity_curve JSONB NOT NULL DEFAULT '[]', -- 자산 곡선
    trades JSONB NOT NULL DEFAULT '[]',       -- 거래 내역

    -- 상태
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,

    -- 메타데이터
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ                    -- soft delete
);

-- =====================================================
-- INDEXES
-- =====================================================

-- 전략별 결과 조회
CREATE INDEX idx_backtest_results_strategy
    ON backtest_results(strategy_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- 전략 타입별 조회
CREATE INDEX idx_backtest_results_type
    ON backtest_results(strategy_type, created_at DESC)
    WHERE deleted_at IS NULL;

-- 심볼별 조회
CREATE INDEX idx_backtest_results_symbol
    ON backtest_results(symbol, created_at DESC)
    WHERE deleted_at IS NULL;

-- 최근 결과 조회 (삭제되지 않은 것만)
CREATE INDEX idx_backtest_results_recent
    ON backtest_results(created_at DESC)
    WHERE deleted_at IS NULL;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE backtest_results IS
'백테스트 결과 저장 테이블. 전략별 백테스트 수행 결과를 영구 저장합니다.';

COMMENT ON COLUMN backtest_results.id IS
'결과 고유 ID (UUID)';

COMMENT ON COLUMN backtest_results.strategy_id IS
'전략 ID (strategies 테이블 참조)';

COMMENT ON COLUMN backtest_results.strategy_type IS
'전략 타입 (sma_crossover, bollinger, haa 등)';

COMMENT ON COLUMN backtest_results.symbol IS
'백테스트 대상 심볼. 다중 자산 전략은 콤마로 구분';

COMMENT ON COLUMN backtest_results.metrics IS
'성과 지표 JSON: total_return_pct, annualized_return_pct, max_drawdown_pct, sharpe_ratio 등';

COMMENT ON COLUMN backtest_results.equity_curve IS
'자산 곡선 JSON 배열: [{timestamp, equity, drawdown_pct}, ...]';

COMMENT ON COLUMN backtest_results.trades IS
'거래 내역 JSON 배열: [{symbol, side, entry_price, exit_price, quantity, pnl, return_pct}, ...]';

COMMENT ON COLUMN backtest_results.deleted_at IS
'소프트 삭제 시간. NULL이면 활성 상태';
