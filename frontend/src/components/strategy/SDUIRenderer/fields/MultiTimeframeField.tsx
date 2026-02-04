/**
 * 다중 타임프레임 선택 필드 컴포넌트
 *
 * Primary 타임프레임과 Secondary 타임프레임(들)을 선택할 수 있습니다.
 * Secondary는 반드시 Primary보다 큰 타임프레임만 선택 가능합니다.
 */
import {
  type Component,
  createSignal,
  createMemo,
  For,
  Show,
} from 'solid-js';
import type { Timeframe } from '../../../../api/client';

// ==================== 타입 ====================

/** 다중 타임프레임 설정 값 */
export interface MultiTimeframeValue {
  /** Primary 타임프레임 (전략 실행 기준) */
  primary: Timeframe;
  /** Secondary 타임프레임 목록 (추세 확인용) */
  secondary: Timeframe[];
}

export interface MultiTimeframeFieldProps {
  /** HTML id */
  id?: string;
  /** 현재 값 */
  value: MultiTimeframeValue | null;
  /** 값 변경 핸들러 */
  onChange: (value: MultiTimeframeValue) => void;
  /** 읽기 전용 */
  readOnly?: boolean;
  /** 에러 상태 */
  hasError?: boolean;
  /** 최대 Secondary 개수 */
  maxSecondary?: number;
}

// ==================== 상수 ====================

/** 타임프레임 목록 (작은 것부터 큰 것 순서) */
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];

/** 타임프레임 라벨 */
const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1m': '1분',
  '5m': '5분',
  '15m': '15분',
  '30m': '30분',
  '1h': '1시간',
  '4h': '4시간',
  '1d': '일봉',
  '1w': '주봉',
  '1M': '월봉',
};

/** 타임프레임 인덱스 (크기 비교용) */
const TIMEFRAME_INDEX: Record<Timeframe, number> = {
  '1m': 0,
  '5m': 1,
  '15m': 2,
  '30m': 3,
  '1h': 4,
  '4h': 5,
  '1d': 6,
  '1w': 7,
  '1M': 8,
};

// ==================== 컴포넌트 ====================

/**
 * 다중 타임프레임 선택 필드
 *
 * @example
 * ```tsx
 * <MultiTimeframeField
 *   value={{ primary: '5m', secondary: ['1h', '1d'] }}
 *   onChange={(v) => setConfig(prev => ({ ...prev, multi_timeframe: v }))}
 * />
 * ```
 */
export const MultiTimeframeField: Component<MultiTimeframeFieldProps> = (props) => {
  const maxSecondary = () => props.maxSecondary ?? 3;

  // 기본값
  const value = () => props.value ?? { primary: '5m' as Timeframe, secondary: [] as Timeframe[] };

  // Primary 선택 가능한 타임프레임 (Secondary보다 작아야 함)
  const availablePrimary = createMemo(() => {
    const secondary = value().secondary;
    if (secondary.length === 0) return TIMEFRAMES;

    const minSecondaryIndex = Math.min(...secondary.map(tf => TIMEFRAME_INDEX[tf]));
    return TIMEFRAMES.filter(tf => TIMEFRAME_INDEX[tf] < minSecondaryIndex);
  });

  // Secondary 선택 가능한 타임프레임 (Primary보다 커야 함)
  const availableSecondary = createMemo(() => {
    const primary = value().primary;
    const primaryIndex = TIMEFRAME_INDEX[primary];
    return TIMEFRAMES.filter(tf => TIMEFRAME_INDEX[tf] > primaryIndex);
  });

  // Primary 변경
  const handlePrimaryChange = (tf: Timeframe) => {
    if (props.readOnly) return;

    const currentSecondary = value().secondary;
    const primaryIndex = TIMEFRAME_INDEX[tf];

    // Primary보다 작거나 같은 Secondary 제거
    const validSecondary = currentSecondary.filter(
      s => TIMEFRAME_INDEX[s] > primaryIndex
    );

    props.onChange({
      primary: tf,
      secondary: validSecondary,
    });
  };

  // Secondary 토글
  const handleSecondaryToggle = (tf: Timeframe) => {
    if (props.readOnly) return;

    const currentSecondary = value().secondary;

    if (currentSecondary.includes(tf)) {
      // 제거
      props.onChange({
        ...value(),
        secondary: currentSecondary.filter(s => s !== tf),
      });
    } else if (currentSecondary.length < maxSecondary()) {
      // 추가
      props.onChange({
        ...value(),
        secondary: [...currentSecondary, tf],
      });
    }
  };

  // Secondary 선택 여부
  const isSecondarySelected = (tf: Timeframe) => value().secondary.includes(tf);

  // 선택된 TF 요약
  const selectedSummary = createMemo(() => {
    const v = value();
    const parts = [`Primary: ${TIMEFRAME_LABELS[v.primary]}`];
    if (v.secondary.length > 0) {
      parts.push(`Secondary: ${v.secondary.map(tf => TIMEFRAME_LABELS[tf]).join(', ')}`);
    }
    return parts.join(' | ');
  });

  return (
    <div
      class={`
        rounded-lg border p-4
        ${props.hasError
          ? 'border-red-500'
          : 'border-gray-300 dark:border-gray-600'
        }
        ${props.readOnly ? 'opacity-60' : ''}
      `}
    >
      {/* Primary 타임프레임 선택 */}
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Primary 타임프레임
          <span class="ml-1 text-xs text-gray-500">(전략 실행 기준)</span>
        </label>
        <div class="flex flex-wrap gap-2">
          <For each={availablePrimary()}>
            {(tf) => (
              <button
                type="button"
                onClick={() => handlePrimaryChange(tf)}
                disabled={props.readOnly}
                class={`
                  px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${value().primary === tf
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }
                  ${props.readOnly ? 'cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {TIMEFRAME_LABELS[tf]}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Secondary 타임프레임 선택 */}
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Secondary 타임프레임
          <span class="ml-1 text-xs text-gray-500">
            (추세 확인용, 최대 {maxSecondary()}개)
          </span>
        </label>
        <div class="flex flex-wrap gap-2">
          <For each={availableSecondary()}>
            {(tf) => {
              const selected = () => isSecondarySelected(tf);
              const disabled = () =>
                props.readOnly ||
                (!selected() && value().secondary.length >= maxSecondary());

              return (
                <button
                  type="button"
                  onClick={() => handleSecondaryToggle(tf)}
                  disabled={disabled()}
                  class={`
                    px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${selected()
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }
                    ${disabled()
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  {TIMEFRAME_LABELS[tf]}
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* 선택 요약 */}
      <div class="pt-3 border-t border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-sm text-gray-600 dark:text-gray-400">
            {selectedSummary()}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MultiTimeframeField;
