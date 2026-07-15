export type Role = 'user' | 'admin';
export type GameEngine =
  | 'renpy'
  | 'kirikiri'
  | 'unity'
  | 'rpgmaker'
  | 'tyranobuild'
  | 'godot'
  | 'wolfrpg'
  | 'unreal'
  | 'artemis'
  | 'catsystem2'
  | 'other';
export type GameStatus = 'completed' | 'in_progress' | 'paused' | 'demo';
export type AgeRating = 'all' | '16+' | '18+';
export type Platform = 'windows' | 'android' | 'macos' | 'ios' | 'linux' | 'webhtml5';
export type RequestStatus = 'pending' | 'approved' | 'in_progress' | 'rejected';
export type ReportStatus = 'open' | 'resolved';

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  avatar_url?: string;
  created_at: string;
}

export interface Translator {
  id: string;
  name: string;
  slug: string;
  bio?: string;
  discord_url?: string;
  website_url?: string;
  avatar_url?: string;
}

export interface Genre {
  id: number;
  name: string;
  slug: string;
}

export interface GameDownload {
  id: string;
  game_id: string;
  version: string;
  platform: Platform;
  url: string;
  /** Display label for the link itself, e.g. "Google Drive", "Pixeldrain" — NOT the version. */
  label?: string;
  created_at: string;
}

export interface Game {
  id: string;
  title: string;
  slug: string;
  description: string;
  cover_url?: string;
  banner_url?: string;
  developer?: string;
  engine?: GameEngine;
  status: GameStatus;
  age_rating: AgeRating;
  translator_id?: string;
  translator_note?: string;
  view_count: number;
  download_count: number;
  bookmark_count?: number;
  is_featured: boolean;
  published: boolean;
  created_at: string;
  updated_at: string;
  translator?: Translator;
  genres?: Genre[];
  downloads?: GameDownload[];
}

export interface GameRequest {
  id: string;
  title: string;
  source_url?: string;
  engine?: string;
  description?: string;
  submitted_by?: string;
  status: RequestStatus;
  vote_count: number;
  created_at: string;
  user_voted?: boolean;
}

export interface LinkReport {
  id: string;
  game_id: string;
  download_id?: string;
  reason?: string;
  status: ReportStatus;
  created_at: string;
  // Joined fields, present on admin list views only
  game_title?: string;
  game_slug?: string;
  download_version?: string;
  download_platform?: Platform;
  download_url?: string;
}

// ─── Site announcement popup ────────────────────────────────────────────
// See schema.sql's `site_announcement` table for the storage side of this
// shape — it's stored verbatim as the `body` JSONB column.
export type AnnouncementTone = 'default' | 'muted' | 'copper' | 'gold' | 'danger';

export interface AnnouncementSegment {
  text: string;
  bold?: boolean;
  tone?: AnnouncementTone;
  /** Optional http(s) link — segment renders as an underlined <a> instead of plain text. */
  href?: string;
}

/** One line of the popup body; each paragraph is a list of inline segments so a single line can mix bold/colored/linked text. */
export type AnnouncementParagraph = AnnouncementSegment[];

export interface Announcement {
  enabled: boolean;
  version: number;
  title: string;
  body: AnnouncementParagraph[];
  /** Hours the "Đóng N giờ" button snoozes the popup for, once dismissed that way. */
  snoozeHours: number;
  updatedAt: string;
}

export interface SessionPayload {
  userId: string;
  username: string;
  role: Role;
  avatar_url?: string | null;
  exp: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
