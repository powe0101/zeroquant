//! Repository pattern for database operations.
//!
//! 데이터베이스 접근 로직을 라우트 핸들러에서 분리하여 관리합니다.
//! 모든 Repository는 static methods 패턴을 사용합니다.

pub mod backtest_results;
pub mod equity_history;
pub mod execution_cache;
pub mod orders;
pub mod portfolio;
pub mod positions;
pub mod strategies;
pub mod symbol_info;

pub use backtest_results::{
    BacktestResultDto, BacktestResultInput, BacktestResultRecord, BacktestResultsRepository,
    ListResultsFilter, ListResultsResponse as BacktestListResponse,
};
pub use equity_history::{
    EquityHistoryRepository, EquityPoint, ExecutionForSync, MonthlyReturn, PortfolioSnapshot,
    SyncResult,
};
pub use execution_cache::{
    CachedExecution, CacheMeta, ExecutionCacheRepository, ExecutionProvider, NewExecution,
};
pub use orders::{Order, OrderInput, OrderRepository, OrderStatus};
pub use portfolio::{PortfolioRepository, Position, PositionUpdate};
pub use positions::{PositionInput, PositionRecord, PositionRepository};
pub use strategies::StrategyRepository;
pub use symbol_info::{NewSymbolInfo, SymbolInfo, SymbolInfoRepository, SymbolSearchResult};
