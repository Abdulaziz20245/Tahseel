export default function Header() {
  return (
    <header className="bg-primary text-white">
      <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between gap-6 px-6 py-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight whitespace-nowrap">
            Tahseel · <span lang="ar">تحصيل</span>
          </p>
          <p className="truncate text-sm text-white/80">
            Invoice settlement network — concept prototype
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-line px-2.5 py-1 text-xs font-semibold text-ink">
          Synthetic data
        </span>
      </div>
    </header>
  );
}
