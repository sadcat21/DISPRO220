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
    const algeriaHour = algeriaTime.getUTCHours();

    // Only run after 11 PM Algeria time (23:00)
    if (algeriaHour < 23) {
      return new Response(
        JSON.stringify({ message: "Not yet 11 PM Algeria time", algeriaHour }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Today's date in Algeria timezone (YYYY-MM-DD)
    const todayStr = algeriaTime.toISOString().split("T")[0];

    // Find undelivered orders with delivery_date = today or earlier
    const { data: overdueOrders, error: fetchError } = await supabase
      .from("orders")
      .select("id, delivery_date")
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

    // Update all overdue orders to next working day
    const orderIds = overdueOrders.map((o) => o.id);
    const { error: updateError } = await supabase
      .from("orders")
      .update({ delivery_date: nextWorkDay })
      .in("id", orderIds);

    if (updateError) throw updateError;

    // Log the auto-postpone action
    console.log(`Auto-postponed ${orderIds.length} orders to ${nextWorkDay}`);

    return new Response(
      JSON.stringify({
        message: `Auto-postponed ${orderIds.length} orders to ${nextWorkDay}`,
        count: orderIds.length,
        nextWorkDay,
        orderIds,
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
