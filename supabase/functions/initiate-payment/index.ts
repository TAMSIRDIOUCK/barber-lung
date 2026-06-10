import { serve } from "https://deno.land/std/http/server.ts";

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
    const body = await req.json();

    const masterKey = Deno.env.get("PAYDUNYA_MASTER_KEY");
    const privateKey = Deno.env.get("PAYDUNYA_PRIVATE_KEY");
    const token = Deno.env.get("PAYDUNYA_TOKEN");

    if (!masterKey || !privateKey || !token) {
      console.error("Missing PayDunya env vars");
      return json({ error: "Configuration serveur manquante" }, 500);
    }

    const res = await fetch(
// Sandbox → Live
"https://app.paydunya.com/api/v1/checkout-invoice/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "PAYDUNYA-MASTER-KEY": masterKey,
          "PAYDUNYA-PRIVATE-KEY": privateKey,
          "PAYDUNYA-TOKEN": token,
        },
        body: JSON.stringify({
          invoice: {
            total_amount: body.amount,
            description: body.description,
          },
          store: { name: "LA COUPE" },
          actions: {
            callback_url:
              "https://vzhcjvvgpbtfolxnpapy.supabase.co/functions/v1/ipn",
            return_url: "http://localhost:5174/success",
            cancel_url: "http://localhost:5174/cancel",
          },
          custom_data: {
            subscription_id: body.subscription_id,
            phone: body.phone,
            method: body.method,
            customer_name: body.customer_name,
            customer_email: body.customer_email,
          },
        }),
      }
    );

    console.log("PayDunya status:", res.status);
    const data = await res.json();
    console.log("PayDunya response:", JSON.stringify(data));

    if (data.response_code === "00" && data.response_text) {
      return json({ success: true, invoice_url: data.response_text });
    }

    return json(
      { error: data.response_text ?? "Échec PayDunya", raw: data },
      400
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return json({ error: "Erreur serveur interne" }, 500);
  }
});