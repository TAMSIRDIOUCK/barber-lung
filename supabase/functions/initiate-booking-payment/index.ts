import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("VITE_SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Missing Supabase env vars");
      return json({ error: "Configuration serveur manquante" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("📥 Données reçues:", JSON.stringify(body, null, 2));

    const {
      request_id,
      phone,
      method,
      customer_name,
      customer_email,
      return_url,
      cancel_url,
      callback_url,
    } = body;

    if (!request_id) {
      return json({ error: "request_id manquant" }, 400);
    }

    const { data: bookingRequest, error: bookingErr } = await supabase
      .from("booking_requests")
      .select("id, service_name, service_price, ticket_number, client_name, client_phone, salon_user_id, payment_status, status")
      .eq("id", request_id)
      .maybeSingle();

    if (bookingErr || !bookingRequest) {
      console.error("❌ Demande de réservation introuvable:", bookingErr);
      return json({ error: "Demande de réservation introuvable" }, 404);
    }

    if (bookingRequest.payment_status === "paid") {
      return json({ error: "Cette réservation est déjà payée" }, 400);
    }

    if (bookingRequest.status === "cancelled") {
      return json({ error: "Cette réservation a été annulée" }, 400);
    }

    const amount = bookingRequest.service_price;

    const masterKey = Deno.env.get("PAYDUNYA_MASTER_KEY");
    const privateKey = Deno.env.get("PAYDUNYA_PRIVATE_KEY");
    const paydunyaToken = Deno.env.get("PAYDUNYA_TOKEN");

    if (!masterKey || !privateKey || !paydunyaToken) {
      console.error("❌ Missing PayDunya env vars");
      return json({ error: "Configuration PayDunya manquante" }, 500);
    }

    const finalReturnUrl = return_url || `${Deno.env.get("VITE_APP_URL") || "https://barber-lung.vercel.app"}/booking/success?request_id=${request_id}`;
    const finalCancelUrl = cancel_url || `${Deno.env.get("VITE_APP_URL") || "https://barber-lung.vercel.app"}/booking/cancel?request_id=${request_id}`;
    const finalCallbackUrl = callback_url || `${supabaseUrl}/functions/v1/ipn`;

    console.log("🔗 URLs:", { returnUrl: finalReturnUrl, cancelUrl: finalCancelUrl, callbackUrl: finalCallbackUrl });

    const paydunyaPayload = {
      invoice: {
        total_amount: amount,
        description: `Réservation ${bookingRequest.service_name} - Ticket:${bookingRequest.ticket_number}`,
        items: [
          {
            name: bookingRequest.service_name,
            quantity: 1,
            unit_price: amount,
            total_price: amount,
            description: `Réservation salon - Ticket:${bookingRequest.ticket_number}`,
          },
        ],
      },
      store: {
        name: "LE COUPE",
        phone: phone,
        email: customer_email || "",
      },
      customer: {
        phone: phone,
        email: customer_email || "",
        name: customer_name || bookingRequest.client_name || "Client",
      },
      actions: {
        callback_url: finalCallbackUrl,
        return_url: finalReturnUrl,
        cancel_url: finalCancelUrl,
      },
      custom_data: {
        type: "booking",
        request_id: request_id.toString(),
        phone: phone,
        method: method,
        customer_name: customer_name || bookingRequest.client_name,
        customer_email: customer_email || "",
      },
    };

    console.log("📤 Payload PayDunya:", JSON.stringify(paydunyaPayload, null, 2));

    const paydunyaResponse = await fetch(
      "https://app.paydunya.com/api/v1/checkout-invoice/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "PAYDUNYA-MASTER-KEY": masterKey,
          "PAYDUNYA-PRIVATE-KEY": privateKey,
          "PAYDUNYA-TOKEN": paydunyaToken,
        },
        body: JSON.stringify(paydunyaPayload),
      }
    );

    const paydunyaData = await paydunyaResponse.json();
    console.log("📥 PayDunya status:", paydunyaResponse.status);
    console.log("📥 PayDunya response:", JSON.stringify(paydunyaData, null, 2));

    if (!paydunyaResponse.ok) {
      console.error("❌ PayDunya HTTP error:", paydunyaResponse.status);
      await supabase.from("booking_requests").update({ payment_status: "failed" }).eq("id", request_id);
      return json({ error: "Erreur de communication avec PayDunya", details: paydunyaData }, 400);
    }

    if (paydunyaData.response_code === "00" && paydunyaData.response_text) {
      const invoiceUrl = typeof paydunyaData.response_text === "string"
        ? paydunyaData.response_text
        : paydunyaData.response_text?.invoice_url || paydunyaData.response_text;

      console.log("✅ Facture créée:", invoiceUrl);

      await supabase
        .from("booking_requests")
        .update({ 
          payment_status: "pending",
          payment_method: method,
          payment_provider: "paydunya"
        })
        .eq("id", request_id);

      return json({
        success: true,
        invoice_url: invoiceUrl,
        invoice_token: paydunyaData.response_text?.token || paydunyaData.token,
        request_id: request_id,
      });
    }

    console.error("❌ PayDunya error:", paydunyaData);
    await supabase.from("booking_requests").update({ payment_status: "failed" }).eq("id", request_id);

    return json({ error: paydunyaData.response_text || "Échec de la transaction PayDunya", raw: paydunyaData }, 400);
  } catch (err) {
    console.error("❌ Unhandled error:", err);
    return json({ error: "Erreur interne du serveur", message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
