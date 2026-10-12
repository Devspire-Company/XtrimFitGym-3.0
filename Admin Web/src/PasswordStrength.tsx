import { Check, X } from 'lucide-react';

export function passwordChecks(value: string) {
  return [
    { label: '10+ characters', passed: value.length >= 10 },
    { label: 'Uppercase', passed: /[A-Z]/.test(value) },
    { label: 'Lowercase', passed: /[a-z]/.test(value) },
    { label: 'Number', passed: /[0-9]/.test(value) },
  ];
}

export function PasswordStrength({ value, confirmValue }: { value: string; confirmValue?: string }) {
  if (!value) return null;
  const checks = passwordChecks(value);
  const score = checks.filter((item) => item.passed).length;
  return <div className={`password-strength score-${score}`} aria-live="polite">
    <div className="password-strength-bar" aria-hidden="true">{checks.map((item) => <i key={item.label} className={item.passed ? 'filled' : ''} />)}</div>
    <div className="password-strength-rules">{checks.map((item) => <span key={item.label} className={item.passed ? 'passed' : ''}>{item.passed ? <Check /> : <X />}{item.label}</span>)}</div>
    {confirmValue !== undefined && confirmValue.length > 0 && <div className={`password-confirm-state ${confirmValue === value ? 'passed' : ''}`}>{confirmValue === value ? <Check /> : <X />}{confirmValue === value ? 'Passwords match' : 'Passwords do not match'}</div>}
  </div>;
}
