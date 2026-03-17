import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current date in Algeria timezone (UTC+1)
    const now = new Date();
    const algeriaOffset = 1; // UTC+1
    const algeriaTime = new Date(now.getTime() + algeriaOffset * 60 * 60 * 1000);
    const todayStr = algeriaTime.toISOString().split("T")[0];

    // Find undelivered orders where delivery_date = today or earlier
    // (orders manually postponed to a future date won't match since their delivery_date > today)
    const { data: overdueOrders, error: fetchError } = await supabase
      .from("orders")
      .select("id, delivery_date, postpone_count")
      .in("status", ["pending", "assigned", "in_progress"])
      .lte("delivery_date", todayStr)
      .not("delivery_date", "is", null);

    if (fetchError) throw fetchError;

    if (!overdueOrders || overdueOrders.length === 0) {
      return new Response(
        JSON.stringify({ message: "No overdue orders to postpone", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate next working day (skip Friday)
    const getNextWorkDay = (fromDateStr: string): string => {
      const d = new Date(fromDateStr + "T12:00:00Z");
      d.setDate(d.getDate() + 1);
      // Skip Friday (day 5)
      if (d.getDay() === 5) {
        d.setDate(d.getDate() + 1);
      }
      return d.toISOString().split("T")[0];
    };

    const nextWorkDay = getNextWorkDay(todayStr);

    // Update each order: set next work day + increment postpone_count
    let updatedCount = 0;
    for (const order of overdueOrders) {
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          delivery_date: nextWorkDay,
          postpone_count: (order.postpone_count || 0) + 1,
        })
        .eq("id", order.id);

      if (updateError) {
        console.error(`Failed to update order ${order.id}:`, updateError);
      } else {
        updatedCount++;
      }
    }

    console.log(`Auto-postponed ${updatedCount} orders to ${nextWorkDay}`);

    return new Response(
      JSON.stringify({
        message: `Auto-postponed ${updatedCount} orders to ${nextWorkDay}`,
        count: updatedCount,
        nextWorkDay,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto-postpone error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});