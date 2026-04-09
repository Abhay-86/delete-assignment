import { clsx } from 'clsx';
import { useId } from 'react';

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  className?: string;
}

export function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  unit = '',
  className,
}: SliderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={clsx('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-xs font-medium text-slate-400"
        >
          {label}
        </label>
        <span className="font-mono text-xs font-semibold text-slate-200">
          {value > 0 ? '+' : ''}
          {value}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-input w-full cursor-pointer appearance-none rounded-full bg-slate-700 outline-none"
        style={{
          background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${pct}%, #334155 ${pct}%, #334155 100%)`,
          height: '6px',
        }}
      />
      <style>{`
        .slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3B82F6;
          border: 2px solid #1e293b;
          cursor: pointer;
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
          transition: box-shadow 0.15s ease;
        }
        .slider-input::-webkit-slider-thumb:hover {
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.6);
        }
        .slider-input::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3B82F6;
          border: 2px solid #1e293b;
          cursor: pointer;
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
        }
      `}</style>
    </div>
  );
}
