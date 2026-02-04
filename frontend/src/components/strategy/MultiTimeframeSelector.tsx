/**
 * 다중 타임프레임 선택 컴포넌트.
 *
 * 전략 설정에서 Primary 타임프레임과 Secondary 타임프레임을 선택하는 UI를 제공합니다.
 *
 * @example
 * ```tsx
 * <MultiTimeframeSelector
 *   primary="5m"
 *   secondary={["1h", "1d"]}
 *   onChange={(primary, secondary) => console.log(primary, secondary)}
 * />
 * ```
 */

import { createSignal, For, createMemo, Show } from "solid-js";

/** 지원되는 타임프레임 */
const TIMEFRAMES = [
  { value: "1m", label: "1분", minutes: 1 },
  { value: "3m", label: "3분", minutes: 3 },
  { value: "5m", label: "5분", minutes: 5 },
  { value: "15m", label: "15분", minutes: 15 },
  { value: "30m", label: "30분", minutes: 30 },
  { value: "1h", label: "1시간", minutes: 60 },
  { value: "4h", label: "4시간", minutes: 240 },
  { value: "1d", label: "1일", minutes: 1440 },
  { value: "1w", label: "1주", minutes: 10080 },
  { value: "1M", label: "1월", minutes: 43200 },
] as const;

type TimeframeValue = (typeof TIMEFRAMES)[number]["value"];

interface MultiTimeframeSelectorProps {
  /** Primary 타임프레임 (실행 타임프레임) */
  primary: string;
  /** Secondary 타임프레임 목록 (분석용) */
  secondary: string[];
  /** 최대 Secondary 타임프레임 수 */
  maxSecondary?: number;
  /** 변경 콜백 */
  onChange: (primary: string, secondary: string[]) => void;
  /** 비활성화 여부 */
  disabled?: boolean;
}

/**
 * 다중 타임프레임 선택 컴포넌트.
 *
 * Primary 타임프레임보다 큰 타임프레임만 Secondary로 선택 가능합니다.
 */
export function MultiTimeframeSelector(props: MultiTimeframeSelectorProps) {
  const maxSecondary = () => props.maxSecondary ?? 3;

  // Primary 타임프레임의 분 단위 값
  const primaryMinutes = createMemo(() => {
    const tf = TIMEFRAMES.find((t) => t.value === props.primary);
    return tf?.minutes ?? 5;
  });

  // Secondary로 선택 가능한 타임프레임 (Primary보다 큰 것만)
  const availableSecondary = createMemo(() => {
    return TIMEFRAMES.filter((tf) => tf.minutes > primaryMinutes());
  });

  // Primary 변경 핸들러
  const handlePrimaryChange = (value: string) => {
    const newPrimaryMinutes =
      TIMEFRAMES.find((t) => t.value === value)?.minutes ?? 5;

    // Secondary 중 새 Primary보다 작거나 같은 것은 제거
    const validSecondary = props.secondary.filter((s) => {
      const sMinutes = TIMEFRAMES.find((t) => t.value === s)?.minutes ?? 0;
      return sMinutes > newPrimaryMinutes;
    });

    props.onChange(value, validSecondary);
  };

  // Secondary 토글 핸들러
  const handleSecondaryToggle = (value: string) => {
    const current = new Set(props.secondary);

    if (current.has(value)) {
      current.delete(value);
    } else if (current.size < maxSecondary()) {
      current.add(value);
    }

    // 타임프레임 순서대로 정렬
    const sorted = Array.from(current).sort((a, b) => {
      const aMin = TIMEFRAMES.find((t) => t.value === a)?.minutes ?? 0;
      const bMin = TIMEFRAMES.find((t) => t.value === b)?.minutes ?? 0;
      return aMin - bMin;
    });

    props.onChange(props.primary, sorted);
  };

  return (
    <div class="space-y-4">
      {/* Primary 타임프레임 선택 */}
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Primary 타임프레임 (실행 기준)
        </label>
        <select
          value={props.primary}
          onChange={(e) => handlePrimaryChange(e.target.value)}
          disabled={props.disabled}
          class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white
                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <For each={TIMEFRAMES}>
            {(tf) => <option value={tf.value}>{tf.label}</option>}
          </For>
        </select>
        <p class="mt-1 text-xs text-gray-400">
          신호 생성 및 백테스트의 기준이 되는 타임프레임
        </p>
      </div>

      {/* Secondary 타임프레임 선택 */}
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">
          Secondary 타임프레임 (분석용) - 최대 {maxSecondary()}개
        </label>

        <Show
          when={availableSecondary().length > 0}
          fallback={
            <p class="text-sm text-gray-400">
              가장 큰 타임프레임이 선택되어 Secondary를 추가할 수 없습니다.
            </p>
          }
        >
          <div class="flex flex-wrap gap-2">
            <For each={availableSecondary()}>
              {(tf) => {
                const isSelected = () => props.secondary.includes(tf.value);
                const isDisabled = () =>
                  props.disabled ||
                  (!isSelected() && props.secondary.length >= maxSecondary());

                return (
                  <button
                    type="button"
                    onClick={() => handleSecondaryToggle(tf.value)}
                    disabled={isDisabled()}
                    class={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                      ${
                        isSelected()
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }
                      ${
                        isDisabled()
                          ? "opacity-50 cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                  >
                    {tf.label}
                  </button>
                );
              }}
            </For>
          </div>
        </Show>

        <p class="mt-2 text-xs text-gray-400">
          추세 확인 및 필터링에 사용되는 상위 타임프레임
        </p>
      </div>

      {/* 선택된 타임프레임 요약 */}
      <Show when={props.secondary.length > 0}>
        <div class="p-3 bg-gray-800 rounded-lg border border-gray-700">
          <h4 class="text-sm font-medium text-gray-300 mb-2">
            다중 타임프레임 구성
          </h4>
          <div class="flex items-center gap-2 text-sm">
            <span class="px-2 py-1 bg-green-600/20 text-green-400 rounded">
              Primary: {TIMEFRAMES.find((t) => t.value === props.primary)?.label}
            </span>
            <span class="text-gray-500">+</span>
            <For each={props.secondary}>
              {(s) => (
                <span class="px-2 py-1 bg-blue-600/20 text-blue-400 rounded">
                  {TIMEFRAMES.find((t) => t.value === s)?.label}
                </span>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default MultiTimeframeSelector;
