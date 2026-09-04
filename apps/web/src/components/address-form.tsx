"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddressForm({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const valid = /^0x[a-fA-F0-9]{40}$/.test(value);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/portfolio?address=${value}`);
      }}
      className="flex flex-col gap-3 sm:flex-row"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value.trim())}
        placeholder="0x…"
        spellCheck={false}
        className="num flex-1 rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-brand-bright"
      />
      <button
        type="submit"
        disabled={!valid}
        className={`rounded-full px-6 py-3 text-sm font-medium transition-colors ${
          valid ? "bg-brand-bright text-bg-deep hover:bg-white" : "cursor-not-allowed bg-white/10 text-white/40"
        }`}
      >
        Look up
      </button>
    </form>
  );
}
