
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
      "authorization, x-client-info, apikey, content-type",
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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsFor(req),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, {
      error: "Méthode non autorisée",
    }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SASPAY_KEY = Deno.env.get("SASPAY_API_KEY");

    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !SASPAY_KEY) {
      return jsonResponse(req, {
        error: "Configuration serveur incomplète",
      }, 500);
    }

    // 1. Vérifier l'utilisateur connecté.
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(req, {
        error: "Authentification requise",
      }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse(req, {
        error: "Session utilisateur invalide",
      }, 401);
    }

    // 2. Lire la référence SASPAY.
    let body: Record<string, unknown>;

    try {
      const received = await req.json();

      if (!received || typeof received !== "object" || Array.isArray(received)) {
        return jsonResponse(req, {
          error: "Corps de requête invalide",
        }, 400);
      }

      body = received as Record<string, unknown>;
    } catch {
      return jsonResponse(req, {
        error: "Format JSON invalide",
      }, 400);
    }

    const paymentReference =
      typeof body.payment_reference === "string"
        ? body.payment_reference.trim()
        : "";

    if (!paymentReference) {
      return jsonResponse(req, {
        error: "Référence de paiement manquante",
      }, 400);
    }

    // 3. Connexion administrateur Supabase.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // 4. Retrouver le paiement enregistré.
    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("id, subscription_id, status, provider_reference")
      .eq("provider_reference", paymentReference)
      .maybeSingle();

    if (paymentError || !payment) {
      console.error("Paiement introuvable:", paymentError?.message);

      return jsonResponse(req, {
        error: "Paiement introuvable dans Le Coupe",
      }, 404);
    }

    // 5. Vérifier que l'abonnement appartient à l'utilisateur.
    const { data: subscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("id, user_id, status, plan_id")
      .eq("id", payment.subscription_id)
      .maybeSingle();

    if (
      subscriptionError ||
      !subscription ||
      subscription.user_id !== user.id
    ) {
      return jsonResponse(req, {
        error: "Paiement non autorisé",
      }, 403);
    }

    // 6. Lire le prix attendu.
    const { data: plan, error: planError } = await admin
      .from("subscription_plans")
      .select("name, price")
      .eq("id", subscription.plan_id)
      .maybeSingle();

    if (planError || !plan) {
      return jsonResponse(req, {
        error: "Formule d'abonnement introuvable",
      }, 404);
    }

    // 7. Vérifier le statut directement auprès de SASPAY.
    const verifyResponse = await fetch(
      `https://api.saspay.me/api/v1/payments/${encodeURIComponent(paymentReference)}/verify/`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SASPAY_KEY}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20000),
      },
    );

    const responseText = await verifyResponse.text();

    let result: Record<string, any>;

    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("Réponse SASPAY non JSON");

      return jsonResponse(req, {
        error: "Réponse SASPAY illisible",
      }, 502);
    }

    if (!verifyResponse.ok) {
      console.error("Échec vérification SASPAY:", verifyResponse.status);

      return jsonResponse(req, {
        error: "SASPAY n'a pas pu vérifier ce paiement",
      }, 502);
    }

    const paymentData =
      result.data && typeof result.data === "object" &&
        !Array.isArray(result.data)
        ? result.data
        : result;

    const providerStatus = String(
      paymentData.status ?? result.status ?? "",
    ).toUpperCase();

    // 8. Ne reconnaître que les statuts connus.
    if (!["SUCCESS", "PENDING", "FAILED", "CANCELLED"].includes(providerStatus)) {
      console.error("Statut SASPAY inconnu:", providerStatus);

      return jsonResponse(req, {
        error: "Statut SASPAY non reconnu",
        verified: false,
      }, 502);
    }

    if (providerStatus !== "SUCCESS") {
      return jsonResponse(req, {
        success: true,
        verified: false,
        paid: false,
        status: providerStatus,
        message: "Le paiement n'est pas encore confirmé.",
      });
    }

    // 9. Comparer le montant et la devise.
    const amountValue =
      paymentData.requested_amount ??
      paymentData.amount ??
      result.requested_amount ??
      result.amount;

    const currencyValue =
      paymentData.currency ?? result.currency;

    const receivedAmount = Number(amountValue);
    const expectedAmount = Number(plan.price);
    const receivedCurrency = String(currencyValue ?? "").toUpperCase();

    if (
      !Number.isFinite(receivedAmount) ||
      receivedAmount !== expectedAmount ||
      receivedCurrency !== "XOF"
    ) {
      console.error("Paiement SUCCESS mais montant/devise non concordants", {
        amountReceived: Number.isFinite(receivedAmount),
        currencyReceived: receivedCurrency || "absente",
      });

      return jsonResponse(req, {
        success: false,
        verified: false,
        paid: false,
        status: providerStatus,
        error: "Le montant ou la devise ne correspondent pas à l'abonnement.",
      }, 409);
    }

    // 10. Confirmation SASPAY reçue.
    // Ne pas activer ici : l'activation sera ajoutée après
    // confirmation du schéma exact des paiements et des statuts.

    return jsonResponse(req, {
      success: true,
      verified: true,
      paid: true,
      status: providerStatus,
      payment_reference: paymentReference,
      amount: receivedAmount,
      currency: receivedCurrency,
      subscription_id: subscription.id,
      message: "Paiement confirmé par SASPAY. Activation à finaliser.",
    });
  } catch (error) {
    console.error(
      "Erreur verify-saspay-payment:",
      error instanceof Error ? error.message : "Erreur inconnue",
    );

    return jsonResponse(req, {
      error: "Erreur interne pendant la vérification",
    }, 500);
  }
});
