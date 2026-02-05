//! 회귀 테스트용 차트 이미지 생성 모듈.
//!
//! 백테스트 결과를 시각화하여 PNG 이미지로 저장합니다.
//!
//! # 생성되는 차트
//!
//! 1. **자산 곡선 (Equity Curve)**: 시간에 따른 포트폴리오 가치 변화
//! 2. **낙폭 차트 (Drawdown Chart)**: 고점 대비 하락률
//! 3. **거래 마커**: 진입/청산 시점 표시

use anyhow::Result;
use chrono::{DateTime, Utc};
use plotters::prelude::*;
use rust_decimal::Decimal;
use std::path::Path;
use trader_analytics::backtest::BacktestReport;
use trader_analytics::performance::EquityPoint;

/// 차트 생성 설정
#[derive(Debug, Clone)]
pub struct ChartConfig {
    /// 차트 너비 (픽셀)
    pub width: u32,
    /// 차트 높이 (픽셀)
    pub height: u32,
    /// 배경색
    pub background_color: RGBColor,
    /// 자산 곡선 색상
    pub equity_color: RGBColor,
    /// 낙폭 색상
    pub drawdown_color: RGBColor,
    /// 그리드 표시 여부
    pub show_grid: bool,
}

impl Default for ChartConfig {
    fn default() -> Self {
        Self {
            width: 1200,
            height: 800,
            background_color: WHITE,
            equity_color: RGBColor(0, 100, 180),    // 파란색
            drawdown_color: RGBColor(200, 50, 50),  // 빨간색
            show_grid: true,
        }
    }
}

/// 회귀 테스트 차트 생성기
pub struct RegressionChartGenerator {
    config: ChartConfig,
}

impl RegressionChartGenerator {
    /// 기본 설정으로 생성
    pub fn new() -> Self {
        Self {
            config: ChartConfig::default(),
        }
    }

    /// 사용자 지정 설정으로 생성
    pub fn with_config(config: ChartConfig) -> Self {
        Self { config }
    }

    /// 백테스트 결과에서 복합 차트 생성
    ///
    /// 하나의 이미지에 자산 곡선과 낙폭 차트를 함께 표시합니다.
    pub fn generate_combined_chart(
        &self,
        report: &BacktestReport,
        strategy_name: &str,
        output_path: &Path,
    ) -> Result<()> {
        if report.equity_curve.is_empty() {
            return Err(anyhow::anyhow!("자산 곡선 데이터가 비어있습니다"));
        }

        let root = BitMapBackend::new(output_path, (self.config.width, self.config.height))
            .into_drawing_area();
        root.fill(&self.config.background_color)?;

        // 상단 70%: 자산 곡선, 하단 30%: 낙폭 차트
        let (upper, lower) = root.split_vertically(self.config.height * 7 / 10);

        // 데이터 범위 계산
        let (time_range, equity_range, drawdown_range) = self.calculate_ranges(&report.equity_curve);

        // 상단: 자산 곡선 차트
        self.draw_equity_curve(
            &upper,
            &report.equity_curve,
            strategy_name,
            &time_range,
            &equity_range,
        )?;

        // 하단: 낙폭 차트
        self.draw_drawdown_chart(
            &lower,
            &report.equity_curve,
            &time_range,
            &drawdown_range,
        )?;

        root.present()?;
        Ok(())
    }

    /// 자산 곡선만 생성
    pub fn generate_equity_chart(
        &self,
        report: &BacktestReport,
        strategy_name: &str,
        output_path: &Path,
    ) -> Result<()> {
        if report.equity_curve.is_empty() {
            return Err(anyhow::anyhow!("자산 곡선 데이터가 비어있습니다"));
        }

        let root = BitMapBackend::new(output_path, (self.config.width, self.config.height))
            .into_drawing_area();
        root.fill(&self.config.background_color)?;

        let (time_range, equity_range, _) = self.calculate_ranges(&report.equity_curve);

        self.draw_equity_curve(
            &root,
            &report.equity_curve,
            strategy_name,
            &time_range,
            &equity_range,
        )?;

        root.present()?;
        Ok(())
    }

    /// 데이터 범위 계산
    fn calculate_ranges(
        &self,
        equity_curve: &[EquityPoint],
    ) -> (
        std::ops::Range<DateTime<Utc>>,
        std::ops::Range<f64>,
        std::ops::Range<f64>,
    ) {
        let start_time = equity_curve.first().map(|p| p.timestamp).unwrap_or_else(Utc::now);
        let end_time = equity_curve.last().map(|p| p.timestamp).unwrap_or_else(Utc::now);

        let equities: Vec<f64> = equity_curve
            .iter()
            .map(|p| decimal_to_f64(p.equity))
            .collect();

        let drawdowns: Vec<f64> = equity_curve
            .iter()
            .map(|p| decimal_to_f64(p.drawdown_pct))
            .collect();

        let min_equity = equities.iter().cloned().fold(f64::INFINITY, f64::min);
        let max_equity = equities.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

        let min_dd = drawdowns.iter().cloned().fold(f64::INFINITY, f64::min);
        let max_dd = drawdowns.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

        // 여백 추가
        let equity_margin = (max_equity - min_equity) * 0.1;
        let dd_margin = (max_dd - min_dd).abs() * 0.1;

        (
            start_time..end_time,
            (min_equity - equity_margin)..(max_equity + equity_margin),
            (min_dd - dd_margin)..(max_dd + dd_margin),
        )
    }

    /// 자산 곡선 차트 그리기
    fn draw_equity_curve<DB: DrawingBackend>(
        &self,
        area: &DrawingArea<DB, plotters::coord::Shift>,
        equity_curve: &[EquityPoint],
        strategy_name: &str,
        time_range: &std::ops::Range<DateTime<Utc>>,
        equity_range: &std::ops::Range<f64>,
    ) -> Result<(), DrawingAreaErrorKind<DB::ErrorType>> {
        let mut chart = ChartBuilder::on(area)
            .caption(
                format!("{} - Equity Curve", strategy_name),
                ("sans-serif", 24).into_font(),
            )
            .margin(10)
            .x_label_area_size(40)
            .y_label_area_size(80)
            .build_cartesian_2d(time_range.clone(), equity_range.clone())?;

        chart
            .configure_mesh()
            .x_labels(10)
            .y_labels(8)
            .y_label_formatter(&|v| format!("{:.0}", v))
            .x_label_formatter(&|dt| dt.format("%Y-%m").to_string())
            .draw()?;

        // 자산 곡선 라인
        let data: Vec<(DateTime<Utc>, f64)> = equity_curve
            .iter()
            .map(|p| (p.timestamp, decimal_to_f64(p.equity)))
            .collect();

        chart.draw_series(LineSeries::new(data.clone(), &self.config.equity_color))?;

        // 영역 채우기 (반투명)
        let fill_color = self.config.equity_color.mix(0.2);
        chart.draw_series(AreaSeries::new(
            data.iter().cloned(),
            equity_range.start,
            fill_color,
        ))?;

        // 주요 지점 마커
        self.add_equity_markers(&mut chart, equity_curve)?;

        Ok(())
    }

    /// 낙폭 차트 그리기
    fn draw_drawdown_chart<DB: DrawingBackend>(
        &self,
        area: &DrawingArea<DB, plotters::coord::Shift>,
        equity_curve: &[EquityPoint],
        time_range: &std::ops::Range<DateTime<Utc>>,
        drawdown_range: &std::ops::Range<f64>,
    ) -> Result<(), DrawingAreaErrorKind<DB::ErrorType>> {
        let mut chart = ChartBuilder::on(area)
            .caption("Drawdown %", ("sans-serif", 18).into_font())
            .margin(10)
            .x_label_area_size(40)
            .y_label_area_size(80)
            .build_cartesian_2d(time_range.clone(), drawdown_range.clone())?;

        chart
            .configure_mesh()
            .x_labels(10)
            .y_labels(5)
            .y_label_formatter(&|v| format!("{:.1}%", v))
            .x_label_formatter(&|dt| dt.format("%Y-%m").to_string())
            .draw()?;

        // 0% 기준선
        chart.draw_series(LineSeries::new(
            vec![
                (time_range.start, 0.0),
                (time_range.end, 0.0),
            ],
            &BLACK.mix(0.3),
        ))?;

        // 낙폭 영역 (아래쪽이 -값)
        let data: Vec<(DateTime<Utc>, f64)> = equity_curve
            .iter()
            .map(|p| (p.timestamp, -decimal_to_f64(p.drawdown_pct))) // 음수로 표시
            .collect();

        let fill_color = self.config.drawdown_color.mix(0.4);
        chart.draw_series(AreaSeries::new(data.iter().cloned(), 0.0, fill_color))?;

        chart.draw_series(LineSeries::new(data, &self.config.drawdown_color))?;

        Ok(())
    }

    /// 자산 곡선에 주요 지점 마커 추가
    fn add_equity_markers<DB: DrawingBackend>(
        &self,
        chart: &mut ChartContext<DB, Cartesian2d<plotters::coord::types::RangedDateTime<DateTime<Utc>>, plotters::coord::types::RangedCoordf64>>,
        equity_curve: &[EquityPoint],
    ) -> Result<(), DrawingAreaErrorKind<DB::ErrorType>> {
        if equity_curve.is_empty() {
            return Ok(());
        }

        // 시작점
        let start = &equity_curve[0];
        chart.draw_series(PointSeries::of_element(
            vec![(start.timestamp, decimal_to_f64(start.equity))],
            5,
            &GREEN,
            &|coord, size, style| EmptyElement::at(coord) + Circle::new((0, 0), size, style.filled()),
        ))?;

        // 종료점
        let end = &equity_curve[equity_curve.len() - 1];
        let end_color = if end.equity >= start.equity { &GREEN } else { &RED };
        chart.draw_series(PointSeries::of_element(
            vec![(end.timestamp, decimal_to_f64(end.equity))],
            5,
            end_color,
            &|coord, size, style| EmptyElement::at(coord) + Circle::new((0, 0), size, style.filled()),
        ))?;

        // 최대 낙폭 지점
        if let Some(max_dd_point) = equity_curve
            .iter()
            .max_by(|a, b| a.drawdown_pct.partial_cmp(&b.drawdown_pct).unwrap_or(std::cmp::Ordering::Equal))
        {
            chart.draw_series(PointSeries::of_element(
                vec![(max_dd_point.timestamp, decimal_to_f64(max_dd_point.equity))],
                7,
                &RED,
                &|coord, size, style| {
                    EmptyElement::at(coord)
                        + Circle::new((0, 0), size, style.stroke_width(2))
                        + Text::new("MDD", (10, -10), ("sans-serif", 12).into_font())
                },
            ))?;
        }

        Ok(())
    }
}

impl Default for RegressionChartGenerator {
    fn default() -> Self {
        Self::new()
    }
}

/// Decimal을 f64로 변환
fn decimal_to_f64(d: Decimal) -> f64 {
    d.to_string().parse().unwrap_or(0.0)
}

/// 회귀 테스트 결과 차트 일괄 생성
///
/// 각 전략의 백테스트 결과를 차트 이미지로 저장합니다.
pub fn generate_regression_charts(
    results: &[(String, String, BacktestReport)], // (strategy_id, name, report)
    output_dir: &Path,
) -> Result<Vec<String>> {
    std::fs::create_dir_all(output_dir)?;

    let generator = RegressionChartGenerator::new();
    let mut generated_files = Vec::new();

    for (strategy_id, name, report) in results {
        // 데이터가 있는 경우에만 차트 생성
        if report.equity_curve.is_empty() {
            println!("  ⚠️  {} - 자산 곡선 데이터 없음 (차트 생략)", strategy_id);
            continue;
        }

        let filename = format!("{}_chart.png", strategy_id);
        let output_path = output_dir.join(&filename);

        match generator.generate_combined_chart(report, name, &output_path) {
            Ok(()) => {
                generated_files.push(output_path.display().to_string());
                println!("  📊 {} - 차트 생성 완료: {}", strategy_id, filename);
            }
            Err(e) => {
                println!("  ⚠️  {} - 차트 생성 실패: {}", strategy_id, e);
            }
        }
    }

    Ok(generated_files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use rust_decimal::prelude::FromPrimitive;

    fn create_test_equity_curve() -> Vec<EquityPoint> {
        let base = Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap();
        (0..100)
            .map(|i| {
                let equity = Decimal::from(10_000_000) + Decimal::from(i * 10000);
                let drawdown = if i > 50 {
                    Decimal::from_f64((i - 50) as f64 / 10.0).unwrap_or(Decimal::ZERO)
                } else {
                    Decimal::ZERO
                };
                EquityPoint {
                    timestamp: base + chrono::Duration::days(i),
                    equity,
                    drawdown_pct: drawdown,
                }
            })
            .collect()
    }

    #[test]
    fn test_chart_generation_config() {
        let config = ChartConfig::default();
        assert_eq!(config.width, 1200);
        assert_eq!(config.height, 800);
    }

    #[test]
    fn test_calculate_ranges() {
        let generator = RegressionChartGenerator::new();
        let equity_curve = create_test_equity_curve();

        let (time_range, equity_range, _dd_range) = generator.calculate_ranges(&equity_curve);

        assert!(time_range.start < time_range.end);
        assert!(equity_range.start < equity_range.end);
    }
}
