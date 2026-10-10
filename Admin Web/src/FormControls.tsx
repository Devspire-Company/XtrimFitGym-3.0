import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type SelectOption = { value: string; label: string; disabled?: boolean };

export const formatMobileNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 11)].filter(Boolean).join(' ');
};

export const capitalizeNameParts = (value: string) =>
  value.replace(/(^|[\s'-])([a-z])/g, (_match, separator: string, letter: string) =>
    `${separator}${letter.toUpperCase()}`,
  );

type PremiumSelectProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  placement?: 'down' | 'up';
};

export function PremiumSelect({ name, value, defaultValue = '', onChange, options, placeholder, required, disabled, ariaLabel, placement = 'down' }: PremiumSelectProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const selectedValue = controlled ? value : internalValue;
  const selected = options.find((option) => option.value === selectedValue);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const choose = (nextValue: string) => {
    if (!controlled) setInternalValue(nextValue);
    onChange?.(nextValue);
    setOpen(false);
  };

  return <div className={`premium-select ${open ? 'is-open' : ''} ${placement === 'up' ? 'open-up' : ''}`} ref={root}>
    {name && <input type="hidden" name={name} value={selectedValue} />}
    <button
      id={id}
      type="button"
      className="premium-select-trigger"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
        if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && !open) {
          event.preventDefault();
          setOpen(true);
        }
      }}
    >
      <span className={selected ? '' : 'premium-select-placeholder'}>{selected?.label ?? placeholder}</span>
      <ChevronDown aria-hidden="true" />
    </button>
    {required && <input className="premium-control-validator" tabIndex={-1} required value={selectedValue} onChange={() => undefined} aria-hidden="true" />}
    {open && <div className="premium-select-menu" role="listbox" aria-labelledby={id}>
      {options.map((option) => <button
        type="button"
        role="option"
        aria-selected={option.value === selectedValue}
        className={option.value === selectedValue ? 'selected' : ''}
        disabled={option.disabled}
        key={option.value}
        onClick={() => choose(option.value)}
      >{option.label}</button>)}
    </div>}
  </div>;
}

type PremiumDatePickerProps = {
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  min?: string;
  max?: string;
  variant?: 'calendar' | 'wheel';
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (value: number) => String(value).padStart(2, '0');
const toYmd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromYmd = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : undefined;
};
const dateLabel = (value: string) => fromYmd(value)?.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) ?? '';

const WHEEL_ITEM_HEIGHT = 42;

type DateWheelProps = {
  label: string;
  values: number[];
  selected: number;
  display: (value: number) => string;
  onChange: (value: number) => void;
};

function DateWheel({ label, values, selected, display, onChange }: DateWheelProps) {
  const list = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const index = values.indexOf(selected);
    if (index >= 0 && list.current) list.current.scrollTo({ top: index * WHEEL_ITEM_HEIGHT });
  }, [selected, values]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const settle = () => {
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const element = list.current;
      if (!element || values.length === 0) return;
      const index = Math.max(0, Math.min(values.length - 1, Math.round(element.scrollTop / WHEEL_ITEM_HEIGHT)));
      element.scrollTo({ top: index * WHEEL_ITEM_HEIGHT, behavior: 'smooth' });
      if (values[index] !== selected) onChange(values[index]);
    }, 80);
  };

  return <div className="date-wheel-group">
    <span>{label}</span>
    <div className="date-wheel" ref={list} role="listbox" aria-label={label} onScroll={settle}>
      {values.map((wheelValue) => <button
        type="button"
        role="option"
        aria-selected={wheelValue === selected}
        className={wheelValue === selected ? 'selected' : ''}
        key={wheelValue}
        onClick={() => onChange(wheelValue)}
      >{display(wheelValue)}</button>)}
    </div>
  </div>;
}

function PremiumWheelDatePicker({ name, defaultValue = '', value, onChange, placeholder = 'Select a date', required, min, max }: PremiumDatePickerProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlled ? value : internalValue;
  const [open, setOpen] = useState(false);
  const today = new Date();
  const minDate = fromYmd(min ?? '1900-01-01') ?? new Date(1900, 0, 1);
  const maxDate = fromYmd(max ?? toYmd(today)) ?? today;
  const suggested = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  const initial = fromYmd(selectedValue) ?? (suggested < minDate ? minDate : suggested > maxDate ? maxDate : suggested);
  const [draftYear, setDraftYear] = useState(initial.getFullYear());
  const [draftMonth, setDraftMonth] = useState(initial.getMonth() + 1);
  const [draftDay, setDraftDay] = useState(initial.getDate());

  const years = useMemo(() => Array.from(
    { length: Math.max(1, maxDate.getFullYear() - minDate.getFullYear() + 1) },
    (_, index) => minDate.getFullYear() + index,
  ), [minDate.getFullYear(), maxDate.getFullYear()]);

  const normalize = (year: number, month: number, day: number) => {
    const candidate = new Date(year, month - 1, Math.min(day, new Date(year, month, 0).getDate()));
    const normalized = candidate < minDate ? minDate : candidate > maxDate ? maxDate : candidate;
    setDraftYear(normalized.getFullYear());
    setDraftMonth(normalized.getMonth() + 1);
    setDraftDay(normalized.getDate());
  };

  const openPicker = () => {
    const current = fromYmd(selectedValue) ?? initial;
    setDraftYear(current.getFullYear());
    setDraftMonth(current.getMonth() + 1);
    setDraftDay(current.getDate());
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    requestAnimationFrame(() => dialog.current?.focus());
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  const days = Array.from({ length: new Date(draftYear, draftMonth, 0).getDate() }, (_, index) => index + 1);

  const apply = () => {
    const next = toYmd(new Date(draftYear, draftMonth - 1, draftDay));
    if (!controlled) setInternalValue(next);
    onChange?.(next);
    setOpen(false);
  };

  return <div className={`premium-date premium-date-wheel ${open ? 'is-open' : ''}`}>
    <input type="hidden" name={name} value={selectedValue} />
    <button type="button" className="premium-date-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={openPicker}>
      <span className={selectedValue ? '' : 'premium-select-placeholder'}>{selectedValue ? dateLabel(selectedValue) : placeholder}</span>
      <span className="premium-date-mark premium-date-text-mark" aria-hidden="true">Date</span>
    </button>
    {required && <input className="premium-control-validator" tabIndex={-1} required value={selectedValue} onChange={() => undefined} aria-hidden="true" />}
    {open && createPortal(<div className="premium-calendar-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="premium-wheel-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label="Select birth date" tabIndex={-1}>
        <div className="premium-wheel-head">
          <div><span className="premium-wheel-icon"><CalendarDays /></span><div><strong>Select birth date</strong><small>Scroll each column to set the date</small></div></div>
          <button type="button" onClick={() => setOpen(false)}>Close</button>
        </div>
        <div className="date-wheel-picker">
          <div className="date-wheel-selection" aria-hidden="true" />
          <DateWheel label="Day" values={days} selected={draftDay} display={(day) => pad(day)} onChange={(day) => normalize(draftYear, draftMonth, day)} />
          <DateWheel label="Month" values={months} selected={draftMonth} display={(month) => MONTHS[month - 1]} onChange={(month) => normalize(draftYear, month, draftDay)} />
          <DateWheel label="Year" values={years} selected={draftYear} display={String} onChange={(year) => normalize(year, draftMonth, draftDay)} />
        </div>
        <div className="premium-wheel-actions">
          <button type="button" className="wheel-cancel" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="wheel-apply" onClick={apply}>Use this date</button>
        </div>
      </div>
    </div>, document.body)}
  </div>;
}

export function PremiumDatePicker(props: PremiumDatePickerProps) {
  return props.variant === 'wheel' ? <PremiumWheelDatePicker {...props} /> : <PremiumCalendarDatePicker {...props} />;
}

function PremiumCalendarDatePicker({ name, defaultValue = '', value, onChange, placeholder = 'Select a date', required, min, max }: PremiumDatePickerProps) {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlled ? value : internalValue;
  const initial = fromYmd(selectedValue) ?? new Date();
  const [viewMonth, setViewMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    requestAnimationFrame(() => dialog.current?.focus());
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  useEffect(() => {
    const current = fromYmd(selectedValue);
    if (current) setViewMonth(new Date(current.getFullYear(), current.getMonth(), 1));
  }, [selectedValue]);

  const days = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const leading = new Date(year, month, 1).getDay();
    const total = new Date(year, month + 1, 0).getDate();
    return [...Array(leading).fill(null), ...Array.from({ length: total }, (_, index) => index + 1)];
  }, [viewMonth]);

  const choose = (day: number) => {
    const next = toYmd(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
    if ((min && next < min) || (max && next > max)) return;
    if (!controlled) setInternalValue(next);
    onChange?.(next);
    setOpen(false);
  };

  return <div className={`premium-date ${open ? 'is-open' : ''}`} ref={root}>
    <input type="hidden" name={name} value={selectedValue} />
    <button type="button" className="premium-date-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className={selectedValue ? '' : 'premium-select-placeholder'}>{selectedValue ? dateLabel(selectedValue) : placeholder}</span>
      <span className="premium-date-mark" aria-hidden="true">{pad(initial.getDate())}</span>
    </button>
    {required && <input className="premium-control-validator" tabIndex={-1} required value={selectedValue} onChange={() => undefined} aria-hidden="true" />}
    {open && createPortal(<div className="premium-calendar-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
    <div className="premium-calendar" ref={dialog} role="dialog" aria-modal="true" aria-label="Choose date" tabIndex={-1}>
      <div className="premium-calendar-head">
        <button type="button" aria-label="Previous month" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}><ChevronLeft /></button>
        <strong>{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</strong>
        <button type="button" aria-label="Next month" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}><ChevronRight /></button>
      </div>
      <div className="premium-calendar-grid premium-calendar-weekdays">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="premium-calendar-grid">{days.map((day, index) => {
        if (!day) return <span key={`blank-${index}`} />;
        const candidate = toYmd(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
        const unavailable = Boolean((min && candidate < min) || (max && candidate > max));
        return <button type="button" key={candidate} className={candidate === selectedValue ? 'selected' : ''} disabled={unavailable} onClick={() => choose(day)}>{day}</button>;
      })}</div>
      <div className="premium-calendar-foot"><button type="button" onClick={() => setOpen(false)}>Cancel</button><button type="button" onClick={() => { const today = toYmd(new Date()); if ((!min || today >= min) && (!max || today <= max)) { if (!controlled) setInternalValue(today); onChange?.(today); setOpen(false); } }}>Today</button></div>
    </div></div>, document.body)}
  </div>;
}
