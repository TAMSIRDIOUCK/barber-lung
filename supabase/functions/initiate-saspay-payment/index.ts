import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://barber-lunge.vercel.app",
  "http://localhost:5173",
];

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";

  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsFor(req),
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response("Origin not allowed", {
      status: 403,
      headers: { "Vary": "Origin" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsFor(req),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Méthode non autorisée" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SASPAY_KEY = Deno.env.get("SASPAY_API_KEY");

    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !SASPAY_KEY) {
      return jsonResponse(req, {
        error: "Configuration Supabase ou SASPAY incomplète",
      }, 500);
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(req, { error: "Authentification requise" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse(req, { error: "Session invalide" }, 401);
    }

    const body = await req.json();

    const {
      phone,
      firstName,
      lastName,
      email,
      network,
      subscription_id,
    } = body;

    if (!subscription_id || !phone || !network) {
      return jsonResponse(req, { error: "Paramètres manquants" }, 400);
    }

    if (typeof subscription_id !== "string" || typeof phone !== "string") {
      return jsonResponse(req, { error: "Paramètres invalides" }, 400);
    }

    if (!["wave_sn", "orange_money_sn"].includes(network)) {
      return jsonResponse(req, { error: "Réseau invalide" }, 400);
    }

    if (!/^\+221(70|75|76|77|78)\d{7}$/.test(phone)) {
      return jsonResponse(req, { error: "Numéro invalide" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: sub, error: subError } = await admin
      .from("subscriptions")
      .select("id, user_id, status, plan_id")
      .eq("id", subscription_id)
      .single();

    if (subError || !sub || sub.user_id !== user.id || sub.status !== "pending") {
      return jsonResponse(req, { error: "Abonnement invalide" }, 400);
    }

    const { data: plan, error: planError } = await admin
      .from("subscription_plans")
      .select("name, price, is_free, is_active")
      .eq("id", sub.plan_id)
      .single();

    if (
      planError ||
      !plan ||
      !plan.is_active ||
      plan.is_free ||
      Number(plan.price) <= 0
    ) {
      return jsonResponse(req, { error: "Formule indisponible" }, 400);
    }

    const customerEmail = user.email || email;

    if (!customerEmail || typeof customerEmail !== "string") {
      return jsonResponse(req, { error: "Email invalide" }, 400);
    }

    const payload = {
      amount: String(plan.price),
      currency: "XOF",
      country: "SN",
      description: `Abonnement ${plan.name} - LA COUPE`,
      customer: {
        email: customerEmail,
        first_name: firstName || "",
        last_name: lastName || "",
        phone,
      },
      network,
    };

    const res = await fetch(
      "https://api.saspay.me/api/v1/payments/softpay/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SASPAY_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `sub-${sub.id}`,
        },
        body: JSON.stringify(payload),
      },
    );

    const responseText = await res.text();
    let data: Record<string, any> = {};

    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText };
    }

    console.log("SASPAY HTTP:", res.status);

    if (!res.ok) {
      console.error("SASPAY error:", data);
      return jsonResponse(req, {
        error: "SASPAY a refusé le paiement",
        details: data,
      }, 502);
    }

    const checkoutUrl =
      data.checkout_url ?? data.payment_url ?? data.url ?? null;

    const providerRef =
      data.id ?? data.payment_id ?? data.reference ?? null;

    if (!checkoutUrl) {
      console.error("SASPAY sans URL:", data);
      return jsonResponse(req, {
        error: "SASPAY n'a pas retourné de lien de paiement",
      }, 502);
    }

    let safeUrl: URL;

    try {
      safeUrl = new URL(checkoutUrl);
      if (safeUrl.protocol !== "https:") throw new Error("URL non sécurisée");
    } catch {
      return jsonResponse(req, { error: "URL de paiement invalide" }, 502);
    }

    if (providerRef) {
      const { error: updateError } = await admin
        .from("payments")
        .update({ provider_reference: String(providerRef) })
        .eq("subscription_id", sub.id)
        .eq("status", "pending");

      if (updateError) {
        console.error("Erreur référence paiement:", updateError);
      }
    }

    return jsonResponse(req, {
      success: true,
      checkout_url: safeUrl.toString(),
      payment_reference: providerRef ? String(providerRef) : null,
      amount: plan.price,
      currency: "XOF",
    });
  } catch (error) {
    console.error("Erreur SASPAY:", error);

    return jsonResponse(req, {
      error: "Erreur interne lors de la création du paiement",
    }, 500);
  }
});
