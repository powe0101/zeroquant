//! 백그라운드 태스크 모듈.
//!
//! 서버 실행 중 주기적으로 실행되는 백그라운드 작업을 정의합니다.
//! - Fundamental 데이터 수집: Yahoo Finance에서 펀더멘털 데이터 배치 수집
//! - 심볼 동기화: KRX/Binance에서 종목 목록 자동 가져오기

pub mod fundamental;
pub mod symbol_sync;

pub use fundamental::{start_fundamental_collector, FundamentalCollectorConfig};
pub use symbol_sync::{sync_symbols, SymbolSyncConfig};
