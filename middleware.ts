import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getUser() —
  // it can cause random logouts.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // The studio and account pages require a session.
  // The access-code check happens server-side inside /studio itself.
  const needsAuth =
    pathname.startsWith("/studio") || pathname.startsWith("/account");
  if (!user && needsAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Already signed in — no reason to see the login page.
  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/studio";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  // Skip static assets; run everywhere else so sessions stay fresh.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|stl|ico)$).*)",
  ],
};
