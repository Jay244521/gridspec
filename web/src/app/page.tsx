import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-start gap-6 px-6 py-24">
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
        For commercial &amp; industrial solar and battery installers and EPC firms
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">
        Stop juggling distributor portals
      </h1>
      <p className="max-w-xl text-lg text-neutral-600">
        One login, blended pricing and live stock across every distributor you use — sub-second
        spec search and instant BOM quoting, direct to the job site, for contractors running
        multiple commercial and industrial projects at once.
      </p>
      <div className="flex gap-4">
        <Link href="/search" className="rounded bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white">
          Search catalog
        </Link>
        <Link href="/bom" className="rounded border border-neutral-300 px-5 py-2.5 text-sm font-medium">
          Upload a BOM
        </Link>
      </div>
    </main>
  );
}
