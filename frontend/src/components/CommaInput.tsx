import React, { useState, useEffect } from 'react';

interface CommaInputProps {
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
  helpText?: string;
}

/**
 * CommaInput - A user-friendly comma-separated input component
 * 
 * This component allows natural typing with commas, only parsing the input
 * into an array when the field loses focus or when explicitly required.
 * This prevents the frustrating behavior where typing a comma immediately
 * splits the input and removes trailing spaces.
 */
export const CommaInput: React.FC<CommaInputProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  rows = 2,
  className = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500",
  helpText
}) => {
  // Internal state for the raw text being typed
  const [inputText, setInputText] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Initialize the input text from the array value
  useEffect(() => {
    if (!isFocused) {
      setInputText(value.join(', '));
    }
  }, [value, isFocused]);

  // Parse comma-separated text into array
  const parseInput = (text: string): string[] => {
    return text
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  // Handle input changes during typing
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  // Handle focus - switch to raw editing mode
  const handleFocus = () => {
    setIsFocused(true);
  };

  // Handle blur - parse and update the array
  const handleBlur = () => {
    setIsFocused(false);
    const parsedValues = parseInput(inputText);
    onChange(parsedValues);
  };

  // Handle key events for better UX
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Allow users to trigger parsing with Enter key if desired
    if (e.key === 'Enter' && e.ctrlKey) {
      handleBlur();
      e.preventDefault();
    }
    // Auto-parse on Tab key for form navigation
    if (e.key === 'Tab') {
      const parsedValues = parseInput(inputText);
      onChange(parsedValues);
    }
  };

  return (
    <div>
      <textarea
        value={inputText}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        rows={rows}
        className={className}
        placeholder={placeholder}
        disabled={disabled}
      />
      {helpText && (
        <p className="text-xs text-gray-500 mt-1">{helpText}</p>
      )}
      {isFocused && (
        <p className="text-xs text-blue-500 mt-1">
          Type naturally with commas. Press Ctrl+Enter or click outside to apply changes.
        </p>
      )}
    </div>
  );
};