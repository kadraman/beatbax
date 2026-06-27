import type { ReactNode } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export function SectionHeading({ children }: { children: ReactNode }): React.JSX.Element {
  return <h3 className="bb-settings-heading">{children}</h3>;
}

export function NoteText({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="bb-settings-note">{children}</p>;
}

export function ToggleRow({
  checked,
  disabled,
  label,
  onChange,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
  title?: string;
}): React.JSX.Element {
  return (
    <label
      className="bb-settings-row bb-settings-toggle-row"
      style={disabled ? { opacity: 0.5 } : undefined}
      title={title}
    >
      <span className="bb-settings-label">{label}</span>
      <input
        checked={checked}
        className="bb-settings-toggle"
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
    </label>
  );
}

export function RadioGroup({
  label,
  name,
  onChange,
  options,
  value,
}: {
  label: string;
  name: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  value: string;
}): React.JSX.Element {
  return (
    <fieldset className="bb-settings-fieldset">
      <legend className="bb-settings-label">{label}</legend>
      <div className="bb-settings-radio-group">
        {options.map((option) => (
          <label className="bb-settings-radio-label" key={option.value}>
            <input
              checked={option.value === value}
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SelectField({
  id,
  label,
  onChange,
  options,
  value,
}: {
  id?: string;
  label: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  value: string;
}): React.JSX.Element {
  const fieldId = id ?? `bb-sel-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="bb-settings-row">
      <label className="bb-settings-label" htmlFor={fieldId}>{label}</label>
      <select
        className="bb-settings-select"
        id={fieldId}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

export function NumberField({
  id,
  label,
  max,
  min,
  onChange,
  value,
}: {
  id?: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}): React.JSX.Element {
  const fieldId = id ?? `bb-num-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="bb-settings-row">
      <label className="bb-settings-label" htmlFor={fieldId}>{label}</label>
      <input
        className="bb-settings-number"
        id={fieldId}
        max={max}
        min={min}
        onChange={(event) => {
          const next = Math.min(max, Math.max(min, Number(event.currentTarget.value)));
          onChange(next);
        }}
        type="number"
        value={value}
      />
    </div>
  );
}

export function TextField({
  id,
  inputType = 'text',
  label,
  onChange,
  value,
}: {
  id?: string;
  inputType?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}): React.JSX.Element {
  const fieldId = id ?? `bb-text-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="bb-settings-row">
      <label className="bb-settings-label" htmlFor={fieldId}>{label}</label>
      <input
        className="bb-settings-text"
        id={fieldId}
        onChange={(event) => onChange(event.currentTarget.value)}
        type={inputType}
        value={value}
      />
    </div>
  );
}

export function RangeField({
  label,
  max,
  min,
  onChange,
  step,
  unit,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  unit: string;
  value: number;
}): React.JSX.Element {
  const id = `bb-range-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="bb-settings-row bb-settings-range-row">
      <label className="bb-settings-label" htmlFor={id}>{label}</label>
      <div className="bb-settings-range-right">
        <input
          className="bb-settings-range"
          id={id}
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          step={step}
          type="range"
          value={value}
        />
        <span className="bb-settings-range-value">{value}{unit}</span>
      </div>
    </div>
  );
}

export function SettingsFeatureRow({
  badge,
  badgeClass,
  children,
  description,
  title,
}: {
  badge?: string;
  badgeClass?: string;
  children: ReactNode;
  description: ReactNode;
  title: ReactNode;
}): React.JSX.Element {
  return (
    <div className="bb-settings-feature-row">
      <div className="bb-settings-feature-info">
        <div className="bb-settings-feature-title">
          {typeof title === 'string' ? <span>{title}</span> : title}
          {badge ? <span className={`bb-settings-badge ${badgeClass ?? ''}`}>{badge}</span> : null}
        </div>
        <span className="bb-settings-feature-desc">{description}</span>
      </div>
      {children}
    </div>
  );
}
