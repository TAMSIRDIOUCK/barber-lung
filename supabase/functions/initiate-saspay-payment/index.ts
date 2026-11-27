
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

function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsFor(req),
      "Content-Type": "application/json",
    },
  });
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  let phone = String(value).trim();

  // Retirer espaces, tirets et parenthèses.
  phone = phone.replace(/[\s\-().]/g, "");

  // Convertir les préfixes internationaux.
  if (phone.startsWith("00221")) {
    phone = "+221" + phone.slice(5);
  } else if (phone.startsWith("221") && !phone.startsWith("+221")) {
    phone = "+" + phone;
  } else if (/^(70|75|76|77|78)\d{7}$/.test(phone)) {
    phone = "+221" + phone;
  }

  if (!/^\+221(70|75|76|77|78)\d{7}$/.test(phone)) {
    return null;
  }

  return phone;
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
    return jsonResponse(
      req,
      { error: "Méthode non autorisée" },
      405,
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SASPAY_KEY = Deno.env.get("SASPAY_API_KEY");

    if (
      !SUPABASE_URL ||
      !ANON_KEY ||
      !SERVICE_ROLE_KEY ||
      !SASPAY_KEY
    ) {
      console.error("Configuration serveur incomplète");

      return jsonResponse(req, {
        error: "Configuration Supabase ou SASPAY incomplète",
      }, 500);
    }

    // 1. Vérification de la session utilisateur.
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
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      console.error("Session utilisateur invalide");

      return jsonResponse(req, {
        error: "Session invalide",
      }, 401);
    }

    // 2. Lecture du formulaire.
    let body: Record<string, unknown>;

    try {
      const receivedBody: unknown = await req.json();

      if (
        !receivedBody ||
        typeof receivedBody !== "object" ||
        Array.isArray(receivedBody)
      ) {
        return jsonResponse(req, {
          error: "Corps de requête invalide",
        }, 400);
      }

      body = receivedBody as Record<string, unknown>;
    } catch {
      return jsonResponse(req, {
        error: "Format JSON invalide",
      }, 400);
    }

    const rawSubscriptionId = body.subscription_id;
    const rawPhone = body.phone;
    const rawNetwork = body.network;

    // 3. Vérification et normalisation de l'identifiant.
    const subscriptionId =
      typeof rawSubscriptionId === "string"
        ? rawSubscriptionId.trim()
        : typeof rawSubscriptionId === "number"
        ? String(rawSubscriptionId)
        : "";

    if (!subscriptionId) {
      console.error("SASPAY diagnostic: subscription_id absent ou invalide", {
        type: typeof rawSubscriptionId,
        present: rawSubscriptionId !== undefined &&
          rawSubscriptionId !== null,
      });

      return jsonResponse(req, {
        error: "Identifiant d'abonnement invalide",
        diagnostic: {
          parameter: "subscription_id",
          received_type: typeof rawSubscriptionId,
        },
      }, 400);
    }

    // 4. Vérification et normalisation du téléphone.
    const phone = normalizePhone(rawPhone);

    if (!phone) {
      console.error("SASPAY diagnostic: téléphone invalide", {
        type: typeof rawPhone,
        present: rawPhone !== undefined && rawPhone !== null,
      });

      return jsonResponse(req, {
        error: "Numéro de téléphone invalide",
        diagnostic: {
          parameter: "phone",
          received_type: typeof rawPhone,
          expected: "Numéro sénégalais valide",
        },
      }, 400);
    }

    // 5. Vérification du réseau de paiement.
    if (
      typeof rawNetwork !== "string" ||
      !["wave_sn", "orange_money_sn"].includes(rawNetwork)
    ) {
      console.error("SASPAY diagnostic: réseau invalide", {
        received_type: typeof rawNetwork,
        received_value: typeof rawNetwork === "string"
          ? rawNetwork
          : null,
      });

      return jsonResponse(req, {
        error: "Réseau de paiement invalide",
        diagnostic: {
          parameter: "network",
          received_type: typeof rawNetwork,
          expected: ["wave_sn", "orange_money_sn"],
        },
      }, 400);
    }

    const network = rawNetwork;

    const firstName = typeof body.firstName === "string"
      ? body.firstName.trim()
      : "";

    const lastName = typeof body.lastName === "string"
      ? body.lastName.trim()
      : "";

    const email = typeof body.email === "string"
      ? body.email.trim()
      : "";

    // 6. Connexion administrateur Supabase.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // 7. Vérification de l'abonnement.
    const { data: sub, error: subError } = await admin
      .from("subscriptions")
      .select("id, user_id, status, plan_id")
      .eq("id", subscriptionId)
      .single();

    if (
      subError ||
      !sub ||
      sub.user_id !== user.id ||
      sub.status !== "pending"
    ) {
      console.error("Abonnement invalide:", {
        found: Boolean(sub),
        status: sub?.status ?? null,
        databaseError: subError?.message ?? null,
      });

      return jsonResponse(req, {
        error: "Abonnement invalide ou non autorisé",
      }, 400);
    }

    // 8. Vérification de la formule.
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
      console.error("Formule indisponible:", {
        databaseError: planError?.message ?? null,
      });

      return jsonResponse(req, {
        error: "Formule indisponible",
      }, 400);
    }

    // 9. Vérification de l'adresse email.
    const customerEmail = user.email || email;

    if (!customerEmail || !customerEmail.includes("@")) {
      return jsonResponse(req, {
        error: "Adresse email invalide",
      }, 400);
    }

    // 10. Préparation du paiement SASPAY.
    const payload = {
      amount: String(plan.price),
      currency: "XOF",
      country: "SN",
      description: `Abonnement ${plan.name} - LA COUPE`,
      customer: {
        email: customerEmail,
        first_name: firstName,
        last_name: lastName,
        phone,
      },
      network,
    };

    console.log("Initialisation paiement SASPAY:", {
      subscription_id: sub.id,
      amount: plan.price,
      network,
      phone_valid: true,
    });

    // 11. Appel de l'API SASPAY.
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

    // 12. Normaliser la réponse SASPAY.
    // Certaines réponses placent les informations dans data.data.
    const paymentData =
      data.data && typeof data.data === "object" &&
        !Array.isArray(data.data)
        ? data.data as Record<string, any>
        : data;

    const checkoutUrlValue =
      paymentData.checkout_url ??
      paymentData.payment_url ??
      paymentData.url ??
      data.checkout_url ??
      data.payment_url ??
      data.url ??
      null;

    const providerRef =
      paymentData.id ??
      paymentData.payment_id ??
      paymentData.reference ??
      data.id ??
      data.payment_id ??
      data.reference ??
      null;

    const providerStatus =
      paymentData.status ??
      data.status ??
      "PENDING";

    console.log("SASPAY réponse analysée:", {
      httpStatus: res.status,
      hasCheckoutUrl: typeof checkoutUrlValue === "string" &&
        checkoutUrlValue.trim().length > 0,
      hasProviderReference: providerRef !== null &&
        providerRef !== undefined,
      providerStatus: String(providerStatus),
      responseKeys: Object.keys(data),
      paymentDataKeys: Object.keys(paymentData),
    });

    // 13. Enregistrer la référence SASPAY dès qu'elle existe,
    // même si SASPAY utilise le push téléphone sans URL.
    if (providerRef !== null && providerRef !== undefined) {
      const { error: updateError } = await admin
        .from("payments")
        .update({
          provider_reference: String(providerRef),
        })
        .eq("subscription_id", sub.id)
        .eq("status", "pending");

      if (updateError) {
        console.error(
          "Erreur enregistrement référence paiement:",
          updateError.message,
        );
      }
    }

    // 14. Si SASPAY fournit un lien, le valider et le renvoyer.
    if (
      typeof checkoutUrlValue === "string" &&
      checkoutUrlValue.trim().length > 0
    ) {
      let safeUrl: URL;

      try {
        safeUrl = new URL(checkoutUrlValue.trim());

        if (safeUrl.protocol !== "https:") {
          throw new Error("URL non sécurisée");
        }
      } catch {
        return jsonResponse(req, {
          error: "SASPAY a retourné une URL de paiement invalide",
          payment_reference: providerRef
            ? String(providerRef)
            : null,
        }, 502);
      }

      return jsonResponse(req, {
        success: true,
        checkout_url: safeUrl.toString(),
        payment_reference: providerRef
          ? String(providerRef)
          : null,
        payment_status: String(providerStatus),
        payment_pending: true,
        amount: plan.price,
        currency: "XOF",
      });
    }

    // 15. SASPAY peut envoyer une demande de paiement directement
    // sur le téléphone. Dans ce cas, l'absence d'URL n'est pas
    // une erreur si une référence de paiement a été créée.
    if (providerRef !== null && providerRef !== undefined) {
      return jsonResponse(req, {
        success: true,
        checkout_url: null,
        payment_reference: String(providerRef),
        payment_status: String(providerStatus),
        payment_pending: true,
        message: "Demande de paiement envoyée. Vérifiez votre téléphone pour confirmer.",
        amount: plan.price,
        currency: "XOF",
      });
    }

    // Sans URL ni référence, impossible de confirmer que SASPAY
    // a créé une transaction : retourner un diagnostic exploitable.
    console.error("SASPAY sans lien ni référence de paiement:", {
      httpStatus: res.status,
      responseKeys: Object.keys(data),
      paymentDataKeys: Object.keys(paymentData),
      providerMessage: paymentData.message ?? data.message ?? null,
    });

    return jsonResponse(req, {
      error: "SASPAY n'a retourné ni lien ni référence de paiement",
      diagnostic: {
        http_status: res.status,
        response_keys: Object.keys(data),
        payment_data_keys: Object.keys(paymentData),
      },
    }, 502);
  } catch (error) {
    console.error("Erreur interne SASPAY:", error);

    return jsonResponse(req, {
      error: "Erreur interne lors de la création du paiement",
    }, 500);
  }
});
