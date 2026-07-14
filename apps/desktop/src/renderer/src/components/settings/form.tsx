import type { ReactNode } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
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
          <label
            className={`bb-settings-radio-label${option.description ? ' bb-settings-radio-label--stacked' : ''}`}
            key={option.value}
          >
            <span className="bb-settings-radio-label-main">
              <input
                checked={option.value === value}
                name={name}
                onChange={() => onChange(option.value)}
                type="radio"
                value={option.value}
              />
              {option.label}
            </span>
            {option.description ? (
              <span className="bb-settings-radio-desc">{option.description}</span>
            ) : null}
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
  disabled,
  id,
  label,
  max,
  min,
  onChange,
  value,
}: {
  disabled?: boolean;
  id?: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}): React.JSX.Element {
  const fieldId = id ?? `bb-num-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="bb-settings-row" style={disabled ? { opacity: 0.5 } : undefined}>
      <label className="bb-settings-label" htmlFor={fieldId}>{label}</label>
      <input
        className="bb-settings-number"
        disabled={disabled}
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

export function PresetRangeField({
  description,
  id,
  label,
  onChange,
  presets,
  value,
}: {
  description?: ReactNode;
  id?: string;
  label: string;
  onChange: (value: number) => void;
  presets: ReadonlyArray<{ value: number; label: string }>;
  value: number;
}): React.JSX.Element {
  const fieldId = id ?? `bb-preset-range-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const index = presets.findIndex((preset) => preset.value === value);
  const safeIndex = index >= 0 ? index : 0;
  const current = presets[safeIndex] ?? presets[0];

  return (
    <div className="bb-settings-preset-range">
      <label className="bb-settings-label" htmlFor={fieldId}>{label}</label>
      {description ? <p className="bb-settings-note bb-settings-preset-desc">{description}</p> : null}
      <div className="bb-settings-preset-slider-wrap">
        <div className="bb-settings-preset-slider-top">
          <input
            className="bb-settings-range"
            id={fieldId}
            max={Math.max(0, presets.length - 1)}
            min={0}
            onChange={(event) => {
              const next = presets[Number(event.currentTarget.value)];
              if (next) onChange(next.value);
            }}
            step={1}
            type="range"
            value={safeIndex}
          />
          <span
            className="bb-settings-range-value"
            title={`${current.value.toLocaleString()} characters`}
          >
            {current.label}
          </span>
        </div>
        <div aria-hidden="true" className="bb-settings-preset-ticks">
          {presets.map((preset) => (
            <span className="bb-settings-preset-tick" key={preset.value}>{preset.label}</span>
          ))}
        </div>
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
