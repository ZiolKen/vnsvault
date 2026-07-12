import { SkeletonGameDetail } from '@/components/ui/SkeletonCard';

// NOTE: Navbar lives in the root layout and persists across navigations —
// do NOT mount another one here. A second instance would start with
// `user = null` and briefly look like a fake logout (see app/layout.tsx).
export default function GameDetailLoading() {
  return (
    <main className="pt-16 flex-1">
      <SkeletonGameDetail />
    </main>
  );
}
