import { useState } from 'react';
import { ApiError } from '../lib/api.js';
import { addToIso, todayIso } from '../lib/format.js';
import { Field, FormError } from './Field.jsx';

// Convierte un ISO con zona horaria al formato de <input type="datetime-local">
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function initialValues(fields, record = {}) {
  const values = {};
  for (const f of fields) {
    const v = record[f.name];
    if (f.type === 'checkbox') values[f.name] = Boolean(v ?? f.default);
    else if (f.type === 'datetime') values[f.name] = toLocalInput(v ?? f.default);
    else values[f.name] = v ?? f.default ?? '';
  }
  return values;
}

function toPayload(fields, values) {
  const out = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === 'number') out[f.name] = v === '' ? '' : Number(v);
    else if (f.type === 'datetime') out[f.name] = v ? new Date(v).toISOString() : '';
    else out[f.name] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

export function useForm(fields, record, onSubmit) {
  const [values, setValues] = useState(() => initialValues(fields, record));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const missing = {};
    for (const f of fields) if (f.required && f.type !== 'checkbox' && !String(values[f.name]).trim()) missing[f.name] = 'Este campo es obligatorio';
    if (Object.keys(missing).length) {
      setErrors(missing);
      setFormError(null);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await onSubmit(toPayload(fields, values));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields ?? {}).length) {
        setErrors(err.fields);
        const unknown = Object.keys(err.fields).filter((k) => !fields.some((f) => f.name === k));
        setFormError(unknown.length ? err.fields[unknown[0]] : null);
      } else {
        setFormError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return { values, set, errors, formError, busy, handleSubmit };
}

export function FormFields({ fields, form }) {
  const { values, set, errors } = form;
  return (
    <div className="form-grid">
      {fields.map((f) => {
        if (f.when && !f.when(values)) return null;
        if (f.type === 'checkbox') {
          return (
            <label key={f.name} className={`check${f.wide ? ' span-2' : ''}`}>
              <input type="checkbox" checked={values[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
              <span>{f.label}</span>
            </label>
          );
        }
        return (
          <div key={f.name} className={f.wide || f.type === 'textarea' ? 'span-2' : undefined}>
            <Field label={f.label} error={errors[f.name]} hint={f.hint} optional={!f.required && f.type !== 'select'}>
              {(props) => <Input field={f} value={values[f.name]} onChange={(v) => set(f.name, v)} values={values} {...props} />}
            </Field>
            {f.quick && values[f.quick.from] && (
              <div className="chips" aria-label={`Atajos para ${f.label}`}>
                {f.quick.options.map((q) => (
                  <button key={q.label} type="button" className="chip" onClick={() => set(f.name, addToIso(values[f.quick.from], q.add))}>
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Input({ field: f, value, onChange, values, ...props }) {
  const common = { ...props, value, onChange: (e) => onChange(e.target.value), required: f.required };
  switch (f.type) {
    case 'textarea':
      return <textarea rows={3} placeholder={f.placeholder} maxLength={f.max} {...common} />;
    case 'select':
      return (
        <select {...common}>
          {f.placeholder && <option value="">{f.placeholder}</option>}
          {Object.entries(f.options).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      );
    case 'date':
      return <input type="date" max={f.notFuture ? todayIso() : undefined} {...common} />;
    case 'datetime':
      return <input type="datetime-local" {...common} />;
    case 'number':
      return (
        <div className={f.unit ? 'input-unit' : undefined}>
          <input type="number" inputMode="decimal" step={f.step ?? 'any'} min="0" placeholder={f.placeholder} {...common} />
          {f.unit && <span>{f.unit}</span>}
        </div>
      );
    default:
      return (
        <>
          <input
            type={f.inputType ?? 'text'}
            placeholder={f.placeholder}
            maxLength={f.max}
            autoComplete={f.autoComplete ?? 'off'}
            list={f.suggestions ? `${props.id}-list` : undefined}
            {...common}
          />
          {f.suggestions && (
            <datalist id={`${props.id}-list`}>
              {(typeof f.suggestions === 'function' ? f.suggestions(values) : f.suggestions).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      );
  }
}

export { FormError };
