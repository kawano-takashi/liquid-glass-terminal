import { ArrowDown, ArrowUp, CaseSensitive, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface SearchBarProps {
  query: string;
  caseSensitive: boolean;
  noMatches: boolean;
  labels: {
    search: string;
    previous: string;
    next: string;
    caseSensitive: string;
    close: string;
    noMatches: string;
  };
  onQuery(value: string): void;
  onCaseSensitive(value: boolean): void;
  onNext(): void;
  onPrevious(): void;
  onClose(): void;
}

export function SearchBar({
  query,
  caseSensitive,
  noMatches,
  labels,
  onQuery,
  onCaseSensitive,
  onNext,
  onPrevious,
  onClose,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <div className="search-bar" role="search">
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder={labels.search}
        aria-label={labels.search}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            if (event.shiftKey) onPrevious();
            else onNext();
          }
          if (event.key === 'Escape') onClose();
        }}
      />
      {noMatches && <span className="search-status">{labels.noMatches}</span>}
      <button
        type="button"
        className="icon-button"
        aria-label={labels.previous}
        onClick={onPrevious}
      >
        <ArrowUp size={15} />
      </button>
      <button type="button" className="icon-button" aria-label={labels.next} onClick={onNext}>
        <ArrowDown size={15} />
      </button>
      <button
        type="button"
        className="icon-button"
        data-active={caseSensitive}
        aria-pressed={caseSensitive}
        aria-label={labels.caseSensitive}
        onClick={() => onCaseSensitive(!caseSensitive)}
      >
        <CaseSensitive size={17} />
      </button>
      <button type="button" className="icon-button" aria-label={labels.close} onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}
