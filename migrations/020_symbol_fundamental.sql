-- =====================================================
-- 심볼 Fundamental 정보 테이블
--
-- 목적: symbol_info와 연계하여 펀더멘털 데이터 저장
-- 데이터 소스: KRX (한국), Yahoo Finance (해외)
-- 용도: 종목 선정, 필터링, 분석용 기초 데이터
-- =====================================================

CREATE TABLE IF NOT EXISTS symbol_fundamental (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- symbol_info 연계 (FK)
    symbol_info_id UUID NOT NULL REFERENCES symbol_info(id) ON DELETE CASCADE,

    -- 기본 시장 데이터
    market_cap DECIMAL(20, 2),               -- 시가총액 (원/달러)
    shares_outstanding BIGINT,               -- 발행주식수
    float_shares BIGINT,                     -- 유통주식수

    -- 가격 관련
    week_52_high DECIMAL(20, 4),             -- 52주 최고가
    week_52_low DECIMAL(20, 4),              -- 52주 최저가
    avg_volume_10d BIGINT,                   -- 10일 평균 거래량
    avg_volume_3m BIGINT,                    -- 3개월 평균 거래량

    -- 밸류에이션 지표
    per DECIMAL(12, 4),                      -- PER (주가수익비율)
    forward_per DECIMAL(12, 4),              -- Forward PER
    pbr DECIMAL(12, 4),                      -- PBR (주가순자산비율)
    psr DECIMAL(12, 4),                      -- PSR (주가매출비율)
    pcr DECIMAL(12, 4),                      -- PCR (주가현금흐름비율)
    ev_ebitda DECIMAL(12, 4),                -- EV/EBITDA

    -- 주당 지표
    eps DECIMAL(20, 4),                      -- EPS (주당순이익)
    bps DECIMAL(20, 4),                      -- BPS (주당순자산)
    dps DECIMAL(20, 4),                      -- DPS (주당배당금)
    sps DECIMAL(20, 4),                      -- SPS (주당매출)

    -- 배당 관련
    dividend_yield DECIMAL(8, 4),            -- 배당수익률 (%)
    dividend_payout_ratio DECIMAL(8, 4),     -- 배당성향 (%)
    ex_dividend_date DATE,                   -- 배당락일

    -- 재무제표 요약 (최근 연간)
    revenue DECIMAL(20, 2),                  -- 매출액
    operating_income DECIMAL(20, 2),         -- 영업이익
    net_income DECIMAL(20, 2),               -- 순이익
    total_assets DECIMAL(20, 2),             -- 총자산
    total_liabilities DECIMAL(20, 2),        -- 총부채
    total_equity DECIMAL(20, 2),             -- 자기자본

    -- 수익성 지표
    roe DECIMAL(8, 4),                       -- ROE (자기자본이익률) (%)
    roa DECIMAL(8, 4),                       -- ROA (총자산이익률) (%)
    operating_margin DECIMAL(8, 4),          -- 영업이익률 (%)
    net_profit_margin DECIMAL(8, 4),         -- 순이익률 (%)
    gross_margin DECIMAL(8, 4),              -- 매출총이익률 (%)

    -- 안정성 지표
    debt_ratio DECIMAL(12, 4),               -- 부채비율 (%)
    current_ratio DECIMAL(12, 4),            -- 유동비율 (%)
    quick_ratio DECIMAL(12, 4),              -- 당좌비율 (%)
    interest_coverage DECIMAL(12, 4),        -- 이자보상배율

    -- 성장성 지표
    revenue_growth_yoy DECIMAL(8, 4),        -- 매출 성장률 YoY (%)
    earnings_growth_yoy DECIMAL(8, 4),       -- 이익 성장률 YoY (%)
    revenue_growth_3y DECIMAL(8, 4),         -- 매출 3년 CAGR (%)
    earnings_growth_3y DECIMAL(8, 4),        -- 이익 3년 CAGR (%)

    -- 메타데이터
    data_source VARCHAR(50),                 -- 데이터 소스 (KRX, Yahoo, etc.)
    fiscal_year_end VARCHAR(10),             -- 회계연도 종료월 (예: "12")
    currency VARCHAR(10) DEFAULT 'KRW',      -- 통화 (KRW, USD, etc.)

    -- 시스템 필드
    fetched_at TIMESTAMPTZ DEFAULT NOW(),    -- 데이터 수집 시점
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 유일 제약 (한 심볼당 하나의 Fundamental 레코드)
    CONSTRAINT unique_symbol_fundamental UNIQUE (symbol_info_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_symbol_fundamental_symbol_id ON symbol_fundamental(symbol_info_id);
CREATE INDEX IF NOT EXISTS idx_symbol_fundamental_market_cap ON symbol_fundamental(market_cap DESC);
CREATE INDEX IF NOT EXISTS idx_symbol_fundamental_per ON symbol_fundamental(per);
CREATE INDEX IF NOT EXISTS idx_symbol_fundamental_roe ON symbol_fundamental(roe DESC);
CREATE INDEX IF NOT EXISTS idx_symbol_fundamental_dividend_yield ON symbol_fundamental(dividend_yield DESC);

-- 스크리닝용 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_symbol_fundamental_valuation
ON symbol_fundamental(per, pbr, dividend_yield)
WHERE per IS NOT NULL AND pbr IS NOT NULL;

-- =====================================================
-- 심볼 정보 + Fundamental 통합 뷰
--
-- 용도: 한 번의 쿼리로 심볼 기본정보와 Fundamental 조회
-- =====================================================

CREATE OR REPLACE VIEW v_symbol_with_fundamental AS
SELECT
    si.id,
    si.ticker,
    si.name,
    si.name_en,
    si.market,
    si.exchange,
    si.sector,
    si.yahoo_symbol,
    si.is_active,
    -- Fundamental 데이터
    sf.market_cap,
    sf.per,
    sf.pbr,
    sf.eps,
    sf.bps,
    sf.dividend_yield,
    sf.roe,
    sf.roa,
    sf.operating_margin,
    sf.debt_ratio,
    sf.week_52_high,
    sf.week_52_low,
    sf.avg_volume_10d,
    sf.revenue,
    sf.operating_income,
    sf.net_income,
    sf.revenue_growth_yoy,
    sf.earnings_growth_yoy,
    sf.data_source AS fundamental_source,
    sf.fetched_at AS fundamental_fetched_at,
    sf.updated_at AS fundamental_updated_at
FROM symbol_info si
LEFT JOIN symbol_fundamental sf ON si.id = sf.symbol_info_id
WHERE si.is_active = true;

-- 코멘트
COMMENT ON TABLE symbol_fundamental IS '심볼 펀더멘털 데이터 - 시가총액, PER, PBR, 재무 지표 등';
COMMENT ON COLUMN symbol_fundamental.symbol_info_id IS 'symbol_info 테이블 FK';
COMMENT ON COLUMN symbol_fundamental.market_cap IS '시가총액 (통화 단위)';
COMMENT ON COLUMN symbol_fundamental.per IS '주가수익비율 (Price to Earnings Ratio)';
COMMENT ON COLUMN symbol_fundamental.pbr IS '주가순자산비율 (Price to Book Ratio)';
COMMENT ON COLUMN symbol_fundamental.roe IS '자기자본이익률 (Return on Equity) %';
COMMENT ON VIEW v_symbol_with_fundamental IS '심볼 기본정보와 펀더멘털 통합 조회용 뷰';
