import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveRole, effectivePermissions } from "@/lib/permissions";

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
    // select("*") (et non "role" explicite) : tolère que la migration 0078
    // ne soit pas encore appliquée (sinon la requête échoue et bloquerait
    // l'accès à tout le monde). resolveRole retombe sur is_admin si pas de role.
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    const isApproved = profile?.approved === true;
    const role = resolveRole(profile ?? {});

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

    // ===== Gardes de routes par permission (couche 1) =====
    // Droits EFFECTIFS lus en base (role_permissions, éditable via /admin/roles),
    // fallback code. L'admin a tout → on ne requête même pas. On ne charge la
    // matrice que sur les routes sensibles (perf).
    const GATED = ["/admin", "/finance", "/facturation", "/parametrage"];
    const onGated = GATED.some((p) => path.startsWith(p));
    if (isApproved && role !== "admin" && (onGated || path === "/")) {
      const { data: rows } = await supabase
        .from("role_permissions")
        .select("role, permission");
      const perms = effectivePermissions(role, rows ?? null);

      const denied =
        (path.startsWith("/admin") && !perms.has("manage_users")) ||
        (path.startsWith("/finance") && !perms.has("view_finance")) ||
        (path.startsWith("/facturation") && !perms.has("view_facturation")) ||
        (path.startsWith("/parametrage") && !perms.has("edit_parametrage"));

      // Externe : pas de dashboard financier d'accueil.
      if (denied || (role === "externe" && path === "/")) {
        const url = request.nextUrl.clone();
        url.pathname = role === "externe" ? "/clients" : "/";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
