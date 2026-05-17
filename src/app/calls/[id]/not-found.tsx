// VOL-158: not-found page for /calls/[id] when the call id is unknown.
import Link from "next/link";

export default function CallNotFound() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm text-center">
        <h1 className="text-lg font-semibold text-zinc-900">Call not found</h1>
        <p className="mt-2 text-sm text-zinc-600">
          No audit record exists for that call id.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          &larr; Back to dashboard
        </Link>
      </section>
    </main>
  );
}
