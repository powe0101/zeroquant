/**
 * 폼 컴포넌트
 *
 * 입력 필드, 선택 박스, 필터 패널 등 폼 관련 컴포넌트를 제공합니다.
 */
import { type Component, type JSX, For, Show } from 'solid-js'

// ==================== Select ====================

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  /** 현재 선택된 값 */
  value: string
  /** 값 변경 핸들러 */
  onChange: (value: string) => void
  /** 옵션 목록 */
  options: SelectOption[]
  /** 라벨 */
  label?: string
  /** 플레이스홀더 */
  placeholder?: string
  /** 비활성화 여부 */
  disabled?: boolean
  /** 크기 */
  size?: 'sm' | 'md' | 'lg'
  /** 추가 CSS 클래스 */
  className?: string
}

/**
 * 선택 박스 컴포넌트
 *
 * @example
 * ```tsx
 * <Select
 *   label="시장"
 *   value={market()}
 *   onChange={setMarket}
 *   options={[
 *     { value: '', label: '전체' },
 *     { value: 'KR', label: '한국' },
 *   ]}
 * />
 * ```
 */
export const Select: Component<SelectProps> = (props) => {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base',
  }

  return (
    <div class={`flex flex-col gap-1 ${props.className || ''}`}>
      <Show when={props.label}>
        <label class="text-xs font-medium text-gray-600 dark:text-gray-400">{props.label}</label>
      </Show>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        disabled={props.disabled}
        class={`
          border border-gray-300 dark:border-gray-600 rounded-md
          bg-white dark:bg-gray-700 text-gray-900 dark:text-white
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed
          ${sizeClasses[props.size || 'md']}
        `}
      >
        <Show when={props.placeholder}>
          <option value="" disabled>
            {props.placeholder}
          </option>
        </Show>
        <For each={props.options}>
          {(opt) => (
            <option value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          )}
        </For>
      </select>
    </div>
  )
}

// ==================== Input ====================

export interface InputProps {
  /** 현재 값 */
  value: string | number
  /** 값 변경 핸들러 */
  onInput: (value: string) => void
  /** 입력 타입 */
  type?: 'text' | 'number' | 'email' | 'password' | 'search'
  /** 라벨 */
  label?: string
  /** 플레이스홀더 */
  placeholder?: string
  /** 비활성화 여부 */
  disabled?: boolean
  /** 크기 */
  size?: 'sm' | 'md' | 'lg'
  /** 최소값 (number 타입) */
  min?: number
  /** 최대값 (number 타입) */
  max?: number
  /** 단계 (number 타입) */
  step?: number
  /** 너비 클래스 */
  width?: string
  /** 추가 CSS 클래스 */
  className?: string
}

/**
 * 입력 필드 컴포넌트
 *
 * @example
 * ```tsx
 * <Input
 *   label="최소 점수"
 *   type="number"
 *   value={minScore()}
 *   onInput={setMinScore}
 *   min={0}
 *   max={100}
 *   width="w-24"
 * />
 * ```
 */
export const Input: Component<InputProps> = (props) => {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base',
  }

  return (
    <div class={`flex flex-col gap-1 ${props.className || ''}`}>
      <Show when={props.label}>
        <label class="text-xs font-medium text-gray-600 dark:text-gray-400">{props.label}</label>
      </Show>
      <input
        type={props.type || 'text'}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        min={props.min}
        max={props.max}
        step={props.step}
        class={`
          border border-gray-300 dark:border-gray-600 rounded-md
          bg-white dark:bg-gray-700 text-gray-900 dark:text-white
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed
          ${sizeClasses[props.size || 'md']}
          ${props.width || ''}
        `}
      />
    </div>
  )
}

// ==================== Filter Panel ====================

export interface FilterPanelProps {
  children: JSX.Element
  /** 추가 CSS 클래스 */
  className?: string
}

/**
 * 필터 패널 컨테이너
 *
 * 여러 필터 컴포넌트를 그룹화하여 표시합니다.
 *
 * @example
 * ```tsx
 * <FilterPanel>
 *   <Select ... />
 *   <Select ... />
 *   <Input ... />
 * </FilterPanel>
 * ```
 */
export const FilterPanel: Component<FilterPanelProps> = (props) => {
  return (
    <div
      class={`
        flex flex-wrap gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg
        ${props.className || ''}
      `}
    >
      {props.children}
    </div>
  )
}

// ==================== Button ====================

export interface ButtonProps {
  children: JSX.Element
  /** 버튼 타입 */
  type?: 'button' | 'submit' | 'reset'
  /** 버튼 스타일 변형 */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  /** 크기 */
  size?: 'sm' | 'md' | 'lg'
  /** 비활성화 여부 */
  disabled?: boolean
  /** 로딩 상태 */
  loading?: boolean
  /** 클릭 핸들러 */
  onClick?: () => void
  /** 추가 CSS 클래스 */
  className?: string
}

/**
 * 버튼 컴포넌트
 *
 * @example
 * ```tsx
 * <Button variant="primary" onClick={submit} loading={isLoading()}>
 *   저장
 * </Button>
 * ```
 */
export const Button: Component<ButtonProps> = (props) => {
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    ghost: 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300',
  }

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  return (
    <button
      type={props.type || 'button'}
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      class={`
        font-medium rounded-lg transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        flex items-center justify-center gap-2
        ${variantClasses[props.variant || 'primary']}
        ${sizeClasses[props.size || 'md']}
        ${props.className || ''}
      `}
    >
      <Show when={props.loading}>
        <span class="animate-spin">⏳</span>
      </Show>
      {props.children}
    </button>
  )
}

// ==================== Search Input ====================

export interface SearchInputProps {
  /** 현재 값 */
  value: string
  /** 값 변경 핸들러 */
  onInput: (value: string) => void
  /** 플레이스홀더 */
  placeholder?: string
  /** 검색 실행 핸들러 (Enter 키) */
  onSearch?: (value: string) => void
  /** 크기 */
  size?: 'sm' | 'md' | 'lg'
  /** 추가 CSS 클래스 */
  className?: string
}

/**
 * 검색 입력 필드
 *
 * 검색 아이콘과 함께 표시되는 입력 필드입니다.
 */
export const SearchInput: Component<SearchInputProps> = (props) => {
  const sizeClasses = {
    sm: 'pl-8 pr-3 py-1 text-xs',
    md: 'pl-10 pr-4 py-2 text-sm',
    lg: 'pl-12 pr-5 py-3 text-base',
  }

  const iconSizes = {
    sm: 'w-3 h-3 left-2.5',
    md: 'w-4 h-4 left-3',
    lg: 'w-5 h-5 left-4',
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && props.onSearch) {
      props.onSearch(props.value)
    }
  }

  return (
    <div class={`relative ${props.className || ''}`}>
      <svg
        class={`absolute top-1/2 -translate-y-1/2 text-gray-400 ${iconSizes[props.size || 'md']}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="search"
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={props.placeholder || '검색...'}
        class={`
          w-full border border-gray-300 dark:border-gray-600 rounded-md
          bg-white dark:bg-gray-700 text-gray-900 dark:text-white
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          ${sizeClasses[props.size || 'md']}
        `}
      />
    </div>
  )
}

export default Select
