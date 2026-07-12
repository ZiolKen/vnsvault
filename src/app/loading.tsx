import { SkeletonHero, SkeletonCardGrid } from '@/components/ui/SkeletonCard';

// NOTE: Navbar is rendered once in the root layout and persists across
// navigations — it must NOT be re-rendered here. A loading.tsx that mounts
// its own <Navbar /> creates a second instance with fresh `user = null`
// state for the brief moment this fallback is shown, which flashes as a
// fake "logged out" navbar even though the real session is still valid.
export default function Loading() {
  return (
    <div className="pt-16">
      <SkeletonHero />
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="skeleton h-6 w-48 rounded mb-6" aria-hidden="true" />
        <SkeletonCardGrid count={8} />
      </div>
    </div>
  );
}
