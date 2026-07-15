import type { AnnouncementParagraph, AnnouncementTone } from '@/types';

// Maps each admin-selectable tone to theme tokens (tailwind.config.ts /
// globals.css design tokens) so every color an admin can pick already
// belongs to the site's palette — no ad-hoc hex values leaking into
// admin-authored content.
const TONE_CLASS: Record<AnnouncementTone, string> = {
  default: 'text-ghost',
  muted: 'text-ghost-dim',
  copper: 'text-copper-light',
  gold: 'text-gold',
  danger: 'text-red-400',
};

/**
 * Renders an announcement's `body` (array of paragraphs, each an array of
 * inline segments) with each segment's tone/bold/link styling applied.
 * Shared between AnnouncementModal (public popup) and the admin editor's
 * live preview so both always render identically.
 */
export default function AnnouncementBody({ body }: { body: AnnouncementParagraph[] }) {
  if (body.length === 0) {
    return <p className="text-ghost-dim text-sm italic">Chưa có nội dung.</p>;
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {body.map((paragraph, pi) => (
        <p key={pi}>
          {paragraph.map((segment, si) => {
            const toneClass = TONE_CLASS[segment.tone ?? 'default'] ?? TONE_CLASS.default;
            const boldClass = segment.bold ? 'font-semibold' : '';
            const classes = [toneClass, boldClass].filter(Boolean).join(' ');
            if (segment.href) {
              return (
                <a
                  key={si}
                  href={segment.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${classes} underline underline-offset-2 hover:text-copper-light transition-colors`}
                >
                  {segment.text}
                </a>
              );
            }
            return (
              <span key={si} className={classes || undefined}>
                {segment.text}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
