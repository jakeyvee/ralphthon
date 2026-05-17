// VOL-158: not-found page for /calls/[id] when the call id is unknown.
import Link from "next/link";

export default function CallNotFound() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <section className="rounded-2xl border border-[#E5E7EB] bg-[#F7F4EB] p-6 shadow-sm text-center">
        <h1 className="text-lg font-semibold text-[#111827]">
          🏥 Call not found
        </h1>
        <p className="mt-2 text-sm text-[#4B5563]">
          Nurse Joy has no audit record for that call id.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md border border-[#E5E7EB] bg-white px-3 py-1.5 text-sm font-medium text-[#4B5563] hover:bg-[#F7F4EB]"
        >
          &larr; Back to Nurse Joy
        </Link>
      </section>
    </main>
  );
}
