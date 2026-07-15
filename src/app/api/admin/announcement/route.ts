export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { requireFreshAdmin } from '@/lib/adminGuard';
import { getAnnouncement, updateAnnouncement } from '@/lib/announcement';
import { isHttpUrl } from '@/lib/utils';
import type { AnnouncementParagraph, AnnouncementSegment, AnnouncementTone } from '@/types';

const VALID_TONES: AnnouncementTone[] = ['default', 'muted', 'copper', 'gold', 'danger'];
const MAX_PARAGRAPHS = 40;
const MAX_SEGMENTS_PER_PARAGRAPH = 20;
const MAX_SEGMENT_TEXT_LEN = 500;
const MAX_TITLE_LEN = 200;
const MAX_HREF_LEN = 2000;

export async function GET(req: NextRequest) {
  if (!await requireFreshAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }
  try {
    const announcement = await getAnnouncement();
    return NextResponse.json({ success: true, data: announcement });
  } catch (e) {
    console.error('[GET /api/admin/announcement]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * Validates and normalizes an admin-submitted body payload. Throws a
 * user-facing string message on the first invalid field — kept simple
 * (single first-error message) since the form only has one save action
 * and one place to surface it, unlike GameForm's per-field errors.
 */
function parseBody(raw: unknown): AnnouncementParagraph[] {
  if (!Array.isArray(raw)) throw new Error('Nội dung không hợp lệ.');
  if (raw.length > MAX_PARAGRAPHS) throw new Error(`Tối đa ${MAX_PARAGRAPHS} đoạn văn.`);

  return raw.map((paragraph): AnnouncementParagraph => {
    if (!Array.isArray(paragraph)) throw new Error('Nội dung không hợp lệ.');
    if (paragraph.length > MAX_SEGMENTS_PER_PARAGRAPH) {
      throw new Error(`Tối đa ${MAX_SEGMENTS_PER_PARAGRAPH} đoạn nhỏ mỗi dòng.`);
    }
    if (paragraph.length === 0) throw new Error('Mỗi đoạn văn cần ít nhất một đoạn nhỏ có nội dung.');

    return paragraph.map((seg): AnnouncementSegment => {
      const s = seg as Partial<AnnouncementSegment> | null;
      const text = typeof s?.text === 'string' ? s.text.trim() : '';
      if (!text) throw new Error('Mỗi đoạn nhỏ cần có nội dung.');
      if (text.length > MAX_SEGMENT_TEXT_LEN) throw new Error(`Mỗi đoạn nhỏ tối đa ${MAX_SEGMENT_TEXT_LEN} ký tự.`);

      const tone = s?.tone && VALID_TONES.includes(s.tone) ? s.tone : undefined;
      const bold = s?.bold === true ? true : undefined;

      let href: string | undefined;
      if (typeof s?.href === 'string' && s.href.trim()) {
        const trimmed = s.href.trim();
        if (trimmed.length > MAX_HREF_LEN) throw new Error(`Đường dẫn tối đa ${MAX_HREF_LEN} ký tự.`);
        if (!isHttpUrl(trimmed)) throw new Error('Đường dẫn phải là URL http(s) hợp lệ.');
        href = trimmed;
      }

      return { text, ...(bold ? { bold } : {}), ...(tone ? { tone } : {}), ...(href ? { href } : {}) };
    });
  });
}

export async function PUT(req: NextRequest) {
  if (!await requireFreshAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }

  try {
    const raw = await req.json() as {
      enabled?: unknown;
      title?: unknown;
      body?: unknown;
      snoozeHours?: unknown;
    };

    const enabled = raw.enabled === true;

    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) {
      return NextResponse.json({ success: false, error: 'Vui lòng nhập tiêu đề.' }, { status: 400 });
    }
    if (title.length > MAX_TITLE_LEN) {
      return NextResponse.json({ success: false, error: `Tiêu đề tối đa ${MAX_TITLE_LEN} ký tự.` }, { status: 400 });
    }

    const snoozeHours = Number(raw.snoozeHours);
    if (!Number.isInteger(snoozeHours) || snoozeHours < 1 || snoozeHours > 168) {
      return NextResponse.json(
        { success: false, error: 'Thời gian đóng phải là số nguyên từ 1 đến 168 giờ.' },
        { status: 400 }
      );
    }

    let body: AnnouncementParagraph[];
    try {
      body = parseBody(raw.body);
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error).message }, { status: 400 });
    }

    if (enabled && body.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng thêm nội dung trước khi bật thông báo.' },
        { status: 400 }
      );
    }

    const announcement = await updateAnnouncement({ enabled, title, body, snoozeHours });
    return NextResponse.json({ success: true, data: announcement });
  } catch (e) {
    console.error('[PUT /api/admin/announcement]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}
