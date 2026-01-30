-- Add allocated_capital column to strategies table
-- This allows setting per-strategy capital allocation for risk management

-- Add allocated_capital column (default NULL means use full account balance)
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS allocated_capital DECIMAL(30, 15);

-- Add risk_profile column for quick selection (conservative, default, aggressive, custom)
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS risk_profile VARCHAR(20) DEFAULT 'default';

-- Comment on new columns
COMMENT ON COLUMN strategies.allocated_capital IS 'Capital allocated to this strategy (NULL = use full account balance)';
COMMENT ON COLUMN strategies.risk_limits IS 'JSON object containing RiskConfig settings for this strategy';
COMMENT ON COLUMN strategies.risk_profile IS 'Risk profile: conservative, default, aggressive, or custom';

-- Create index for efficient lookups by risk profile
CREATE INDEX IF NOT EXISTS idx_strategies_risk_profile ON strategies(risk_profile);
