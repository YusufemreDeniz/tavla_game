interface Option<T> {
  value: T;
  label: string;
  sub?: string;
}

interface OptionGroupProps<T> {
  legend: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
}

/** Ana sayfadaki kart biçimli tekli seçim grubu (role="radiogroup"). */
export default function OptionGroup<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  columns = 3,
}: OptionGroupProps<T>) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm text-cream-300">{legend}</legend>
      <div
        className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
        role="radiogroup"
        aria-label={legend}
      >
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
              value === option.value
                ? 'border-gold-500 bg-bordo-600 text-cream-50 shadow-md'
                : 'border-night-600 bg-night-900 text-cream-300 hover:bg-night-700'
            }`}
          >
            <span className="block font-semibold">{option.label}</span>
            {option.sub && (
              <span aria-hidden="true" className="block text-[10px] opacity-80">
                {option.sub}
              </span>
            )}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
