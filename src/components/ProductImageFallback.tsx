export function ProductImageFallback({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div role="img" aria-label={label} className={`flex flex-col items-center justify-center gap-2 bg-tg-secondary text-tg-hint ${className}`}>
      <span aria-hidden="true" className="text-4xl">📷</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
