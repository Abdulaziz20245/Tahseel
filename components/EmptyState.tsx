export default function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-md border border-dashed border-line bg-subtle p-8 text-sm text-muted">
      {children}
    </div>
  );
}
