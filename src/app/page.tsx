// Placeholder home page — overwritten by VOL-141 (one-screen config + audit shell).
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 p-8">
      <div className="max-w-xl text-center space-y-3">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Call-Check-Loop
        </h1>
        <p className="text-sm text-zinc-600">
          Bootstrap shell — UI is being built in VOL-141.
        </p>
      </div>
    </main>
  );
}
