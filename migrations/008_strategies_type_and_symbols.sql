-- Add strategy_type column to strategies table
-- This allows reconstructing the correct strategy implementation on server restart

ALTER TABLE strategies ADD COLUMN IF NOT EXISTS strategy_type VARCHAR(50);

-- Add symbols column (JSONB array of symbols this strategy operates on)
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS symbols JSONB DEFAULT '[]';

-- Add market column
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS market VARCHAR(20) DEFAULT 'KR';

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_strategies_type ON strategies(strategy_type);
CREATE INDEX IF NOT EXISTS idx_strategies_active ON strategies(is_active) WHERE is_active = true;

-- Comment on new columns
COMMENT ON COLUMN strategies.strategy_type IS 'Strategy implementation type (e.g., grid_trading, rsi_mean_reversion)';
COMMENT ON COLUMN strategies.symbols IS 'JSON array of symbols this strategy operates on';
COMMENT ON COLUMN strategies.market IS 'Market type: KR, US, or CRYPTO';
