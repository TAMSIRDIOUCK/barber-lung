
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * LE COUPE - SASPAY WEBHOOK
 *
 * Recherche plusieurs références possibles :
 * - id
 * - payment_id
 * - reference
 * - external_reference
 * - transaction_id
 * - merchant_reference
 *
 * IMPORTANT :
 * Les noms des headers et le format HMAC doivent être
 * confirmés avec la documentation officielle SASPAY.
 */

const encoder = new TextEncoder();

function response(message: string, status = 200) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

async function verifySignature(
  raw: string,
  signature: string | null,
  timestamp: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !timestamp || !secret) return false;

  const timestampNumber = Number(timestamp);

  if (!Number.isInteger(timestampNumber)) return false;

  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestampNumber) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signedContent = `${timestamp}.${raw}`;

  const result = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedContent),
  );

  const expected = Array.from(new Uint8Array(result))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const received = signature
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();

  return safeEqual(expected, received);
}

function getReferenceCandidates(
  event: Record<string, any>,
  data: Record<string, any>,
): string[] {
  const candidates: unknown[] = [];

  const objects = [
    data,
    event,
    data.payment,
    data.transaction,
    event.payment,
    event.transaction,
  ].filter(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item),
  );

  const fields = [
    "id",
    "payment_id",
    "reference",
    "external_reference",
    "transaction_id",
    "merchant_reference",
  ];

  for (const object of objects) {
    for (const field of fields) {
      candidates.push(object[field]);
    }
  }

  return [
    ...new Set(
      candidates
        .filter(
          (value) =>
            typeof value === "string" ||
            typeof value === "number",
        )
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return response("Method not allowed", 405);
  }

  try {
    // 1. Vérification de la configuration.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    const SASPAY_WEBHOOK_SECRET = Deno.env.get(
      "SASPAY_WEBHOOK_SECRET",
    );

    if (
      !SUPABASE_URL ||
      !SERVICE_ROLE_KEY ||
      !SASPAY_WEBHOOK_SECRET
    ) {
      console.error("Configuration webhook incomplète");
      return response("Configuration serveur incomplète", 500);
    }

    // 2. Lecture du corps brut.
    const raw = await req.text();

    // 3. Vérification de la signature.
    const signature = req.headers.get("X-Webhook-Signature");
    const timestamp = req.headers.get("X-Webhook-Timestamp");

    const validSignature = await verifySignature(
      raw,
      signature,
      timestamp,
      SASPAY_WEBHOOK_SECRET,
    );

    if (!validSignature) {
      console.error("Signature SASPAY invalide");
      return response("Signature invalide", 401);
    }

    // 4. Lecture de la notification.
    let event: Record<string, any>;

    try {
      event = JSON.parse(raw);
    } catch {
      return response("JSON invalide", 400);
    }

    const data =
      event.data &&
      typeof event.data === "object" &&
      !Array.isArray(event.data)
        ? event.data
        : event;

    const eventType = String(
      event.event ?? event.type ?? "",
    ).toLowerCase();

    const providerStatus = String(
      data.status ?? event.status ?? "",
    ).toUpperCase();

    // 5. Récupération des différentes références possibles.
    const referenceCandidates = getReferenceCandidates(
      event,
      data,
    );

    if (referenceCandidates.length === 0) {
      console.error("Aucune référence dans la notification");
      return response("Référence de paiement absente", 400);
    }

    console.log("SASPAY notification reçue:", {
      eventType,
      providerStatus,
      referenceCount: referenceCandidates.length,
      hasTransactionId: referenceCandidates.some(
        (ref) => ref === "247edb96b6d04c0493c03f67245773a0",
      ),
      hasExternalReference: referenceCandidates.some(
        (ref) => ref === "PG-PYI-20261127-FYVTJP",
      ),
    });

    // 6. Identifier le type de notification.
    const isSuccess =
      eventType === "transaction.success" &&
      providerStatus === "SUCCESS";

    const isFailure =
      [
        "transaction.failed",
        "transaction.cancelled",
        "transaction.expired",
      ].includes(eventType) &&
      [
        "FAILED",
        "CANCELLED",
        "CANCELED",
        "EXPIRED",
        "REJECTED",
      ].includes(providerStatus);

    if (!isSuccess && !isFailure) {
      console.log(
        "Notification non traitée:",
        eventType,
        providerStatus,
      );
      return response("Notification reçue");
    }

    // 7. Connexion administrateur Supabase.
    const admin = createClient(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    // 8. Recherche du paiement avec toutes les références.
    let payment: any = null;
    let matchedReference: string | null = null;

    for (const candidate of referenceCandidates) {
      const { data: foundPayment, error: paymentError } =
        await admin
          .from("payments")
          .select(
            "id, subscription_id, status, provider_reference",
          )
          .eq("provider_reference", candidate)
          .maybeSingle();

      if (paymentError) {
        console.error(
          "Erreur recherche paiement:",
          paymentError.message,
        );
        return response("Erreur base de données", 500);
      }

      if (foundPayment) {
        payment = foundPayment;
        matchedReference = candidate;
        break;
      }
    }

    if (!payment) {
      console.error("Paiement introuvable:", {
        referenceCount: referenceCandidates.length,
        hasTransactionId: referenceCandidates.includes(
          "247edb96b6d04c0493c03f67245773a0",
        ),
        hasExternalReference: referenceCandidates.includes(
          "PG-PYI-20261127-FYVTJP",
        ),
      });

      return response("Paiement introuvable", 503);
    }

    console.log("Paiement retrouvé:", {
      paymentId: payment.id,
      matchedReference,
      paymentStatus: payment.status,
    });

    // 9. Récupération de l'abonnement.
    const { data: subscription, error: subscriptionError } =
      await admin
        .from("subscriptions")
        .select(
          "id, user_id, status, plan_id, start_date, end_date",
        )
        .eq("id", payment.subscription_id)
        .maybeSingle();

    if (subscriptionError) {
      console.error(
        "Erreur abonnement:",
        subscriptionError.message,
      );
      return response("Erreur base de données", 500);
    }

    if (!subscription) {
      return response("Abonnement introuvable", 404);
    }

    // 10. Récupération de la formule.
    const { data: plan, error: planError } = await admin
      .from("subscription_plans")
      .select("price, duration_days")
      .eq("id", subscription.plan_id)
      .maybeSingle();

    if (planError || !plan) {
      console.error(
        "Formule introuvable:",
        planError?.message,
      );
      return response("Formule introuvable", 404);
    }

    // 11. Traitement d'un paiement réussi.
    if (isSuccess) {
      const receivedAmount = Number(data.amount);
      const expectedAmount = Number(plan.price);

      const receivedCurrency = String(
        data.currency ?? "",
      ).toUpperCase();

      if (
        !Number.isFinite(receivedAmount) ||
        receivedAmount !== expectedAmount ||
        receivedCurrency !== "XOF"
      ) {
        console.error("Montant ou devise incorrects:", {
          amountMatches:
            receivedAmount === expectedAmount,
          currency: receivedCurrency || "absente",
        });

        return response(
          "Montant ou devise incorrects",
          409,
        );
      }

      // 12. Vérifier si le paiement est déjà traité.
      if (payment.status === "completed") {
        if (subscription.status === "active") {
          return response("Paiement déjà traité");
        }
      }

      // 13. Marquer le paiement comme terminé.
      if (payment.status !== "completed") {
        const { error: updatePaymentError } = await admin
          .from("payments")
          .update({
            status: "completed",
          })
          .eq("id", payment.id);

        if (updatePaymentError) {
          console.error(
            "Erreur mise à jour paiement:",
            updatePaymentError.message,
          );
          return response(
            "Erreur mise à jour paiement",
            500,
          );
        }
      }

      // 14. Ne pas prolonger un abonnement déjà actif.
      if (subscription.status === "active") {
        return response("Paiement déjà confirmé");
      }

      const durationDays = Number(
        plan.duration_days ?? 30,
      );

      if (
        !Number.isFinite(durationDays) ||
        durationDays <= 0
      ) {
        return response(
          "Durée abonnement invalide",
          500,
        );
      }

      const start = new Date();

      const end = new Date(
        start.getTime() +
          durationDays * 86400000,
      );

      // 15. Activation de l'abonnement.
      const { error: updateSubscriptionError } =
        await admin
          .from("subscriptions")
          .update({
            status: "active",
            start_date: start.toISOString(),
            end_date: end.toISOString(),
            expires_at: end.toISOString(),
          })
          .eq("id", subscription.id);

      if (updateSubscriptionError) {
        console.error(
          "Erreur activation abonnement:",
          updateSubscriptionError.message,
        );

        return response(
          "Erreur activation abonnement",
          500,
        );
      }

      console.log("Abonnement activé:", subscription.id);

      return response(
        "Paiement confirmé et abonnement activé",
      );
    }

    // 16. Traitement d'un paiement échoué.
    if (isFailure) {
      if (
        payment.status === "completed" ||
        subscription.status === "active"
      ) {
        return response("Paiement déjà confirmé");
      }

      const { error: updatePaymentError } = await admin
        .from("payments")
        .update({
          status: "failed",
        })
        .eq("id", payment.id);

      if (updatePaymentError) {
        console.error(
          "Erreur paiement échoué:",
          updatePaymentError.message,
        );
        return response(
          "Erreur mise à jour paiement",
          500,
        );
      }

      const { error: updateSubscriptionError } =
        await admin
          .from("subscriptions")
          .update({
            status: "cancelled",
          })
          .eq("id", subscription.id);

      if (updateSubscriptionError) {
        console.error(
          "Erreur annulation abonnement:",
          updateSubscriptionError.message,
        );
        return response(
          "Erreur mise à jour abonnement",
          500,
        );
      }

      return response("Paiement échoué enregistré");
    }

    return response("Notification reçue");
  } catch (error) {
    console.error(
      "Erreur webhook:",
      error instanceof Error
        ? error.message
        : "Erreur inconnue",
    );

    return response("Erreur interne", 500);
  }
});
