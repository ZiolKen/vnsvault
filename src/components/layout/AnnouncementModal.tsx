'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import AnnouncementBody from '@/components/announcement/AnnouncementBody';
import { getAnnouncementDismissal, isDismissalActive, setAnnouncementDismissal } from '@/lib/announcementStore';
import type { Announcement } from '@/types';

/**
 * Site-wide announcement popup — content is fully editable from
 * Admin Dashboard → Thông báo (see /admin/announcement), stored server-side
 * in the `site_announcement` table. Dismissal is remembered client-side in
 * IndexedDB (src/lib/announcementStore.ts), keyed by the announcement's
 * `version` so an admin edit re-shows it even to visitors who already
 * snoozed an older version.
 *
 * Two dismiss actions, mirroring the reference design's two buttons:
 *   - "Đóng {snoozeHours} giờ" (copper, primary) — persists a snooze in
 *     IndexedDB for the admin-configured number of hours.
 *   - "Đóng" (danger, secondary — same as the modal's × button) — closes
 *     for this page load only, no persistence, so it reappears on the
 *     visitor's next visit/reload.
 *
 * Hidden on /admin (internal tooling, not a storefront) — same convention
 * as VipAnnouncementBar.
 */
const ANNOUNCEMENT_REFRESH_EVENT = 'vnsvault:refresh-announcement';

/**
 * Call this right after saving the announcement in the admin panel so
 * this modal re-fetches immediately. Without it, since this component
 * only fetches once per mount (see below), an admin who saves a new
 * version and then navigates home via the logo (a client-side route
 * change, not a full reload) would see stale — or no — announcement data
 * until a manual page refresh.
 */
export function refreshAnnouncement() {
  window.dispatchEvent(new Event(ANNOUNCEMENT_REFRESH_EVENT));
}

export default function AnnouncementModal() {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(false);

  // Fetched once on mount (this component lives in the root layout, so it
  // mounts exactly once per session) rather than re-fetching per route —
  // the pathname check below only controls whether it's ALLOWED to show,
  // not whether it fetches. `refreshAnnouncement()` above is the escape
  // hatch for the one case that needs an immediate re-fetch anyway.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/announcement', { cache: 'no-store' });
        const json = await res.json();
        if (cancelled || !json?.success || !json.data) return;

        const ann: Announcement = json.data;
        if (!ann.enabled) { setAnnouncement(null); setOpen(false); return; }

        const dismissal = await getAnnouncementDismissal();
        if (isDismissalActive(dismissal, ann.version)) return;

        if (!cancelled) {
          setAnnouncement(ann);
          setOpen(true);
        }
      } catch {
        // Fail soft — no popup rather than a broken page.
      }
    }

    load();

    const onRefresh = () => load();
    window.addEventListener(ANNOUNCEMENT_REFRESH_EVENT, onRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener(ANNOUNCEMENT_REFRESH_EVENT, onRefresh);
    };
  }, []);

  const hiddenHere = pathname?.startsWith('/admin');
  const shown = open && announcement && !hiddenHere;

  if (!announcement) return null;

  // "Đóng" / × button — session-only close, nothing persisted.
  const closeOnly = () => setOpen(false);

  // "Đóng {N} giờ" button — persists the snooze.
  const snooze = async () => {
    await setAnnouncementDismissal(announcement.version, announcement.snoozeHours);
    setOpen(false);
  };

  return (
    <Modal open={!!shown} onClose={closeOnly} title={announcement.title} label="Thông báo" maxWidthClassName="max-w-lg">
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        <AnnouncementBody body={announcement.body} />
      </div>
      <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-border">
        <button onClick={snooze} className="btn-copper press-scale text-xs sm:text-sm">
          Đóng {announcement.snoozeHours} giờ
        </button>
        <button onClick={closeOnly} className="btn-danger press-scale text-xs sm:text-sm">
          Đóng
        </button>
      </div>
    </Modal>
  );
}
