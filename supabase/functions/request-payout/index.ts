// @ts-nocheck
// supabase/functions/request-payout/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PAYDUNYA_MASTER_KEY = Deno.env.get("PAYDUNYA_MASTER_KEY");
const PAYDUNYA_PRIVATE_KEY = Deno.env.get("PAYDUNYA_PRIVATE_KEY");
const PAYDUNYA_TOKEN = Deno.env.get("PAYDUNYA_TOKEN");

// ✅ Taux passé de 1,5 % à 15 %
const NET_FEE_RATE = 0.15;
const MIN_PAYOUT_AMOUNT = 500;

const ALLOWED_MODES = new Set([
  "orange-money-senegal",
  "wave-senegal",
  "free-money-senegal",
  "expresso-senegal",
  "djamo-sn",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}
function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Authorization manquant" }, 401);
    }
    const accessToken = authHeader.slice(7);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !userData || !userData.user) {
      return jsonResponse({ error: "Session invalide" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const amount = Math.round(Number(body.amount));
    const payoutMode = String(body.payout_mode || "").trim();
    const payoutAccount = String(body.payout_account || "").replace(/\D/g, "");

    if (!amount || amount < MIN_PAYOUT_AMOUNT) {
      return jsonResponse({ error: `Montant minimum : ${MIN_PAYOUT_AMOUNT} CFA` }, 400);
    }
    if (!ALLOWED_MODES.has(payoutMode)) {
      return jsonResponse({ error: `Mode de retrait invalide : ${payoutMode}` }, 400);
    }
    if (!/^\d{6,12}$/.test(payoutAccount)) {
      return jsonResponse({ error: "Numéro de compte invalide (6 à 12 chiffres)" }, 400);
    }

    // ✅ FIX : on ne filtre PLUS sur payment_status. Le front calcule le solde
    // uniquement à partir de status === 'done'. Le filtre payment_status = 'paid'
    // créait un désaccord si la colonne n'était pas remplie exactement.
    // On garde uniquement le filtre sur status === 'done' (argent débloqué
    // seulement après scan du QR code par le salon).
    const { data: bookings, error: bErr } = await supabase
      .from("bookings")
      .select("service_price, net_amount, status")
      .eq("salon_user_id", userId);
    if (bErr) {
      console.error("Erreur lecture bookings:", bErr);
      return jsonResponse({ error: "Erreur lecture des réservations" }, 500);
    }

    // Seules les réservations "done" (ticket scanné) comptent
    const totalNetRevenue = (bookings || [])
      .filter((b) => b.status === "done")
      .reduce((sum, b) => {
        const net = b.net_amount != null
          ? b.net_amount
          : Math.round(Number(b.service_price) * (1 - NET_FEE_RATE));
        return sum + net;
      }, 0);

    const { data: payouts, error: pErr } = await supabase
      .from("payout_requests")
      .select("amount, status")
      .eq("user_id", userId);
    if (pErr) {
      console.error("Erreur lecture payouts:", pErr);
      return jsonResponse({ error: "Erreur lecture des retraits" }, 500);
    }

    const takenOrInFlight = (payouts || [])
      .filter((p) => p.status !== "failed")
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const availableBalance = Math.max(0, totalNetRevenue - takenOrInFlight);

    console.log("💰 Total net (done):", totalNetRevenue, "| Déjà pris/en cours:", takenOrInFlight, "| Disponible:", availableBalance, "| Demandé:", amount);

    if (amount > availableBalance) {
      return jsonResponse(
        { error: `Solde insuffisant. Disponible : ${availableBalance.toLocaleString()} CFA` },
        400
      );
    }

    const { data: payoutRow, error: insertErr } = await supabase
      .from("payout_requests")
      .insert({
        user_id: userId,
        amount,
        payout_mode: payoutMode,
        payout_account: payoutAccount,
        status: "created",
      })
      .select()
      .single();

    if (insertErr || !payoutRow) {
      console.error("Erreur insert payout:", insertErr);
      return jsonResponse({ error: "Erreur création du retrait" }, 500);
    }

    const payoutId = payoutRow.id;

    const callbackUrl = `${SUPABASE_URL}/functions/v1/paydunya-payout-callback`;
    const getInvoiceBody = {
      account_alias: payoutAccount,
      amount,
      withdraw_mode: payoutMode,
      callback_url: callbackUrl,
      disburse_id: payoutId,
    };

    console.log("PayDunya get-invoice body:", getInvoiceBody);

    const getInvoiceRes = await fetch("https://app.paydunya.com/api/v2/disburse/get-invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYDUNYA-MASTER-KEY": PAYDUNYA_MASTER_KEY,
        "PAYDUNYA-PRIVATE-KEY": PAYDUNYA_PRIVATE_KEY,
        "PAYDUNYA-TOKEN": PAYDUNYA_TOKEN,
      },
      body: JSON.stringify(getInvoiceBody),
    });

    const getInvoiceText = await safeText(getInvoiceRes);
    console.log("PayDunya get-invoice response:", getInvoiceRes.status, getInvoiceText);

    if (!getInvoiceRes.ok) {
      await supabase
        .from("payout_requests")
        .update({
          status: "failed",
          response_text: `get-invoice échoué (${getInvoiceRes.status}): ${getInvoiceText.slice(0, 300)}`,
        })
        .eq("id", payoutId);
      return jsonResponse({ error: `PayDunya a refusé la demande : ${getInvoiceText.slice(0, 200)}` }, 400);
    }

    const getInvoiceData = safeJson(getInvoiceText);
    if (!getInvoiceData || getInvoiceData.response_code !== "00") {
      await supabase
        .from("payout_requests")
        .update({
          status: "failed",
          response_text: `get-invoice response_code invalide: ${getInvoiceText.slice(0, 300)}`,
        })
        .eq("id", payoutId);
      return jsonResponse({ error: (getInvoiceData && getInvoiceData.response_text) || "PayDunya a refusé la demande" }, 400);
    }

    const disburseToken = getInvoiceData.disburse_token || getInvoiceData.token;
    if (!disburseToken) {
      await supabase
        .from("payout_requests")
        .update({ status: "failed", response_text: "disburse_token manquant dans la réponse PayDunya" })
        .eq("id", payoutId);
      return jsonResponse({ error: "Réponse PayDunya invalide (pas de token)" }, 500);
    }

    await supabase
      .from("payout_requests")
      .update({ status: "pending", disburse_token: disburseToken })
      .eq("id", payoutId);

    const submitBody = { disburse_invoice: disburseToken, disburse_id: payoutId };
    console.log("PayDunya submit-invoice body:", submitBody);

    const submitRes = await fetch("https://app.paydunya.com/api/v2/disburse/submit-invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYDUNYA-MASTER-KEY": PAYDUNYA_MASTER_KEY,
        "PAYDUNYA-PRIVATE-KEY": PAYDUNYA_PRIVATE_KEY,
        "PAYDUNYA-TOKEN": PAYDUNYA_TOKEN,
      },
      body: JSON.stringify(submitBody),
    });

    const submitText = await safeText(submitRes);
    console.log("PayDunya submit-invoice response:", submitRes.status, submitText);

    if (!submitRes.ok) {
      await supabase
        .from("payout_requests")
        .update({
          status: "failed",
          response_text: `submit-invoice échoué (${submitRes.status}): ${submitText.slice(0, 300)}`,
        })
        .eq("id", payoutId);
      return jsonResponse({ error: `PayDunya a refusé l'exécution : ${submitText.slice(0, 200)}` }, 400);
    }

    const submitData = safeJson(submitText);
    if (!submitData || (submitData.response_code && submitData.response_code !== "00")) {
      await supabase
        .from("payout_requests")
        .update({
          status: "failed",
          response_text: `submit-invoice refusé: ${submitText.slice(0, 300)}`,
        })
        .eq("id", payoutId);
      return jsonResponse({ error: (submitData && submitData.response_text) || "PayDunya a refusé l'exécution" }, 400);
    }

    await supabase
      .from("payout_requests")
      .update({ status: "processing" })
      .eq("id", payoutId);

    return jsonResponse({
      status: "processing",
      payout_id: payoutId,
      message: "Retrait en cours de traitement",
    });
  } catch (err) {
    console.error("request-payout erreur:", err);
    return jsonResponse({ error: "Erreur serveur", details: String(err) }, 500);
  }
});