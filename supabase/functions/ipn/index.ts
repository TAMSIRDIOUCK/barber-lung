import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async (req) => {
  try {
    const data = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const subscription_id = data.custom_data?.subscription_id;

    if (!subscription_id) return new Response("No subscription_id", { status: 400 });

    if (data.status === "completed") {
      await supabase
        .from("subscriptions")
        .update({ status: "active" })
        .eq("id", subscription_id);

      await supabase
        .from("payments")
        .update({ status: "success" })
        .eq("subscription_id", subscription_id);
    }

    if (data.status === "cancelled" || data.status === "failed") {
      await supabase
        .from("payments")
        .update({ status: "failed" })
        .eq("subscription_id", subscription_id);
    }

    return new Response("OK");
  } catch (err) {
    console.error(err);
    return new Response("Erreur IPN", { status: 500 });
  }
});