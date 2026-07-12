export function SkeletonCard() {
  return (
    <div className="flex flex-col bg-surface border border-border rounded-xl overflow-hidden" aria-hidden="true">
      <div className="skeleton aspect-[3/4]" />
      <div className="p-3 flex flex-col gap-2">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="flex gap-1 mt-1">
          <div className="skeleton h-5 w-16 rounded-full" />
          <div className="skeleton h-5 w-12 rounded-full" />
        </div>
        <div className="skeleton h-3 w-2/3 rounded mt-auto" />
      </div>
    </div>
  );
}

export function SkeletonCardGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" aria-label="Đang tải...">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

export function SkeletonHero() {
  return (
    <section className="relative min-h-screen bg-vault flex items-end pb-20 pt-16" aria-hidden="true">
      <div className="max-w-7xl mx-auto px-4 w-full">
        <div className="max-w-xl space-y-4">
          <div className="skeleton h-4 w-40 rounded" />
          <div className="skeleton h-14 w-64 rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-4/5 rounded" />
          <div className="flex gap-3">
            <div className="skeleton h-11 w-36 rounded-lg" />
            <div className="skeleton h-11 w-28 rounded-lg" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function SkeletonGameDetail() {
  return (
    <div className="max-w-7xl mx-auto px-4 pb-16" aria-hidden="true">
      <div className="skeleton h-56 sm:h-72 rounded-none -mx-4" />
      <div className="-mt-24 relative z-10">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="skeleton w-40 h-56 rounded-xl shrink-0" />
          <div className="flex-1 space-y-4 pt-8">
            <div className="skeleton h-8 w-2/3 rounded" />
            <div className="flex gap-2">
              <div className="skeleton h-6 w-20 rounded-full" />
              <div className="skeleton h-6 w-16 rounded-full" />
            </div>
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-5/6 rounded" />
            <div className="skeleton h-4 w-3/4 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
