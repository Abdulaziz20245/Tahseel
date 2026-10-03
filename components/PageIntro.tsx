export default function PageIntro({ title, purpose }: { title: string; purpose: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-muted">{purpose}</p>
    </div>
  );
}
