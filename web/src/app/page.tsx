import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-start gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">GridSpec</h1>
      <p className="max-w-xl text-lg text-neutral-600">
        Direct-to-job-site procurement for solar, battery, and EPC contractors — sub-second spec
        search and instant BOM quoting across distributor inventory.
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
