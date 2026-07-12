/**
 * The 16-avatar preset pack regular users can pick from
 * (public/avatars/users-1.svg … users-16.svg). Admins are allowed to set
 * any custom URL instead — see /api/account/avatar.
 */
export const PRESET_AVATAR_COUNT = 16;

export const PRESET_AVATARS: string[] = Array.from(
  { length: PRESET_AVATAR_COUNT },
  (_, i) => `/avatars/users-${i + 1}.svg`
);

export function isPresetAvatar(url: string): boolean {
  return PRESET_AVATARS.includes(url);
}
