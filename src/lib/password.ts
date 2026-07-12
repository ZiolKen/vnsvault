/**
 * Password hashing — Node.js runtime ONLY (bcryptjs).
 * Import this ONLY from API route handlers, NEVER from middleware.
 */

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 12);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(plain, hash);
}
