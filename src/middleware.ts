import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { routing } from "../i18n/routing";

const intlMiddleware = createMiddleware(routing);

/**
 * Refreshes the admin's Supabase session and writes the rotated auth cookies
 * onto the response. Server Components can't set cookies, so without this the
 * access token expires after ~1 hour and the admin is silently signed out.
 */
async function refreshAdminSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Touching getUser() is what triggers the token refresh + setAll above.
  await supabase.auth.getUser();

  return response;
}

export default async function middleware(request: NextRequest) {
  // /admin lives outside the [locale] tree, so it must never go through
  // next-intl (which would redirect /admin/products to /es/admin/products and
  // 404) - it only needs its Supabase session kept alive.
  if (request.nextUrl.pathname.startsWith("/admin")) {
    return refreshAdminSession(request);
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
