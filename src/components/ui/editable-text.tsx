import React, { useState, useEffect, useRef } from 'react';

interface EditableTextProps {
  value: string;
  onSave: (val: string) => void;
  isEditMode: boolean;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  placeholder?: string;
}

export function EditableText({
  value,
  onSave,
  isEditMode,
  className = "",
  style,
  multiline = false,
  placeholder = "Enter text..."
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (currentValue !== value) {
      onSave(currentValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      handleBlur();
    }
    if (e.key === 'Escape') {
      setCurrentValue(value);
      setIsEditing(false);
    }
  };

  if (!isEditMode) {
    if (!value) return null;
    return (
      <span className={className} style={style}>
        {value}
      </span>
    );
  }

  if (isEditing) {
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`bg-transparent outline-none ring-2 ring-red-500/50 resize-none ${className}`}
          style={style}
          placeholder={placeholder}
          rows={Math.max(1, currentValue.split('\n').length)}
        />
      );
    }

    return (
      <input
        ref={inputRef as React.Ref<HTMLInputElement>}
        type="text"
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`bg-transparent outline-none ring-2 ring-red-500/50 ${className}`}
        style={{ ...style, width: '100%' }}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`relative group cursor-text inline-block min-w-[20px] ${className}`}
      style={style}
    >
      <span className="absolute -inset-1 rounded border border-dashed border-transparent group-hover:border-red-500/50 bg-transparent group-hover:bg-red-500/5 transition-colors pointer-events-none" />
      {value || <span className="opacity-40 italic">{placeholder}</span>}
    </span>
  );
}
