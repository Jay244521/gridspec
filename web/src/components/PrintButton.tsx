"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded border border-neutral-300 px-3 py-1.5 text-sm print:hidden"
    >
      Print
    </button>
  );
}
