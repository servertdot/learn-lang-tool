import React, { useEffect, useRef, useState } from 'react';
import {
  formatHotkeyLabel,
  hotkeyFromKeyboardEvent,
  isModifierKey,
  isModifierOnlyHotkey,
} from '@src/lib/hotkey-chord';

interface HotkeyCaptureProps {
  id?: string;
  value: string;
  onChange: (hotkey: string) => void;
}

export function HotkeyCapture({ id, value, onChange }: HotkeyCaptureProps) {
  const [capturing, setCapturing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!capturing) return;

    function finish(hotkey: string) {
      onChangeRef.current(hotkey);
      previewRef.current = null;
      setPreview(null);
      setCapturing(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        previewRef.current = null;
        setPreview(null);
        setCapturing(false);
        return;
      }

      const chord = hotkeyFromKeyboardEvent(event);
      if (!chord) return;

      event.preventDefault();
      event.stopPropagation();
      previewRef.current = chord;
      setPreview(chord);

      if (!isModifierKey(event.key)) {
        finish(chord);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      const current = previewRef.current;
      if (!current || !isModifierOnlyHotkey(current)) return;
      if (!isModifierKey(event.key)) return;

      event.preventDefault();
      event.stopPropagation();
      finish(current);
    }

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [capturing]);

  const label = capturing
    ? (preview ? formatHotkeyLabel(preview) : 'Press a key or combination…')
    : formatHotkeyLabel(value);

  return (
    <div className="hotkey-capture">
      <button
        id={id}
        type="button"
        className={`hotkey-capture-button${capturing ? ' is-capturing' : ''}`}
        aria-pressed={capturing}
        aria-label="Hold-to-translate key"
        onClick={() => {
          previewRef.current = null;
          setPreview(null);
          setCapturing(true);
        }}
        onBlur={() => {
          previewRef.current = null;
          setPreview(null);
          setCapturing(false);
        }}
      >
        <kbd>{label}</kbd>
      </button>
      {capturing && (
        <button
          type="button"
          className="hotkey-capture-cancel"
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            previewRef.current = null;
            setPreview(null);
            setCapturing(false);
          }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
