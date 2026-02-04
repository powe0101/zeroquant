/**
 * SDUI (Server-Driven UI) 타입 정의
 *
 * 백엔드 스키마와 1:1 매핑되는 타입입니다.
 * 참조: crates/trader-core/src/domain/schema.rs
 */

// ==================== 필드 타입 ====================

/**
 * 필드 타입 (백엔드 FieldType enum과 매핑)
 *
 * | 타입 | 백엔드 | UI 컴포넌트 |
 * |------|--------|------------|
 * | integer | Integer | NumberInput (step=1) |
 * | number | Number | NumberInput (step=0.01) |
 * | boolean | Boolean | Switch |
 * | string | String | Input |
 * | select | Select | Dropdown |
 * | multi_select | MultiSelect | Checkboxes |
 * | symbol | Symbol | SymbolAutocomplete |
 * | symbols | Symbols | MultiSymbolInput |
 * | multi_timeframe | MultiTimeframe | MultiTimeframeField |
 */
export type FieldType =
  | 'integer'
  | 'number'
  | 'boolean'
  | 'string'
  | 'select'
  | 'multi_select'
  | 'symbol'
  | 'symbols'
  | 'multi_timeframe';

/**
 * 전략 카테고리
 */
export type StrategyCategory =
  | 'trend'
  | 'mean_reversion'
  | 'momentum'
  | 'volatility'
  | 'arbitrage'
  | 'hybrid'
  | 'ml';

// ==================== 선택 옵션 ====================

/**
 * Select/MultiSelect 필드의 옵션
 */
export interface SelectOption {
  /** 옵션 값 (저장되는 값) */
  value: string;
  /** 표시 라벨 */
  label: string;
  /** 옵션 설명 (선택적) */
  description?: string;
}

// ==================== 필드 스키마 ====================

/**
 * 개별 필드 스키마 (백엔드 FieldSchema와 매핑)
 *
 * @example
 * ```typescript
 * const field: FieldSchema = {
 *   name: 'upper_limit',
 *   field_type: 'number',
 *   label: '상한가',
 *   description: '그리드 상한 가격',
 *   default: 0.1,
 *   min: 0.01,
 *   max: 1.0,
 *   required: true,
 * };
 * ```
 */
export interface FieldSchema {
  /** 필드 키 (예: "upper_limit", "rsi_period") */
  name: string;

  /** 필드 타입 */
  field_type: FieldType;

  /** 표시 라벨 (예: "상한가", "RSI 기간") */
  label: string;

  /** 필드 설명 (툴팁/도움말) */
  description?: string;

  /** 기본값 */
  default?: unknown;

  /** 최소값 (number/integer 타입) */
  min?: number;

  /** 최대값 (number/integer 타입) */
  max?: number;

  /** 선택 옵션 (select/multi_select 타입) */
  options?: SelectOption[];

  /**
   * 조건부 표시 조건식
   *
   * @example "position_sizing_method == 'kelly'"
   * @example "enable_trailing_stop == true"
   */
  condition?: string;

  /** 필수 여부 */
  required: boolean;
}

// ==================== Fragment 참조 ====================

/**
 * Fragment 참조 (섹션 포함 정보)
 *
 * Fragment는 재사용 가능한 필드 그룹입니다.
 * 예: base_config, position_sizing, risk_management
 */
export interface FragmentRef {
  /** Fragment ID (예: "base_config", "position_sizing") */
  id: string;

  /** 필수 여부 (필수 섹션은 접을 수 없음) */
  required: boolean;
}

// ==================== Fragment 상세 ====================

/**
 * Fragment 상세 정보 (API 응답)
 */
export interface SchemaFragment {
  /** Fragment ID */
  id: string;

  /** Fragment 이름 (표시용) */
  name: string;

  /** Fragment 설명 */
  description?: string;

  /** 카테고리 (그룹화용) */
  category: string;

  /** 포함된 필드 목록 */
  fields: FieldSchema[];

  /** 표시 순서 */
  order?: number;
}

// ==================== 전략 UI 스키마 ====================

/**
 * 전략 UI 스키마 (메인 스키마)
 *
 * 백엔드 StrategyUISchema와 1:1 매핑됩니다.
 *
 * @example
 * ```typescript
 * // API 응답 예시
 * const schema: StrategyUISchema = {
 *   id: 'grid',
 *   name: '그리드 전략',
 *   description: '가격 범위 내에서 그리드 매수/매도',
 *   category: 'mean_reversion',
 *   fragments: [
 *     { id: 'base_config', required: true },
 *     { id: 'position_sizing', required: false },
 *   ],
 *   custom_fields: [
 *     { name: 'upper_limit', field_type: 'number', ... },
 *     { name: 'lower_limit', field_type: 'number', ... },
 *   ],
 *   defaults: {
 *     upper_limit: 0.1,
 *     lower_limit: -0.1,
 *     grid_count: 10,
 *   },
 * };
 * ```
 */
export interface StrategyUISchema {
  /** 전략 ID (예: "grid", "rsi", "bollinger") */
  id: string;

  /** 전략 이름 (표시용, 예: "그리드 전략") */
  name: string;

  /** 전략 설명 */
  description: string;

  /** 전략 카테고리 */
  category: StrategyCategory;

  /** 포함된 Fragment 목록 (순서대로 렌더링) */
  fragments: FragmentRef[];

  /** 전략 고유 필드 (Fragment에 없는 필드) */
  custom_fields: FieldSchema[];

  /** 기본값 맵 (Fragment + custom_fields 모든 필드의 기본값) */
  defaults: Record<string, unknown>;
}

// ==================== 섹션 렌더링용 타입 ====================

/**
 * 렌더링용 섹션 정보 (Fragment + fields 결합)
 *
 * SDUISection 컴포넌트에서 사용합니다.
 */
export interface RenderableSection {
  /** 섹션 ID (Fragment ID 또는 'custom') */
  id: string;

  /** 섹션 이름 */
  name: string;

  /** 섹션 설명 */
  description?: string;

  /** 필수 여부 (접기 불가) */
  required: boolean;

  /** 접힘 가능 여부 */
  collapsible: boolean;

  /** 포함된 필드 목록 */
  fields: FieldSchema[];

  /** 표시 순서 */
  order: number;
}

// ==================== 유효성 검증 타입 ====================

/**
 * 필드별 에러 맵
 */
export type ValidationErrors = Record<string, string>;

/**
 * 유효성 검증 결과
 */
export interface ValidationResult {
  /** 유효 여부 */
  valid: boolean;

  /** 에러 맵 (필드명 → 에러 메시지) */
  errors: ValidationErrors;
}

// ==================== 조건 평가 타입 ====================

/**
 * 조건 연산자
 */
export type ConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

/**
 * 파싱된 조건
 */
export interface ParsedCondition {
  /** 참조 필드명 */
  field: string;

  /** 연산자 */
  operator: ConditionOperator;

  /** 비교 값 */
  value: unknown;
}

// ==================== API 응답 타입 ====================

/**
 * 전략 스키마 API 응답
 * GET /api/v1/strategies/{id}/schema
 */
export type GetStrategySchemaResponse = StrategyUISchema;

/**
 * Fragment 목록 API 응답
 * GET /api/v1/schema/fragments
 */
export interface GetFragmentsResponse {
  fragments: SchemaFragment[];
  total: number;
}

/**
 * Fragment 상세 API 응답
 * GET /api/v1/schema/fragments/{id}
 */
export type GetFragmentDetailResponse = SchemaFragment;

// ==================== 유틸리티 타입 ====================

/**
 * 필드 값 타입 (field_type에 따라 달라짐)
 */
export type FieldValue =
  | number      // integer, number
  | boolean    // boolean
  | string     // string, select, symbol
  | string[];  // multi_select, symbols

/**
 * 전략 설정 값 맵
 */
export type StrategyValues = Record<string, FieldValue | unknown>;

/**
 * 필드 변경 이벤트
 */
export interface FieldChangeEvent {
  name: string;
  value: unknown;
  valid: boolean;
}
