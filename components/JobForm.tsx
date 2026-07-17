"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toDateInputValue } from "@/lib/format";
import {
  COLORS,
  RACKET_BRANDS,
  STRING_TYPES,
  TENSION_RANGE,
  racketTypesForBrand,
} from "@/lib/options";
import { Job, JobSpecs, TENSION_UNITS, TensionUnit } from "@/lib/types";

const OTHER = "__other__";

function SelectWithOther({
  label,
  options,
  value,
  onChange,
  required,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const isPreset = value === "" || options.includes(value);
  const [other, setOther] = useState(!isPreset);
  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

  // No preset list (e.g. type/series of a custom brand): plain text input,
  // no pointless empty dropdown in between.
  if (options.length === 0) {
    return (
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </span>
        <input
          type="text"
          value={value}
          required={required}
          placeholder={`Type the ${label.toLowerCase()}`}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      </label>
    );
  }

  const selectValue = other ? OTHER : value;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      <select
        value={selectValue}
        required={required && !other}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setOther(true);
            onChange("");
          } else {
            setOther(false);
            onChange(e.target.value);
          }
        }}
        className={inputClass}
      >
        <option value="" disabled>
          Select…
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER}>Other — type it in…</option>
      </select>
      {other && (
        <input
          type="text"
          value={value}
          required={required}
          autoFocus
          placeholder={`Type the ${label.toLowerCase()}`}
          onChange={(e) => onChange(e.target.value)}
          className={`mt-2 ${inputClass}`}
        />
      )}
    </label>
  );
}

function ChipRadio({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
              value === o
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o}
              checked={value === o}
              onChange={() => onChange(o)}
              className="sr-only"
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const EMPTY: JobSpecs = {
  customerName: "",
  racketBrand: "Yonex",
  racketType: "Astrox",
  racketColor: "Black",
  stringType: "Yonex BG65",
  stringColor: "White",
  tensionValue: "10.5",
  tensionUnit: "Kg",
  notes: "",
};

export default function JobForm({ initial }: { initial?: Job }) {
  const router = useRouter();
  const [specs, setSpecs] = useState<JobSpecs>(
    initial
      ? {
          customerName: initial.customerName,
          racketBrand: initial.racketBrand,
          racketType: initial.racketType,
          racketColor: initial.racketColor,
          stringType: initial.stringType,
          stringColor: initial.stringColor,
          tensionValue: initial.tensionValue,
          tensionUnit: initial.tensionUnit,
          notes: initial.notes,
        }
      : EMPTY
  );
  const [receivedDate, setReceivedDate] = useState(() =>
    toDateInputValue(initial?.steps.received?.at)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof JobSpecs>(key: K) => (value: JobSpecs[K]) =>
    setSpecs((s) => ({ ...s, [key]: value }));

  const range = TENSION_RANGE[specs.tensionUnit];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = initial
        ? await fetch(`/api/jobs/${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "updateSpecs",
              specs: { ...specs, receivedDate },
              expectedUpdatedAt: initial.updatedAt,
            }),
          })
        : await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...specs, receivedDate }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      router.push(`/jobs/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{initial ? "Edit job" : "New stringing job"}</h1>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Date received
        </span>
        <input
          type="date"
          value={receivedDate}
          onChange={(e) => setReceivedDate(e.target.value)}
          required
          suppressHydrationWarning
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Customer name
        </span>
        <input
          type="text"
          value={specs.customerName}
          onChange={(e) => set("customerName")(e.target.value)}
          required
          placeholder="Who handed over the racket"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>

      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Racket
        </h2>
        <div className="flex flex-col gap-3">
          <SelectWithOther
            label="Brand"
            options={RACKET_BRANDS}
            value={specs.racketBrand}
            onChange={(brand) =>
              // switching brand invalidates a type that isn't in its line-up
              setSpecs((s) => ({
                ...s,
                racketBrand: brand,
                racketType: racketTypesForBrand(brand).includes(s.racketType)
                  ? s.racketType
                  : "",
              }))
            }
            required
          />
          <SelectWithOther
            key={specs.racketBrand}
            label="Type / series"
            options={racketTypesForBrand(specs.racketBrand)}
            value={specs.racketType}
            onChange={set("racketType")}
          />
          <ChipRadio
            label="Color"
            name="racketColor"
            options={COLORS}
            value={specs.racketColor}
            onChange={set("racketColor")}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          String
        </h2>
        <div className="flex flex-col gap-3">
          <SelectWithOther
            label="String type"
            options={STRING_TYPES}
            value={specs.stringType}
            onChange={set("stringType")}
            required
          />
          <ChipRadio
            label="String color"
            name="stringColor"
            options={COLORS}
            value={specs.stringColor}
            onChange={set("stringColor")}
          />
          <div className="flex items-end gap-3">
            <label className="block flex-1">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Tension ({range.min}–{range.max} {specs.tensionUnit})
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min={range.min}
                max={range.max}
                value={specs.tensionValue}
                onChange={(e) => set("tensionValue")(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <div className="flex gap-2 pb-0.5">
              {TENSION_UNITS.map((u) => (
                <label
                  key={u}
                  className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium ${
                    specs.tensionUnit === u
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="tensionUnit"
                    value={u}
                    checked={specs.tensionUnit === u}
                    onChange={() => set("tensionUnit")(u as TensionUnit)}
                    className="sr-only"
                  />
                  {u}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Notes (optional)
        </span>
        <textarea
          value={specs.notes}
          onChange={(e) => set("notes")(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>

      {error && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white shadow hover:bg-emerald-700 active:scale-[.99] disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Add racket"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
