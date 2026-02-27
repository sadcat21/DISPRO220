import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { action, customers, products, workerUsername } = await req.json();

    // Action: add-customers
    if (action === "add-customers" && customers && Array.isArray(customers)) {
      const { data, error } = await supabase
        .from("customers")
        .insert(customers)
        .select();

      if (error) {
        console.error("Error adding customers:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Added ${data.length} customers successfully`,
          customers: data
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: add-products
    if (action === "add-products" && products && Array.isArray(products)) {
      const { data, error } = await supabase
        .from("products")
        .insert(products)
        .select();

      if (error) {
        console.error("Error adding products:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Added ${data.length} products successfully`,
          products: data
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: fix-worker-role
    if (action === "fix-worker-role" && workerUsername) {
      // Get worker
      const { data: worker, error: workerError } = await supabase
        .from("workers")
        .select("*")
        .eq("username", workerUsername)
        .single();

      if (workerError || !worker) {
        return new Response(
          JSON.stringify({ error: "Worker not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update worker role
      const { error: updateWorkerError } = await supabase
        .from("workers")
        .update({ role: "worker" })
        .eq("id", worker.id);

      if (updateWorkerError) {
        console.error("Error updating worker:", updateWorkerError);
        return new Response(
          JSON.stringify({ error: updateWorkerError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update user_roles
      const { error: updateRoleError } = await supabase
        .from("user_roles")
        .update({ role: "worker" })
        .eq("worker_id", worker.id);

      if (updateRoleError) {
        console.error("Error updating user_roles:", updateRoleError);
        return new Response(
          JSON.stringify({ error: updateRoleError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Worker ${workerUsername} role updated to worker`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: sync-delivery-workers - Set default_delivery_worker_id from sector
    if (action === "sync-delivery-workers") {
      // Get all sectors with delivery workers
      const { data: sectorsData, error: sectorsError } = await supabase
        .from("sectors")
        .select("id, name, delivery_worker_id")
        .not("delivery_worker_id", "is", null);

      if (sectorsError) {
        return new Response(
          JSON.stringify({ error: sectorsError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let updatedCount = 0;
      const results = [];
      for (const sector of sectorsData || []) {
        const { data: updated, error: updateError } = await supabase
          .from("customers")
          .update({ default_delivery_worker_id: sector.delivery_worker_id })
          .eq("sector_id", sector.id)
          .is("default_delivery_worker_id", null)
          .select("id");

        if (updateError) {
          results.push({ sector: sector.name, error: updateError.message });
        } else {
          const count = updated?.length || 0;
          updatedCount += count;
          if (count > 0) results.push({ sector: sector.name, updated: count });
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: `Updated ${updatedCount} customers`, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: translate-categories
    if (action === "translate-categories") {
      const translations = [
        { name: 'التخفيض', name_fr: 'Réduction', name_en: 'Discount' },
        { name: 'العروض', name_fr: 'Promotions', name_en: 'Promotions' },
        { name: 'قطع غيار', name_fr: 'Pièces de rechange', name_en: 'Spare Parts' },
        { name: 'كلارك', name_fr: 'Chariot élévateur', name_en: 'Forklift' },
        { name: 'مازوت', name_fr: 'Gasoil', name_en: 'Diesel' },
        { name: 'مسبق اجرة', name_fr: 'Avance sur salaire', name_en: 'Salary Advance' },
        { name: 'مكانيكي', name_fr: 'Mécanicien', name_en: 'Mechanic' },
      ];

      const results = [];
      for (const t of translations) {
        const { error } = await supabase
          .from('expense_categories')
          .update({ name_fr: t.name_fr, name_en: t.name_en })
          .eq('name', t.name);
        results.push({ name: t.name, error: error?.message || null });
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
