/**
 * 심볼 자동완성 컴포넌트
 *
 * 심볼(티커) 입력 시 검색 결과를 드롭다운으로 표시합니다.
 * 디바운스 적용으로 불필요한 API 호출을 방지합니다.
 */
import {
  type Component,
  createSignal,
  createEffect,
  onCleanup,
  Show,
  For,
} from 'solid-js';

// ==================== 타입 ====================

export interface SymbolSearchResult {
  /** 티커 (예: "005930", "AAPL") */
  ticker: string;
  /** 종목명 (예: "삼성전자", "Apple Inc.") */
  name: string;
  /** 시장 (예: "KOSPI", "NASDAQ") */
  market: string;
  /** Yahoo Finance 심볼 */
  yahoo_symbol?: string;
}

export interface SymbolAutocompleteProps {
  /** 현재 선택된 값 */
  value: string;
  /** 값 변경 핸들러 */
  onChange: (value: string) => void;
  /** 시장 필터 (선택사항) */
  market?: 'KR' | 'US' | 'CRYPTO' | 'ALL';
  /** 읽기 전용 */
  readOnly?: boolean;
  /** 플레이스홀더 */
  placeholder?: string;
  /** 에러 상태 */
  hasError?: boolean;
  /** HTML id */
  id?: string;
}

// ==================== API ====================

async function searchSymbols(
  query: string,
  limit: number = 10
): Promise<SymbolSearchResult[]> {
  if (!query.trim()) return [];

  try {
    const response = await fetch(
      `/api/v1/dataset/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );

    if (!response.ok) {
      console.error('Symbol search failed:', response.status);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Symbol search error:', error);
    return [];
  }
}

// ==================== 컴포넌트 ====================

/**
 * 심볼 자동완성 입력 컴포넌트
 *
 * @example
 * ```tsx
 * <SymbolAutocomplete
 *   value={symbol()}
 *   onChange={setSymbol}
 *   placeholder="종목 코드 또는 이름 입력"
 * />
 * ```
 */
export const SymbolAutocomplete: Component<SymbolAutocompleteProps> = (props) => {
  // 상태
  const [inputValue, setInputValue] = createSignal(props.value || '');
  const [results, setResults] = createSignal<SymbolSearchResult[]>([]);
  const [isOpen, setIsOpen] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [highlightIndex, setHighlightIndex] = createSignal(-1);
  const [selectedDisplay, setSelectedDisplay] = createSignal('');

  // refs
  let inputRef: HTMLInputElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let debounceTimer: number | undefined;

  // props.value 변경 시 inputValue 동기화
  createEffect(() => {
    const newValue = props.value || '';
    if (newValue !== inputValue()) {
      setInputValue(newValue);
      // 이미 선택된 값이면 표시명도 설정
      if (newValue) {
        setSelectedDisplay(newValue);
      }
    }
  });

  // 외부 클릭 감지
  createEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef && !containerRef.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    onCleanup(() => document.removeEventListener('mousedown', handleClickOutside));
  });

  // 디바운스 검색
  const handleInputChange = (value: string) => {
    setInputValue(value);
    setSelectedDisplay(''); // 직접 입력 시 표시명 클리어

    // 디바운스 타이머 클리어
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // 빈 값이면 드롭다운 닫기
    if (!value.trim()) {
      setResults([]);
      setIsOpen(false);
      props.onChange('');
      return;
    }

    // 디바운스 적용 (300ms)
    debounceTimer = window.setTimeout(async () => {
      setLoading(true);
      const searchResults = await searchSymbols(value);

      // 시장 필터 적용
      let filtered = searchResults;
      if (props.market && props.market !== 'ALL') {
        filtered = searchResults.filter((r) => {
          if (props.market === 'KR') {
            return r.market === 'KOSPI' || r.market === 'KOSDAQ';
          }
          if (props.market === 'US') {
            return r.market === 'NYSE' || r.market === 'NASDAQ' || r.market === 'AMEX';
          }
          if (props.market === 'CRYPTO') {
            return r.market === 'CRYPTO';
          }
          return true;
        });
      }

      setResults(filtered);
      setIsOpen(filtered.length > 0);
      setHighlightIndex(-1);
      setLoading(false);
    }, 300);
  };

  // 항목 선택
  const handleSelect = (result: SymbolSearchResult) => {
    setInputValue(result.ticker);
    setSelectedDisplay(`${result.ticker} (${result.name})`);
    props.onChange(result.ticker);
    setIsOpen(false);
    setResults([]);
    inputRef?.blur();
  };

  // 키보드 네비게이션
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen()) {
      if (e.key === 'ArrowDown' && results().length > 0) {
        setIsOpen(true);
        setHighlightIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < results().length - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightIndex() >= 0 && highlightIndex() < results().length) {
          handleSelect(results()[highlightIndex()]);
        }
        break;

      case 'Escape':
        setIsOpen(false);
        setHighlightIndex(-1);
        break;
    }
  };

  // 포커스 시 결과가 있으면 드롭다운 열기
  const handleFocus = () => {
    if (results().length > 0) {
      setIsOpen(true);
    }
  };

  // 블러 시 값 확정
  const handleBlur = () => {
    // 선택된 표시명이 없으면 입력값을 그대로 사용
    if (!selectedDisplay() && inputValue()) {
      props.onChange(inputValue());
    }
  };

  // 클린업
  onCleanup(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  });

  return (
    <div ref={containerRef} class="relative">
      {/* 입력 필드 */}
      <div class="relative">
        <input
          ref={inputRef}
          type="text"
          id={props.id}
          value={selectedDisplay() || inputValue()}
          onInput={(e) => handleInputChange(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={props.placeholder || '종목 코드 또는 이름 입력'}
          disabled={props.readOnly}
          class={`
            w-full px-3 py-2 pr-10 border rounded-md
            ${props.hasError
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500'
            }
            dark:bg-gray-700 dark:text-white
            ${props.readOnly ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}
          `}
        />

        {/* 로딩 인디케이터 */}
        <Show when={loading()}>
          <div class="absolute right-3 top-1/2 -translate-y-1/2">
            <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </Show>

        {/* 검색 아이콘 (로딩 아닐 때) */}
        <Show when={!loading()}>
          <div class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </Show>
      </div>

      {/* 드롭다운 결과 */}
      <Show when={isOpen() && results().length > 0}>
        <div
          class="
            absolute z-50 w-full mt-1 bg-white dark:bg-gray-800
            border border-gray-200 dark:border-gray-600 rounded-md shadow-lg
            max-h-60 overflow-y-auto
          "
        >
          <For each={results()}>
            {(result, index) => (
              <button
                type="button"
                class={`
                  w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700
                  flex items-center justify-between
                  ${highlightIndex() === index() ? 'bg-blue-50 dark:bg-blue-900' : ''}
                `}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setHighlightIndex(index())}
              >
                <div>
                  <span class="font-medium text-gray-900 dark:text-white">
                    {result.ticker}
                  </span>
                  <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">
                    {result.name}
                  </span>
                </div>
                <span class="text-xs text-gray-400 dark:text-gray-500">
                  {result.market}
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* 결과 없음 메시지 */}
      <Show when={isOpen() && results().length === 0 && !loading() && inputValue().trim()}>
        <div
          class="
            absolute z-50 w-full mt-1 px-3 py-2
            bg-white dark:bg-gray-800
            border border-gray-200 dark:border-gray-600 rounded-md shadow-lg
            text-sm text-gray-500 dark:text-gray-400
          "
        >
          검색 결과가 없습니다
        </div>
      </Show>
    </div>
  );
};

export default SymbolAutocomplete;
