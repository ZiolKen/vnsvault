import { SkeletonCardGrid } from '@/components/ui/SkeletonCard';

// NOTE: Navbar lives in the root layout and persists across navigations —
// do NOT mount another one here. A second instance would start with
// `user = null` and briefly look like a fake logout (see app/layout.tsx).
export default function GamesLoading() {
  return (
    <main className="pt-16 flex-1">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-8" aria-hidden="true">
          <div className="space-y-2">
            <div className="skeleton h-8 w-40 rounded" />
            <div className="skeleton h-4 w-56 rounded" />
          </div>
          <div className="skeleton h-9 w-36 rounded-lg" />
        </div>
        {/* Layout skeleton */}
        <div className="flex gap-6">
          <div className="w-60 shrink-0 hidden lg:block space-y-4" aria-hidden="true">
            <div className="skeleton h-48 rounded-xl" />
            <div className="skeleton h-48 rounded-xl" />
          </div>
          <div className="flex-1">
            <SkeletonCardGrid count={12} />
          </div>
        </div>
      </div>
    </main>
  );
}
