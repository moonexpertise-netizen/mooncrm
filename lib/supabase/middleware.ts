import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveRole, effectivePermissions, isRole, type Role } from "@/lib/permissions";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// ============================================================================
//  Cache court de la décision d'auth (approbation + rôle)
// ============================================================================
//
// Le middleware tourne à CHAQUE navigation. Sans cache, il fait 2-3 allers-
// retours Supabase séquentiels (getUser + profiles + parfois role_permissions)
// AVANT que la page ne s'affiche → latence perçue à chaque clic.
//
// On met en cache le couple {approved, role} dans un cookie SIGNÉ (HMAC-SHA256)
// pendant 120s. Tant qu'il est valide, on saute la requête `profiles`. Le
// cookie est signé avec AUTH_CACHE_SECRET → infalsifiable (un utilisateur ne
// peut pas se forger un role=admin). Si le secret n'est pas configuré, on
// retombe EXACTEMENT sur le comportement actuel (requête à chaque fois) : aucun
// risque de régression, juste pas d'accélération.
//
// Sécurité : c'est un cache de ROUTAGE (couche 1). Les données restent
// protégées par les RLS Supabase (couche réelle) et les server actions
// (requirePermission). Un changement de rôle/approbation par un admin se
// propage en ≤120s pour le routage ; les données suivent immédiatement (RLS).
const CACHE_COOKIE = "mc_auth_cache";
const CACHE_TTL_MS = 120_000;

function bytesToB64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(b: string): Uint8Array {
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
  const bin = atob(b.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToB64url(sig);
}

async function buildAuthCache(
  secret: string,
  uid: string,
  approved: boolean,
  role: Role,
): Promise<string> {
  const json = JSON.stringify({ u: uid, a: approved ? 1 : 0, r: role, e: Date.now() + CACHE_TTL_MS });
  const payload = bytesToB64url(new TextEncoder().encode(json));
  const sig = await hmac(payload, secret);
  return `${payload}.${sig}`;
}

async function readAuthCache(
  secret: string,
  raw: string | undefined,
  uid: string,
): Promise<{ approved: boolean; role: Role } | null> {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  // Vérifie la signature : si elle ne matche pas (cookie forgé/altéré), on
  // ignore le cache et on requête la base.
  const expected = await hmac(payload, secret);
  if (sig !== expected) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))) as {
      u: string;
      a: number;
      r: string;
      e: number;
    };
    if (obj.u !== uid) return null; // cookie d'un autre utilisateur
    if (typeof obj.e !== "number" || obj.e < Date.now()) return null; // expiré
    if (!isRole(obj.r)) return null;
    return { approved: obj.a === 1, role: obj.r };
  } catch {
    return null;
  }
}

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

  // Perf : éviter l'aller-retour réseau `getUser()` à CHAQUE navigation (c'est
  // la principale latence résiduelle en prod). On lit la session en LOCAL
  // (cookies, sans réseau) et on ne valide/rafraîchit via `getUser()` (réseau)
  // que s'il n'y a pas de session OU que le token approche de l'expiration
  // (< 5 min) -> le refresh se fait juste avant l'expiration, pas à chaque clic.
  //
  // Sécurité : c'est la couche de ROUTAGE (couche 1). Les données restent
  // protégées par les RLS Supabase (le JWT envoyé à PostgREST est validé côté
  // base) + les server actions (requirePermission). Un token altéré ne donne
  // accès à aucune donnée.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const now = Math.floor(Date.now() / 1000);
    if (session?.user && (session.expires_at ?? 0) - now > 300) {
      user = session.user;
    } else {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }
  } catch {
    // Repli sûr : comportement d'origine (validation réseau systématique).
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

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

  // Si user logué, on vérifie son statut d'approbation + rôle.
  if (user && !isPublic) {
    const secret = process.env.AUTH_CACHE_SECRET;

    // Lecture du cache signé (skip la requête profiles s'il est valide).
    const cached = secret
      ? await readAuthCache(secret, request.cookies.get(CACHE_COOKIE)?.value, user.id)
      : null;

    let approved: boolean;
    let role: Role;

    if (cached) {
      approved = cached.approved;
      role = cached.role;
    } else {
      // select ciblé (approved/role/is_admin) au lieu de "*". select("*") ne
      // sert qu'à tolérer une migration 0078 non appliquée : ces 3 colonnes
      // existent toujours pour un compte valide ; resolveRole retombe sur
      // is_admin si role est null.
      const { data: profile } = await supabase
        .from("profiles")
        .select("approved, role, is_admin")
        .eq("id", user.id)
        .maybeSingle();

      approved = profile?.approved === true;
      role = resolveRole(profile ?? {});

      // Rafraîchit le cookie de cache pour les prochaines navigations.
      if (secret) {
        const val = await buildAuthCache(secret, user.id, approved, role);
        response.cookies.set(CACHE_COOKIE, val, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: Math.floor(CACHE_TTL_MS / 1000),
        });
      }
    }

    // Non-approuvé : seule la page /en-attente lui est accessible.
    if (!approved && path !== "/en-attente") {
      const url = request.nextUrl.clone();
      url.pathname = "/en-attente";
      return NextResponse.redirect(url);
    }

    // Approuvé qui visite /en-attente par erreur → redirect home
    if (approved && path === "/en-attente") {
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
    if (approved && role !== "admin" && (onGated || path === "/")) {
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
