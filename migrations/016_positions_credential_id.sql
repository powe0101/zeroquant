-- ==========================================
-- 016: 포지션 테이블에 credential_id 추가
-- ==========================================
-- 여러 거래소 계정의 포지션을 구분하기 위해 credential_id 컬럼을 추가합니다.
-- 기존 데이터가 있을 경우를 대비해 NULL 허용 후 인덱스 생성합니다.

-- 1. credential_id 컬럼 추가
ALTER TABLE positions
ADD COLUMN IF NOT EXISTS credential_id UUID REFERENCES exchange_credentials(id);

-- 2. symbol_name 컬럼 추가 (종목명 표시용)
ALTER TABLE positions
ADD COLUMN IF NOT EXISTS symbol_name VARCHAR(200);

-- 3. symbol 컬럼 추가 (심볼 문자열 직접 저장 - 거래소 중립)
ALTER TABLE positions
ADD COLUMN IF NOT EXISTS symbol VARCHAR(50);

-- 4. 기존 인덱스 삭제 후 재생성 (credential_id 포함)
DROP INDEX IF EXISTS idx_positions_open;
CREATE INDEX idx_positions_open_credential
ON positions (credential_id, exchange, symbol_id)
WHERE closed_at IS NULL;

-- 5. credential_id로 빠른 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_positions_credential
ON positions (credential_id)
WHERE closed_at IS NULL;

-- 6. symbol로 조회를 위한 인덱스 (symbol_id 대신 사용 가능)
CREATE INDEX IF NOT EXISTS idx_positions_symbol
ON positions (credential_id, symbol)
WHERE closed_at IS NULL;

-- 7. 코멘트 추가
COMMENT ON COLUMN positions.credential_id IS '거래소 자격증명 ID (exchange_credentials.id)';
COMMENT ON COLUMN positions.symbol_name IS '종목명 (표시용)';
COMMENT ON COLUMN positions.symbol IS '심볼 코드 (예: 005930, AAPL)';
