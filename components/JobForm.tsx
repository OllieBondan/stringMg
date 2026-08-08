"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDMY, toDateInputValue } from "@/lib/format";
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
  disabled,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const isPreset = value === "" || options.includes(value);
  const [other, setOther] = useState(!isPreset);
  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500";

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
          disabled={disabled}
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
        disabled={disabled}
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
          disabled={disabled}
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
  disabled,
}: {
  label: string;
  name: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o}
            className={`rounded-full border px-3 py-1.5 text-sm shadow-sm transition-colors ${
              disabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer"
            } ${
              value === o
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o}
              checked={value === o}
              disabled={disabled}
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
  ownString: false,
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
          ownString: initial.ownString,
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{initial ? "Edit job" : "New stringing job"}</h1>
        <Link
          href="/"
          className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          🏠 Main menu
        </Link>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Date received
        </span>
        <div className="relative">
          {/*
            A date input always displays in the device's regional format
            (e.g. mm/dd/yyyy on a US-locale phone) — there is no attribute to
            control that natively. Its own text is hidden (text-transparent)
            and a DD/MM/YYYY label is drawn on top, so the picker still opens
            on tap but what's shown is always the same regardless of device.
          */}
          <input
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            required
            suppressHydrationWarning
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-transparent shadow-sm outline-none transition-colors [-webkit-text-fill-color:transparent] [color-scheme:light] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:[color-scheme:dark] dark:focus:border-emerald-500"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-900 dark:text-slate-100"
          >
            {receivedDate ? formatDMY(receivedDate) : "dd/mm/yyyy"}
          </span>
        </div>
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
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500"
        />
      </label>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
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

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          String
        </h2>
        <div className="flex flex-col gap-3">
          <label className="flex w-fit items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={specs.ownString}
              onChange={(e) => {
                const ownString = e.target.checked;
                setSpecs((s) => ({
                  ...s,
                  ownString,
                  stringType: ownString ? "" : s.stringType,
                  stringColor: ownString ? "" : s.stringColor,
                }));
              }}
              className="h-4 w-4 accent-emerald-600"
            />
            Customer brought their own string
          </label>
          <SelectWithOther
            label="String type"
            options={STRING_TYPES}
            value={specs.stringType}
            onChange={set("stringType")}
            required={!specs.ownString}
            disabled={specs.ownString}
          />
          <ChipRadio
            label="String color"
            name="stringColor"
            options={COLORS}
            value={specs.stringColor}
            onChange={set("stringColor")}
            disabled={specs.ownString}
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
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500"
              />
            </label>
            <div className="flex gap-2 pb-0.5">
              {TENSION_UNITS.map((u) => (
                <label
                  key={u}
                  className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition-colors ${
                    specs.tensionUnit === u
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500"
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
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500"
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
          className="flex-1 rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white shadow-md shadow-emerald-900/15 transition-all hover:bg-emerald-700 hover:shadow-lg active:scale-[.99] disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Add racket"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
