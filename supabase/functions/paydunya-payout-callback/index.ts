// @ts-nocheck
// supabase/functions/paydunya-payout-callback/index.ts
//
// PayDunya appelle cette URL quand un déboursement atteint son statut final.
// verify_jwt DOIT être false (voir config.toml).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYDUNYA_MASTER_KEY = Deno.env.get("PAYDUNYA_MASTER_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, PAYDUNYA-MASTER-KEY",
};

async function sha512Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeStatus(rawStatus) {
  if (!rawStatus) return "failed";
  const s = String(rawStatus).toLowerCase().trim();
  if (["success", "completed", "complete", "paid", "done"].includes(s)) return "success";
  return "failed";
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const startTime = Date.now();

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);

  if (!PAYDUNYA_MASTER_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Secrets manquants");
    return jsonResponse({ error: "Configuration serveur incomplète" }, 500);
  }

  try {
    const rawBody = await req.text();
    const contentType = req.headers.get("content-type") || "";
    console.log("content-type:", contentType);
    console.log("body brut reçu:", rawBody);

    let body = {};

    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(rawBody);
      } catch (parseErr) {
        console.error("JSON invalide:", parseErr);
        return jsonResponse({ error: "Body JSON invalide" }, 400);
      }
    } else {
      const params = new URLSearchParams(rawBody);
      const dataRaw = params.get("data");
      const hashFromForm = params.get("hash");

      console.log("data brut:", dataRaw);
      console.log("hash du form:", hashFromForm);

      if (!dataRaw) {
        return jsonResponse({ error: "Champ 'data' manquant", raw: rawBody }, 400);
      }

      try {
        body = JSON.parse(dataRaw);
      } catch (parseErr) {
        console.error("'data' n'est pas du JSON valide:", parseErr);
        return jsonResponse({ error: "Champ 'data' invalide", raw: dataRaw }, 400);
      }

      if (hashFromForm && !body.hash) body.hash = hashFromForm;
    }

    console.log("body parsé:", JSON.stringify(body));

    const expectedHash = await sha512Hex(PAYDUNYA_MASTER_KEY);
    const receivedHash = body.hash || body.signature;
    console.log("hash reçu:", receivedHash);
    console.log("hash attendu:", expectedHash);

    if (!receivedHash || receivedHash !== expectedHash) {
      console.warn("Hash invalide, requête rejetée");
      return jsonResponse({ error: "Signature invalide" }, 401);
    }

    const payoutId =
      body.disburse_id ||
      (body.custom_data && body.custom_data.payout_id) ||
      (body.custom_data && body.custom_data.disburse_id);
    console.log("payoutId extrait:", payoutId);

    if (!payoutId) {
      return jsonResponse({ error: "disburse_id manquant", body }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: existing, error: selectError } = await supabase
      .from("payout_requests")
      .select("id, status, amount, user_id")
      .eq("id", payoutId)
      .maybeSingle();

    if (selectError) {
      console.error("Erreur SELECT:", selectError);
      return jsonResponse({ error: "Erreur lecture BDD", details: selectError.message }, 500);
    }

    if (!existing) {
      console.warn("Payout introuvable:", payoutId);
      return jsonResponse({ warning: "Payout introuvable", payoutId }, 200);
    }

    if (existing.status === "success" || existing.status === "failed") {
      console.log("Déjà traité, ignoré", { payoutId, currentStatus: existing.status });
      return jsonResponse({ ok: true, note: "Déjà traité", status: existing.status }, 200);
    }

    const newStatus = normalizeStatus(body.status);
    const transactionId = body.transaction_id || body.transactionId || body.provider_ref || null;

    console.log("mise à jour:", { payoutId, newStatus, transactionId, rawStatus: body.status });

    const { error: updateError } = await supabase
      .from("payout_requests")
      .update({
        status: newStatus,
        transaction_id: transactionId,
        provider_ref: body.disburse_token || body.token || null,
        response_text: body.response_text || body.message || null,
        completed_at: newStatus === "success" ? new Date().toISOString() : null,
      })
      .eq("id", payoutId);

    if (updateError) {
      console.error("Erreur UPDATE:", updateError);
      return jsonResponse({ error: "Erreur mise à jour BDD", details: updateError.message }, 500);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ payout ${payoutId} traité en ${duration}ms → ${newStatus}`);

    return jsonResponse({ ok: true, payoutId, status: newStatus }, 200);
  } catch (err) {
    console.error("exception non gérée:", err);
    return jsonResponse({ error: "Erreur serveur", details: String(err) }, 500);
  }
});
