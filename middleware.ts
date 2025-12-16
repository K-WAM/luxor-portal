import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const PROTECTED_MATCHERS = ["/owner", "/tenant", "/admin"];

export async function middleware(request: NextRequest) {
  // Only guard protected paths
  if (!PROTECTED_MATCHERS.some((path) => request.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next();
  }

  let response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options?: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options?: CookieOptions) {
          response.cookies.set({ name, value: "", ...options, expires: new Date(0) });
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const role = (user.user_metadata as any)?.role;
  const path = request.nextUrl.pathname;

  if (path.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (path.startsWith("/owner") && role !== "owner" && role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (path.startsWith("/tenant") && role !== "tenant" && role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/owner/:path*", "/tenant/:path*", "/admin/:path*"],
};
