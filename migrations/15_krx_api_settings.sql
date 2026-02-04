-- =====================================================
-- 15_krx_api_settings.sql
-- KRX Open API Credential 지원
-- =====================================================
--
-- KRX Open API 인증키를 exchange_credentials 시스템으로 관리합니다.
-- UI에서 credential 등록 시 암호화되어 저장됩니다.
--
-- 저장 형식:
-- - exchange_id: 'krx'
-- - market_type: 'data_provider'
-- - encrypted_credentials: {"api_key": "YOUR_AUTH_KEY"} (암호화됨)
--
-- 사용법:
-- 1. Settings UI에서 "KRX Open API" credential 등록
-- 2. API Key 입력 후 저장 (자동 암호화)
-- 3. KrxApiClient.from_credential() 으로 사용
--
-- =====================================================

-- KRX credential이 이미 있을 수 있으므로, 중복 방지를 위한 코멘트만 추가
-- (실제 데이터는 UI에서 사용자가 등록)

COMMENT ON TABLE exchange_credentials IS
    '거래소 및 데이터 제공자 API 자격증명 (AES-256-GCM 암호화). KRX Open API도 여기서 관리.';

-- app_settings에 KRX 관련 안내 추가 (선택적)
INSERT INTO app_settings (setting_key, setting_value, description)
VALUES (
    'krx_api_info',
    'https://openapi.krx.co.kr',
    'KRX Open API 정보. API 키는 Settings > Credentials에서 등록하세요.'
)
ON CONFLICT (setting_key) DO NOTHING;
