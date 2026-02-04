/**
 * SDUI 필드 컴포넌트
 *
 * 필드 타입에 따라 적절한 입력 컴포넌트를 렌더링합니다.
 */
import {
  type Component,
  Switch,
  Match,
  Show,
  For,
  createMemo,
} from 'solid-js';
import type { FieldSchema } from '../../../types/sdui';
import { SymbolAutocomplete, MultiSymbolInput, MultiTimeframeField, type MultiTimeframeValue } from './fields';

// ==================== Props ====================

export interface SDUIFieldProps {
  /** 필드 스키마 */
  field: FieldSchema;

  /** 현재 값 */
  value: unknown;

  /** 에러 메시지 */
  error?: string;

  /** 값 변경 핸들러 */
  onChange: (value: unknown) => void;

  /** 읽기 전용 */
  readOnly?: boolean;
}

// ==================== 컴포넌트 ====================

/**
 * SDUI 필드 컴포넌트
 *
 * @example
 * ```tsx
 * <SDUIField
 *   field={{ name: 'rsi_period', field_type: 'integer', label: 'RSI 기간', required: true }}
 *   value={14}
 *   error={errors()['rsi_period']}
 *   onChange={(v) => handleChange('rsi_period', v)}
 * />
 * ```
 */
export const SDUIField: Component<SDUIFieldProps> = (props) => {
  // 필수 마크
  const requiredMark = createMemo(() => props.field.required ? ' *' : '');

  return (
    <div class="mb-4">
      {/* 라벨 */}
      <label
        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        for={props.field.name}
      >
        {props.field.label}
        <Show when={props.field.required}>
          <span class="text-red-500 ml-1">*</span>
        </Show>
      </label>

      {/* 설명 */}
      <Show when={props.field.description}>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {props.field.description}
        </p>
      </Show>

      {/* 입력 컴포넌트 (타입별 분기) */}
      <Switch>
        {/* 정수 */}
        <Match when={props.field.field_type === 'integer'}>
          <NumberInput
            id={props.field.name}
            value={props.value as number}
            onChange={props.onChange}
            min={props.field.min}
            max={props.field.max}
            step={1}
            readOnly={props.readOnly}
            hasError={!!props.error}
          />
        </Match>

        {/* 실수 */}
        <Match when={props.field.field_type === 'number'}>
          <NumberInput
            id={props.field.name}
            value={props.value as number}
            onChange={props.onChange}
            min={props.field.min}
            max={props.field.max}
            step={0.01}
            readOnly={props.readOnly}
            hasError={!!props.error}
          />
        </Match>

        {/* 불리언 */}
        <Match when={props.field.field_type === 'boolean'}>
          <ToggleSwitch
            id={props.field.name}
            checked={props.value as boolean}
            onChange={props.onChange}
            readOnly={props.readOnly}
          />
        </Match>

        {/* 문자열 */}
        <Match when={props.field.field_type === 'string'}>
          <TextInput
            id={props.field.name}
            value={props.value as string}
            onChange={props.onChange}
            readOnly={props.readOnly}
            hasError={!!props.error}
          />
        </Match>

        {/* 단일 선택 */}
        <Match when={props.field.field_type === 'select'}>
          <SelectInput
            id={props.field.name}
            value={props.value as string}
            options={props.field.options || []}
            onChange={props.onChange}
            readOnly={props.readOnly}
            hasError={!!props.error}
          />
        </Match>

        {/* 다중 선택 */}
        <Match when={props.field.field_type === 'multi_select'}>
          <MultiSelectInput
            id={props.field.name}
            value={props.value as string[]}
            options={props.field.options || []}
            onChange={props.onChange}
            readOnly={props.readOnly}
          />
        </Match>

        {/* 심볼 (자동완성) */}
        <Match when={props.field.field_type === 'symbol'}>
          <SymbolAutocomplete
            id={props.field.name}
            value={props.value as string}
            onChange={(v) => props.onChange(v)}
            placeholder="종목 코드 또는 이름 입력"
            readOnly={props.readOnly}
            hasError={!!props.error}
          />
        </Match>

        {/* 다중 심볼 (드래그 앤 드롭 + maxCount 지원) */}
        <Match when={props.field.field_type === 'symbols'}>
          <MultiSymbolInput
            id={props.field.name}
            value={(props.value as string[]) || []}
            onChange={(v) => props.onChange(v)}
            maxCount={props.field.max}
            enableDragDrop={true}
            readOnly={props.readOnly}
          />
        </Match>

        {/* 다중 타임프레임 (Primary + Secondary 선택) */}
        <Match when={props.field.field_type === 'multi_timeframe'}>
          <MultiTimeframeField
            id={props.field.name}
            value={props.value as MultiTimeframeValue | null}
            onChange={(v) => props.onChange(v)}
            maxSecondary={props.field.max ?? 3}
            readOnly={props.readOnly}
            hasError={!!props.error}
          />
        </Match>
      </Switch>

      {/* 에러 메시지 */}
      <Show when={props.error}>
        <p class="mt-1 text-sm text-red-500">{props.error}</p>
      </Show>

      {/* 범위 힌트 */}
      <Show when={props.field.min !== undefined || props.field.max !== undefined}>
        <p class="mt-1 text-xs text-gray-400">
          <Show when={props.field.min !== undefined}>
            최소: {props.field.min}
          </Show>
          <Show when={props.field.min !== undefined && props.field.max !== undefined}>
            {' / '}
          </Show>
          <Show when={props.field.max !== undefined}>
            최대: {props.field.max}
          </Show>
        </p>
      </Show>
    </div>
  );
};

// ==================== 내부 컴포넌트 ====================

interface NumberInputProps {
  id: string;
  value: number;
  onChange: (value: unknown) => void;
  min?: number;
  max?: number;
  step?: number;
  readOnly?: boolean;
  hasError?: boolean;
}

const NumberInput: Component<NumberInputProps> = (props) => {
  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = props.step === 1
      ? parseInt(target.value, 10)
      : parseFloat(target.value);
    props.onChange(isNaN(value) ? 0 : value);
  };

  return (
    <input
      type="number"
      id={props.id}
      value={props.value ?? ''}
      onInput={handleChange}
      min={props.min}
      max={props.max}
      step={props.step}
      disabled={props.readOnly}
      class={`
        w-full px-3 py-2 border rounded-md
        ${props.hasError
          ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
          : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500'
        }
        dark:bg-gray-700 dark:text-white
        ${props.readOnly ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}
      `}
    />
  );
};

interface TextInputProps {
  id: string;
  value: string;
  onChange: (value: unknown) => void;
  placeholder?: string;
  readOnly?: boolean;
  hasError?: boolean;
}

const TextInput: Component<TextInputProps> = (props) => {
  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    props.onChange(target.value);
  };

  return (
    <input
      type="text"
      id={props.id}
      value={props.value ?? ''}
      onInput={handleChange}
      placeholder={props.placeholder}
      disabled={props.readOnly}
      class={`
        w-full px-3 py-2 border rounded-md
        ${props.hasError
          ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
          : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500'
        }
        dark:bg-gray-700 dark:text-white
        ${props.readOnly ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}
      `}
    />
  );
};

interface ToggleSwitchProps {
  id: string;
  checked: boolean;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
}

const ToggleSwitch: Component<ToggleSwitchProps> = (props) => {
  const handleChange = () => {
    if (!props.readOnly) {
      props.onChange(!props.checked);
    }
  };

  return (
    <button
      type="button"
      id={props.id}
      role="switch"
      aria-checked={props.checked}
      onClick={handleChange}
      disabled={props.readOnly}
      class={`
        relative inline-flex h-6 w-11 items-center rounded-full
        transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${props.checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}
        ${props.readOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        class={`
          inline-block h-4 w-4 transform rounded-full bg-white
          transition-transform
          ${props.checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
};

interface SelectInputProps {
  id: string;
  value: string;
  options: Array<{ value: string; label: string; description?: string }>;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
  hasError?: boolean;
}

const SelectInput: Component<SelectInputProps> = (props) => {
  const handleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    props.onChange(target.value);
  };

  return (
    <select
      id={props.id}
      value={props.value ?? ''}
      onChange={handleChange}
      disabled={props.readOnly}
      class={`
        w-full px-3 py-2 border rounded-md
        ${props.hasError
          ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
          : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500'
        }
        dark:bg-gray-700 dark:text-white
        ${props.readOnly ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}
      `}
    >
      <option value="">선택하세요</option>
      <For each={props.options}>
        {(option) => (
          <option value={option.value}>
            {option.label}
          </option>
        )}
      </For>
    </select>
  );
};

interface MultiSelectInputProps {
  id: string;
  value: string[];
  options: Array<{ value: string; label: string; description?: string }>;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
}

const MultiSelectInput: Component<MultiSelectInputProps> = (props) => {
  const handleChange = (optionValue: string, checked: boolean) => {
    if (props.readOnly) return;

    const currentValue = props.value || [];
    const newValue = checked
      ? [...currentValue, optionValue]
      : currentValue.filter((v) => v !== optionValue);
    props.onChange(newValue);
  };

  const isChecked = (optionValue: string) =>
    (props.value || []).includes(optionValue);

  return (
    <div class="space-y-2">
      <For each={props.options}>
        {(option) => (
          <label
            class={`
              flex items-center gap-2
              ${props.readOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
            `}
          >
            <input
              type="checkbox"
              checked={isChecked(option.value)}
              onChange={(e) => handleChange(option.value, e.currentTarget.checked)}
              disabled={props.readOnly}
              class="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
            />
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {option.label}
            </span>
            <Show when={option.description}>
              <span class="text-xs text-gray-500">
                ({option.description})
              </span>
            </Show>
          </label>
        )}
      </For>
    </div>
  );
};

export default SDUIField;
