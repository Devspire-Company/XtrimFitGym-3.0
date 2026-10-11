import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
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
  const [menuPosition, setMenuPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number }>();
  const selectedValue = controlled ? value : internalValue;
  const selected = options.find((option) => option.value === selectedValue);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  useEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const viewportGap = 12;
      const menuGap = 7;
      const roomBelow = window.innerHeight - bounds.bottom - viewportGap - menuGap;
      const roomAbove = bounds.top - viewportGap - menuGap;
      const openAbove = placement === 'up' || (roomBelow < 210 && roomAbove > roomBelow);
      const width = Math.min(bounds.width, window.innerWidth - viewportGap * 2);
      const left = Math.max(viewportGap, Math.min(bounds.left, window.innerWidth - width - viewportGap));
      const maxHeight = Math.max(120, Math.min(260, openAbove ? roomAbove : roomBelow));
      setMenuPosition(openAbove
        ? { left, bottom: window.innerHeight - bounds.top + menuGap, width, maxHeight }
        : { left, top: bounds.bottom + menuGap, width, maxHeight });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open, placement]);

  const choose = (nextValue: string) => {
    if (!controlled) setInternalValue(nextValue);
    onChange?.(nextValue);
    setOpen(false);
    setMenuPosition(undefined);
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
      onClick={() => setOpen((current) => { if (!current) setMenuPosition(undefined); return !current; })}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
        if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && !open) {
          event.preventDefault();
          setMenuPosition(undefined);
          setOpen(true);
        }
      }}
    >
      <span className={selected ? '' : 'premium-select-placeholder'}>{selected?.label ?? placeholder}</span>
      <ChevronDown aria-hidden="true" />
    </button>
    {required && <input className="premium-control-validator" tabIndex={-1} required value={selectedValue} onChange={() => undefined} aria-hidden="true" />}
    {open && menuPosition && createPortal(<div className={`premium-select-menu premium-select-floating ${menuPosition.bottom !== undefined ? 'is-above' : ''}`} style={menuPosition} role="listbox" aria-labelledby={id} onPointerDown={(event) => event.stopPropagation()}>
      {options.map((option) => <button
        type="button"
        role="option"
        aria-selected={option.value === selectedValue}
        className={option.value === selectedValue ? 'selected' : ''}
        disabled={option.disabled}
        key={option.value}
        onClick={() => choose(option.value)}
      >{option.label}</button>)}
    </div>, document.body)}
  </div>;
}

type PremiumMultiSelectProps = {
  value: string[];
  onChange: (value: string[]) => void;
  options: SelectOption[];
  placeholder: string;
  otherLabel?: string;
  otherValue?: string;
  onOtherValueChange?: (value: string) => void;
  allowOther?: boolean;
};

export function PremiumMultiSelect({ value, onChange, options, placeholder, otherLabel = 'Other', otherValue = '', onOtherValueChange, allowOther = true }: PremiumMultiSelectProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number }>();
  const otherSelected = value.includes('__OTHER__');
  const labels = value.filter((item) => item !== '__OTHER__').map((item) => options.find((option) => option.value === item)?.label ?? item);
  if (otherSelected && otherValue.trim()) labels.push(otherValue.trim());

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  useEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const gap = 8; const viewportGap = 12;
      const roomBelow = window.innerHeight - bounds.bottom - viewportGap - gap;
      const roomAbove = bounds.top - viewportGap - gap;
      const above = roomBelow < 280 && roomAbove > roomBelow;
      const width = Math.min(Math.max(bounds.width, 360), window.innerWidth - viewportGap * 2);
      const left = Math.max(viewportGap, Math.min(bounds.left, window.innerWidth - width - viewportGap));
      const maxHeight = Math.max(180, Math.min(360, above ? roomAbove : roomBelow));
      setMenuPosition(above ? { left, bottom: window.innerHeight - bounds.top + gap, width, maxHeight } : { left, top: bounds.bottom + gap, width, maxHeight });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => { window.removeEventListener('resize', positionMenu); window.removeEventListener('scroll', positionMenu, true); };
  }, [open]);

  const toggle = (next: string) => onChange(value.includes(next) ? value.filter((item) => item !== next) : [...value, next]);
  return <div className={`premium-multi ${open ? 'is-open' : ''}`} ref={root}>
    <button type="button" className="premium-select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className={labels.length ? '' : 'premium-select-placeholder'}>{labels.length ? labels.join(', ') : placeholder}</span><ChevronDown aria-hidden="true" />
    </button>
    {open && menuPosition && createPortal(<div id={id} className="premium-multi-menu premium-select-floating" style={menuPosition} role="listbox" aria-multiselectable="true" onPointerDown={(event) => event.stopPropagation()}>
      <div className="premium-multi-options">{options.map((option) => <button type="button" role="option" aria-selected={value.includes(option.value)} className={value.includes(option.value) ? 'selected' : ''} key={option.value} onClick={() => toggle(option.value)}><span>{option.label}</span><i>{value.includes(option.value) ? 'Selected' : 'Add'}</i></button>)}
        {allowOther && <button type="button" role="option" aria-selected={otherSelected} className={otherSelected ? 'selected' : ''} onClick={() => toggle('__OTHER__')}><span>{otherLabel}</span><i>{otherSelected ? 'Selected' : 'Add'}</i></button>}
      </div>
      {otherSelected && <input className="premium-multi-other" value={otherValue} onChange={(event) => onOtherValueChange?.(event.target.value)} placeholder={`Enter ${otherLabel.toLowerCase()}`} autoFocus />}
      <div className="premium-multi-foot"><span>{labels.length} selected</span><button type="button" onClick={() => setOpen(false)}>Done</button></div>
    </div>, document.body)}
  </div>;
}

type PremiumTimePickerProps = { value: string; onChange: (value: string) => void; label: string; name?: string; disabled?: boolean; required?: boolean; placeholder?: string };
const timeParts = (value: string): { hour: number; minute: number; period: 'AM' | 'PM' } => { const [rawHour = '9', rawMinute = '00'] = value.split(':'); const hour24 = Number(rawHour); return { hour: hour24 % 12 || 12, minute: Math.floor(Number(rawMinute) / 5) * 5, period: hour24 >= 12 ? 'PM' : 'AM' }; };
const timeLabel = (value: string) => { const parsed = timeParts(value); return `${parsed.hour}:${String(parsed.minute).padStart(2, '0')} ${parsed.period}`; };

export function PremiumTimePicker({ value, onChange, label, name, disabled, required, placeholder = 'Select time' }: PremiumTimePickerProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const initial = timeParts(value);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [period, setPeriod] = useState<'AM' | 'PM'>(initial.period);
  const openPicker = () => { const current = timeParts(value); setHour(current.hour); setMinute(current.minute); setPeriod(current.period); setOpen(true); };
  const apply = () => { const hour24 = period === 'AM' ? hour % 12 : (hour % 12) + 12; onChange(`${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`); setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    requestAnimationFrame(() => dialog.current?.focus());
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  return <div className="premium-time">
    {name && <input type="hidden" name={name} value={value} />}
    <button type="button" className="premium-time-trigger" onClick={openPicker} disabled={disabled}><Clock3/><span className={value ? '' : 'premium-select-placeholder'}>{value ? timeLabel(value) : placeholder}</span></button>
    {required && <input className="premium-control-validator" tabIndex={-1} required value={value} onChange={() => undefined} aria-hidden="true" />}
    {open && createPortal(<div className="premium-time-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="premium-time-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
      <div className="premium-time-head"><span><Clock3/></span><div><strong>{label}</strong><small>Choose the hour and minute</small></div></div>
      <div className="premium-time-columns"><div><small>Hour</small>{Array.from({length:12},(_,index)=>index+1).map((item)=><button type="button" className={item===hour?'selected':''} key={item} onClick={()=>setHour(item)}>{item}</button>)}</div><div><small>Minute</small>{Array.from({length:12},(_,index)=>index*5).map((item)=><button type="button" className={item===minute?'selected':''} key={item} onClick={()=>setMinute(item)}>{String(item).padStart(2,'0')}</button>)}</div><div><small>Period</small>{(['AM','PM'] as const).map((item)=><button type="button" className={item===period?'selected':''} key={item} onClick={()=>setPeriod(item)}>{item}</button>)}</div></div>
      <div className="premium-time-actions"><button type="button" onClick={()=>setOpen(false)}>Cancel</button><button type="button" onClick={apply}>Use this time</button></div>
    </div></div>, document.body)}
  </div>;
}

type ReasonSelectProps = {
  name?: string;
  options: string[];
  placeholder?: string;
  otherPlaceholder?: string;
  placement?: 'down' | 'up';
  onResolvedChange?: (reason: string) => void;
};

const OTHER_REASON = '__OTHER__';

export function ReasonSelect({ name = 'reason', options, placeholder = 'Choose a reason', otherPlaceholder = 'Enter the specific reason', placement = 'down', onResolvedChange }: ReasonSelectProps) {
  const [choice, setChoice] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const resolvedReason = choice === OTHER_REASON ? otherReason.trim() : choice;

  useEffect(() => { onResolvedChange?.(resolvedReason); }, [resolvedReason, onResolvedChange]);

  return <div className="reason-select-control">
    <PremiumSelect
      value={choice}
      onChange={(nextChoice) => { setChoice(nextChoice); if (nextChoice !== OTHER_REASON) setOtherReason(''); }}
      options={[...options.map((option) => ({ value: option, label: option })), { value: OTHER_REASON, label: 'Other' }]}
      placeholder={placeholder}
      placement={placement}
      required
    />
    <input type="hidden" name={name} value={resolvedReason} />
    {choice === OTHER_REASON && <input
      className="reason-other-input"
      value={otherReason}
      onChange={(event) => setOtherReason(event.target.value)}
      placeholder={otherPlaceholder}
      minLength={3}
      maxLength={300}
      autoFocus
      required
    />}
  </div>;
}

type PremiumDatePickerProps = {
  name?: string;
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
    {name && <input type="hidden" name={name} value={selectedValue} />}
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
          {selectedValue && !required && <button type="button" className="wheel-cancel" onClick={() => { if (!controlled) setInternalValue(''); onChange?.(''); setOpen(false); }}>Clear</button>}
          <button type="button" className="wheel-apply" onClick={apply}>Use this date</button>
        </div>
      </div>
    </div>, document.body)}
  </div>;
}

export function PremiumDatePicker(props: PremiumDatePickerProps) {
  return props.variant === 'wheel' ? <PremiumWheelDatePicker {...props} /> : <PremiumCalendarDatePicker {...props} />;
}

type PremiumDateTimePickerProps = {
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  min?: string;
  max?: string;
};

export function PremiumDateTimePicker({ name, defaultValue = '', value, onChange, placeholder = 'Select date and time', required, min, max }: PremiumDateTimePickerProps) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlled ? value : internalValue;
  const [selectedDate = '', selectedTime = ''] = selectedValue.split('T');
  const update = (nextDate: string, nextTime: string) => {
    const next = nextDate ? `${nextDate}T${nextTime || '09:00'}` : '';
    if (!controlled) setInternalValue(next);
    onChange?.(next);
  };
  return <div className="premium-datetime">
    <input type="hidden" name={name} value={selectedValue} />
    <PremiumDatePicker value={selectedDate} onChange={(nextDate) => update(nextDate, selectedTime)} placeholder={placeholder} min={min?.slice(0, 10)} max={max?.slice(0, 10)} required={required} />
    <PremiumTimePicker value={selectedTime} onChange={(nextTime) => update(selectedDate, nextTime)} label={`${placeholder} time`} disabled={!selectedDate} placeholder="Select time" required={required} />
    {selectedValue && !required && <button type="button" className="premium-datetime-clear" onClick={() => update('', '')}>Clear</button>}
  </div>;
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
    {name && <input type="hidden" name={name} value={selectedValue} />}
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
      <div className="premium-calendar-foot"><button type="button" onClick={() => setOpen(false)}>Cancel</button>{selectedValue && !required && <button type="button" onClick={() => { if (!controlled) setInternalValue(''); onChange?.(''); setOpen(false); }}>Clear</button>}<button type="button" onClick={() => { const today = toYmd(new Date()); if ((!min || today >= min) && (!max || today <= max)) { if (!controlled) setInternalValue(today); onChange?.(today); setOpen(false); } }}>Today</button></div>
    </div></div>, document.body)}
  </div>;
}
