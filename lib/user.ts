import type { User } from "@supabase/supabase-js";

export type NavUser = {
  email: string;
  name: string;
  avatarUrl: string | null;
  initial: string;
};

// Normalize a Supabase user (Google metadata or plain email) into the small
// shape the nav / account UI needs.
export function toNavUser(user: User | null): NavUser | null {
  if (!user) return null;
  const m = user.user_metadata ?? {};
  const email = user.email ?? "";
  const name: string = m.full_name || m.name || email.split("@")[0] || "there";
  const avatarUrl: string | null = m.avatar_url || m.picture || null;
  const initial = (name.trim()[0] || email.trim()[0] || "?").toUpperCase();
  return { email, name, avatarUrl, initial };
}
