import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Mode démo : si Supabase n'est pas configuré, on laisse passer toutes les pages.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico" ||
    // Webhooks externes : doivent être joignables sans session auth.
    // La validation se fait via signature HMAC (TALLY_WEBHOOK_SECRET).
    path.startsWith("/api/tally");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Si user logué, on vérifie son statut d'approbation. Le profile est créé
  // automatiquement par le trigger handle_new_user() à chaque signup, donc
  // il devrait toujours exister pour un user valide.
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("approved, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    const isApproved = profile?.approved === true;
    const isAdmin = profile?.is_admin === true;

    // Pages réservées aux admins
    if (path.startsWith("/admin") && !isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    // Non-approuvé : seule la page /en-attente lui est accessible.
    if (!isApproved && path !== "/en-attente") {
      const url = request.nextUrl.clone();
      url.pathname = "/en-attente";
      return NextResponse.redirect(url);
    }

    // Approuvé qui visite /en-attente par erreur → redirect home
    if (isApproved && path === "/en-attente") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
