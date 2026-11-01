import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUpLeft, CornerDownLeft, Files, Search, UserRound, Users, Vote, X } from 'lucide-react';
import {
  GROUP_LABELS,
  highlight,
  search,
  type SearchAction,
  type SearchGroup,
  type SearchIndex,
} from '../../lib/search';

type Props = {
  index: SearchIndex;
  /** Called with what the chosen result opens (a document, a vote session or a page). */
  onSelect: (action: SearchAction) => void;
  /** Called when the user wants every match in the document library (Enter with nothing chosen). */
  onSeeAll: (query: string) => void;
};

const GROUP_ICONS: Record<SearchGroup, ReactNode> = {
  pages: <ArrowUpLeft size={17} />,
  documents: <Files size={17} />,
  votes: <Vote size={17} />,
  committees: <Users size={17} />,
  users: <UserRound size={17} />,
};

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Title with the matching parts highlighted. */
function Highlighted({ text, query }: { text: string; query: string }) {
  return <>{highlight(text, query).map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : part.text))}</>;
}

/**
 * Workspace search with a dropdown (ARIA combobox). Searches documents of every year, vote sessions,
 * committees and pages (plus users for the developer). Keyboard: ↑/↓ move, Enter opens, Esc closes,
 * "/" or Ctrl/⌘+K focuses the box from anywhere.
 */
export function SearchBox({ index, onSelect, onSeeAll }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => search(index, query), [index, query]);
  const hasQuery = query.trim().length > 0;
  const optionId = (position: number) => `${listId}-option-${position}`;

  // Global shortcuts that focus the search.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const shortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (shortcut || (event.key === '/' && !isTypingTarget(event.target))) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close when clicking outside.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  // Keep the highlighted option visible while moving with the keyboard.
  useEffect(() => {
    if (open) document.getElementById(`${listId}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, listId]);

  function choose(position: number) {
    const result = results[position];
    if (!result) return;
    onSelect(result.action);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }

  function seeAll() {
    onSeeAll(query.trim());
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (results.length) setActive(current => (current + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && results[active]) choose(active);
      else if (hasQuery) seeAll();
    } else if (event.key === 'Escape') {
      if (open) setOpen(false);
      else setQuery('');
    }
  }

  let lastGroup: SearchGroup | null = null;
  return (
    <div className="search-box" ref={rootRef}>
      <label className="global-search">
        <Search size={17} />
        <input
          ref={inputRef}
          role="combobox"
          aria-label="البحث في مساحة العمل"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results.length ? optionId(active) : undefined}
          autoComplete="off"
          placeholder="ابحث في المستندات والتصويت واللجان…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={event => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="search-clear"
            aria-label="مسح البحث"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X size={15} />
          </button>
        ) : (
          <kbd aria-hidden="true">/</kbd>
        )}
      </label>
      {open && (
        <div className="search-panel" id={listId} role="listbox" aria-label="نتائج البحث">
          {results.map((result, position) => {
            const heading = result.group !== lastGroup;
            lastGroup = result.group;
            return (
              <div key={result.key} role="presentation">
                {heading && (
                  <div className="search-group" role="presentation">
                    {hasQuery ? GROUP_LABELS[result.group] : 'انتقال سريع'}
                  </div>
                )}
                <div
                  id={optionId(position)}
                  role="option"
                  aria-selected={position === active}
                  className={`search-option ${position === active ? 'active' : ''}`}
                  onPointerEnter={() => setActive(position)}
                  onClick={() => choose(position)}
                >
                  <span className="search-icon">{GROUP_ICONS[result.group]}</span>
                  <span className="search-text">
                    <strong>
                      <Highlighted text={result.title} query={query} />
                    </strong>
                    <small>{result.subtitle}</small>
                  </span>
                  {result.badge && <span className="search-badge">{result.badge}</span>}
                </div>
              </div>
            );
          })}
          {hasQuery && !results.length && (
            <div className="search-empty" role="presentation">
              لا توجد نتائج لـ «{query.trim()}». جرّب كلمة أخرى أو جزءًا من الاسم.
            </div>
          )}
          <div className="search-footer" role="presentation">
            <span>
              <CornerDownLeft size={13} /> فتح
            </span>
            <span>↑↓ تنقّل</span>
            <span>Esc إغلاق</span>
            {hasQuery && (
              <button type="button" className="text-link" onClick={seeAll}>
                عرض كل النتائج في المستندات
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
