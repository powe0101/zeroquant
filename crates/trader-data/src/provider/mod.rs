//! 데이터 Provider 모듈.
//!
//! 다양한 소스에서 데이터를 가져오는 Provider들을 정의합니다.
//!
//! ## KRX Open API
//! - `KrxApiClient`: KRX Open API 클라이언트 (인증키 필요)
//! - KOSPI/KOSDAQ 종목 기본 정보, PER/PBR, OHLCV 데이터
//! - Yahoo Finance 국내 주식 의존성 대체
//!
//! ## 심볼 정보 Provider
//! - `KrxSymbolProvider`: 한국거래소(KRX) 종목 정보
//! - `BinanceSymbolProvider`: Binance 암호화폐 종목 정보
//! - `YahooSymbolProvider`: Yahoo Finance 미국/글로벌 주식 정보
//! - `CompositeSymbolProvider`: 모든 Provider 통합

pub mod krx_api;
pub mod symbol_info;

pub use krx_api::{KrxApiClient, KrxEtfInfo, KrxOhlcv, KrxStockInfo, KrxValuation};
pub use symbol_info::{
    BinanceSymbolProvider, CompositeSymbolProvider, KrxSymbolProvider, SymbolInfoProvider,
    SymbolMetadata, SymbolResolver, YahooSymbolProvider,
};
