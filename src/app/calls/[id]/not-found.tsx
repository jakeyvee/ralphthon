// VOL-158: not-found page for /calls/[id] when the call id is unknown.
import Link from "next/link";

export default function CallNotFound() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <section className="rounded-2xl border border-zinc-800 bg-[#18181C] p-6 shadow-none text-center">
        <h1 className="text-lg font-semibold text-white">Call not found</h1>
        <p className="mt-2 text-sm text-zinc-400">
          No audit record exists for that call id.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800/50"
        >
          &larr; Back to dashboard
        </Link>
      </section>
    </main>
  );
}
