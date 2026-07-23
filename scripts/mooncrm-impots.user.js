// ==UserScript==
// @name         MoonCRM → impots.gouv (bouton T)
// @namespace    mooncrm
// @version      1.2
// @description  Depuis le bouton T du CRM : préremplit l'email sur la mire de connexion pro, puis une fois connecté ouvre "Choisir un dossier", saisit le SIREN et valide. Le captcha et le mot de passe restent gérés par l'humain / le navigateur.
// @match        https://cfspro-idp.impots.gouv.fr/*
// @match        https://cfspro.impots.gouv.fr/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ───────────────────────── Config ─────────────────────────
  const EMAIL = "impots@moonexpertise.fr"; // e-mail de l'espace pro
  const TTL_MS = 10 * 60 * 1000;           // le SIREN "en attente" expire après 10 min

  const now = () => Date.now();

  // ─────────────── 1. Capture du SIREN passé par le bouton T ───────────────
  // Le bouton T ouvre https://cfspro-idp.impots.gouv.fr/#mc_siren=XXXXXXXXX
  const m = location.hash.match(/mc_siren=(\d{9})/);
  if (m) {
    GM_setValue("mc_siren", m[1]);
    GM_setValue("mc_siren_ts", now());
    // Nettoie le hash pour ne pas perturber la mire
    history.replaceState(null, "", location.pathname + location.search);
  }

  function pendingSiren() {
    const s = GM_getValue("mc_siren", null);
    const ts = GM_getValue("mc_siren_ts", 0);
    if (!s || now() - ts > TTL_MS) return null;
    return s;
  }

  function clearPending() {
    GM_setValue("mc_siren", null);
    GM_setValue("mc_siren_ts", 0);
  }

  // Petit bandeau d'état en bas de page
  function banner(text) {
    let el = document.getElementById("mc-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "mc-banner";
      el.style.cssText =
        "position:fixed;bottom:12px;right:12px;z-index:99999;background:#01071B;color:#fff;" +
        "padding:8px 14px;border-radius:8px;font:13px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.35)";
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  // ─────────────── 2. Mire de connexion : préremplir l'email ───────────────
  if (location.hostname === "cfspro-idp.impots.gouv.fr") {
    const fill = () => {
      const user = document.querySelector('input[name="user"]');
      const captcha = document.querySelector('input[name="captcha"]');
      if (!user) return false;
      if (!user.value) {
        user.value = EMAIL;
        user.dispatchEvent(new Event("input", { bubbles: true }));
        user.dispatchEvent(new Event("change", { bubbles: true }));
      }
      // Focus direct sur le captcha : le mot de passe est prérempli par le
      // gestionnaire du navigateur, il ne reste que le captcha à taper.
      if (captcha) captcha.focus();
      if (pendingSiren()) banner("MoonCRM : SIREN " + pendingSiren() + " prêt — tape le captcha puis connecte-toi.");
      return true;
    };
    if (!fill()) {
      const obs = new MutationObserver(() => { if (fill()) obs.disconnect(); });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 15000);
    }
  }

  // ─────────────── 3. Espace pro connecté : aller au dossier ───────────────
  if (location.hostname === "cfspro.impots.gouv.fr") {
    const siren = pendingSiren();
    if (!siren) return;

    const fire = (el) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("keyup", { bubbles: true }));
    };
    const clickValider = (scope) => {
      const all = [...(scope || document).querySelectorAll('a, button, input[type="submit"], input[type="button"], input[type="image"]')];
      const v = all.find((el) => /valider/i.test(el.textContent || el.value || el.alt || ""));
      if (v) { v.click(); return true; }
      return false;
    };

    // 3a-1. Page "Changer de dossier" : le SIREN se saisit dans 9 cases
    //       d'un caractère chacune -> on distribue chiffre par chiffre.
    const boxes = [...document.querySelectorAll('input[maxlength="1"]')]
      .filter((el) => el.offsetParent !== null);
    if (boxes.length >= 9) {
      siren.split("").forEach((d, k) => {
        boxes[k].value = d;
        fire(boxes[k]);
      });
      clearPending();
      banner("MoonCRM : SIREN " + siren + " saisi.");
      if (!clickValider(boxes[0].closest("form"))) clickValider(document);
      return;
    }

    // 3a-2. Variante : un champ SIREN unique (9 caractères).
    const sirenInput =
      document.querySelector(
        'input[name="siren"], input[id*="siren" i], input[name*="siren" i]'
      ) ||
      [...document.querySelectorAll('input[type="text"][maxlength="9"], input:not([type])[maxlength="9"]')]
        .find((el) => el.offsetParent !== null);
    if (sirenInput) {
      sirenInput.value = siren;
      fire(sirenInput);
      clearPending();
      banner("MoonCRM : SIREN " + siren + " saisi.");
      const form = sirenInput.closest("form");
      if (!clickValider(form) && !clickValider(document)) {
        const submit =
          (form && form.querySelector('button[type="submit"], input[type="submit"]')) ||
          document.querySelector('button[type="submit"], input[type="submit"]');
        if (submit) submit.click();
        else if (form) form.submit();
      }
      return;
    }

    // 3b. Sinon, on cherche le lien "Changer de dossier" (libellé de la mire
    //     accueil.do) ou "Choisir un dossier" et on clique.
    const links = [...document.querySelectorAll("a, button")];
    const target = links.find((a) =>
      /(changer|choisir)\s+(de|un)\s+dossier/i.test(a.textContent || "")
    );
    if (target) {
      banner("MoonCRM : navigation vers le choix de dossier…");
      target.click();
      return;
    }

    // 3c. Repli : on signale que le SIREN est dans le presse-papiers.
    banner("MoonCRM : SIREN " + siren + " copié — ouvre Dossier > Changer de dossier puis Ctrl+V.");
  }
})();
