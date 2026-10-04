import { useId } from 'react';
import type { LanguagePair } from '@package/shared';
import './LanguagePairSelect.css';

const LANGUAGES: Record<string, string> = {
  en: 'English', ru: 'Russian', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', uk: 'Ukrainian', pl: 'Polish',
  tr: 'Turkish', ar: 'Arabic', hi: 'Hindi', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
};

interface LanguagePairSelectProps {
  pair: LanguagePair;
  disabled?: boolean;
  onChange: (pair: LanguagePair) => void;
  onSwap: () => void;
  className?: string;
  fieldClassName?: string;
  selectClassName?: string;
  swapClassName?: string;
}

export function LanguagePairSelect({
  pair, disabled, onChange, onSwap, className = '', fieldClassName = '',
  selectClassName, swapClassName,
}: LanguagePairSelectProps) {
  const id = useId();
  const languages = { ...LANGUAGES };
  for (const code of [pair.from_code, pair.to_code]) {
    if (code !== 'auto' && !languages[code]) languages[code] = code.toUpperCase();
  }
  const options = Object.entries(languages).map(([code, name]) => (
    <option key={code} value={code}>{name}</option>
  ));

  return (
    <div className={`language-pair-controls ${className}`}>
      <div className={`language-pair-field ${fieldClassName}`}>
        <label htmlFor={`${id}-source`}>Source language</label>
        <select id={`${id}-source`} className={selectClassName} value={pair.from_code}
          disabled={disabled} onChange={event => onChange({ ...pair, from_code: event.target.value })}>
          <option value="auto">Auto-Detect</option>
          {options}
        </select>
      </div>
      <button type="button" className={swapClassName} aria-label="Swap languages"
        title={pair.from_code === 'auto' ? 'Choose a source language to swap' : 'Swap languages'}
        disabled={disabled || pair.from_code === 'auto'} onClick={onSwap}>
        ⇄
      </button>
      <div className={`language-pair-field ${fieldClassName}`}>
        <label htmlFor={`${id}-target`}>Target language</label>
        <select id={`${id}-target`} className={selectClassName} value={pair.to_code}
          disabled={disabled} onChange={event => onChange({ ...pair, to_code: event.target.value })}>
          {options}
        </select>
      </div>
    </div>
  );
}
