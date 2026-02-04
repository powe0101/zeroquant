-- =====================================================
-- 16_kis_token_cache.sql
-- KIS OAuth 토큰 DB 캐싱
-- =====================================================
--
-- KIS API는 토큰 발급에 1분당 1회 제한이 있습니다.
-- 토큰을 DB에 저장하여 서버 재시작 시에도 유효한 토큰을 재사용합니다.
--
-- =====================================================

CREATE TABLE IF NOT EXISTS kis_token_cache (
    id SERIAL PRIMARY KEY,

    -- 토큰 식별 (credential_id + environment)
    credential_id UUID NOT NULL REFERENCES exchange_credentials(id) ON DELETE CASCADE,
    environment VARCHAR(10) NOT NULL DEFAULT 'real',  -- 'real' or 'paper'

    -- 토큰 정보
    access_token TEXT NOT NULL,
    token_type VARCHAR(20) NOT NULL DEFAULT 'Bearer',
    expires_at TIMESTAMPTZ NOT NULL,

    -- WebSocket 접속키 (옵션)
    websocket_key TEXT,
    websocket_key_expires_at TIMESTAMPTZ,

    -- 메타데이터
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 하나의 credential + environment 조합당 하나의 토큰만 저장
    CONSTRAINT kis_token_cache_unique UNIQUE (credential_id, environment)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_kis_token_cache_credential
    ON kis_token_cache(credential_id);
CREATE INDEX IF NOT EXISTS idx_kis_token_cache_expires
    ON kis_token_cache(expires_at);

-- 코멘트
COMMENT ON TABLE kis_token_cache IS 'KIS OAuth 토큰 캐시. 1분당 1회 발급 제한 대응.';
COMMENT ON COLUMN kis_token_cache.credential_id IS '거래소 자격증명 ID (exchange_credentials.id)';
COMMENT ON COLUMN kis_token_cache.environment IS '환경: real(실전) 또는 paper(모의)';
COMMENT ON COLUMN kis_token_cache.access_token IS 'KIS 접근 토큰';
COMMENT ON COLUMN kis_token_cache.expires_at IS '토큰 만료 시각 (UTC)';
COMMENT ON COLUMN kis_token_cache.websocket_key IS 'WebSocket 접속 승인키';

-- 만료된 토큰 자동 정리 함수 (선택적)
CREATE OR REPLACE FUNCTION cleanup_expired_kis_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM kis_token_cache
    WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_kis_tokens IS '만료된 KIS 토큰 정리 (1시간 이상 만료된 토큰 삭제)';
