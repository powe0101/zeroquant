//! 데이터 Provider 모듈.
//!
//! 다양한 소스에서 데이터를 가져오는 Provider들을 정의합니다.
//!
//! ## 심볼 정보 Provider
//! - `KrxSymbolProvider`: 한국거래소(KRX) 종목 정보
//! - `BinanceSymbolProvider`: Binance 암호화폐 종목 정보
//! - `YahooSymbolProvider`: Yahoo Finance 미국/글로벌 주식 정보
//! - `CompositeSymbolProvider`: 모든 Provider 통합

pub mod symbol_info;

pub use symbol_info::{
    BinanceSymbolProvider, CompositeSymbolProvider, KrxSymbolProvider, SymbolInfoProvider,
    SymbolMetadata, SymbolResolver, YahooSymbolProvider,
};
