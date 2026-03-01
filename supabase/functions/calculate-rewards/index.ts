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
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { action, worker_id, branch_id } = await req.json();

    // ─── Helper: Get reward_config ───
    const getConfig = async (branchId?: string) => {
      let query = supabase.from("reward_config").select("*").eq("is_active", true);
      if (branchId) query = query.eq("branch_id", branchId);
      const { data } = await query.limit(1).maybeSingle();
      return data || {
        point_value: 10,
        monthly_budget: 0,
        auto_percentage: 70,
        competition_percentage: 20,
        reserve_percentage: 10,
        minimum_threshold: 40,
        top1_bonus_pct: 50,
        top2_bonus_pct: 30,
        top3_bonus_pct: 20,
      };
    };

    // ─── ACTION: calculate_daily_points ───
    if (action === "calculate_daily_points") {
      const { data: tasks } = await supabase
        .from("reward_tasks").select("*").eq("is_active", true).eq("frequency", "daily");

      let workersQuery = supabase.from("workers").select("id, branch_id").eq("is_active", true).eq("role", "worker");
      if (branch_id) workersQuery = workersQuery.eq("branch_id", branch_id);
      if (worker_id) workersQuery = workersQuery.eq("id", worker_id);
      const { data: workers } = await workersQuery;

      const today = new Date().toISOString().split("T")[0];
      const pointsToInsert: any[] = [];

      for (const worker of workers || []) {
        for (const task of tasks || []) {
          const { data: existing } = await supabase
            .from("employee_points_log").select("id")
            .eq("worker_id", worker.id).eq("task_id", task.id).eq("point_date", today).maybeSingle();
          if (existing && !task.is_cumulative) continue;

          let achieved = false, count = 0;
          const condition = task.condition_logic || {};

          switch (task.data_source) {
            case "visits": {
              const { count: c } = await supabase.from("visit_logs").select("*", { count: "exact", head: true })
                .eq("worker_id", worker.id).gte("visited_at", `${today}T00:00:00`).lte("visited_at", `${today}T23:59:59`);
              count = c || 0;
              achieved = count >= (condition.min_count || 1);
              break;
            }
            case "sales": {
              const { data: orders } = await supabase.from("orders").select("total_amount")
                .eq("worker_id", worker.id).gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`)
                .in("status", ["delivered", "completed", "confirmed"]);
              const totalSales = (orders || []).reduce((s, o) => s + Number(o.total_amount || 0), 0);
              count = orders?.length || 0;
              achieved = condition.min_amount ? totalSales >= condition.min_amount : count >= (condition.min_count || 1);
              break;
            }
            case "collections": {
              const { data: payments } = await supabase.from("debt_payments").select("amount")
                .eq("worker_id", worker.id).gte("collected_at", `${today}T00:00:00`).lte("collected_at", `${today}T23:59:59`);
              const totalCollected = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
              count = payments?.length || 0;
              achieved = condition.min_amount ? totalCollected >= condition.min_amount : count >= (condition.min_count || 1);
              break;
            }
            case "new_customers": {
              const { count: c } = await supabase.from("customers").select("*", { count: "exact", head: true })
                .eq("created_by", worker.id).gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`);
              count = c || 0;
              achieved = count >= (condition.min_count || 1);
              break;
            }
            default: continue;
          }

          if (achieved) {
            pointsToInsert.push({
              worker_id: worker.id, task_id: task.id, points: task.reward_points,
              point_type: "reward", point_date: today, branch_id: worker.branch_id,
              source_entity: task.data_source, notes: `تلقائي: ${task.name} (${count})`,
            });
          } else if (task.penalty_points > 0) {
            pointsToInsert.push({
              worker_id: worker.id, task_id: task.id, points: -task.penalty_points,
              point_type: "penalty", point_date: today, branch_id: worker.branch_id,
              source_entity: task.data_source, notes: `خصم تلقائي: ${task.name}`,
            });
          }
        }
      }

      if (pointsToInsert.length > 0) {
        const { error } = await supabase.from("employee_points_log").insert(pointsToInsert);
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true, processed: pointsToInsert.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: calculate_monthly_bonus (Hybrid Smart Engine) ───
    if (action === "calculate_monthly_bonus") {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const startOfMonth = `${month}-01`;
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

      const config = await getConfig(branch_id);
      const pointValue = Number(config.point_value) || 10;
      const budget = Number(config.monthly_budget) || 0;
      const autoPct = Number(config.auto_percentage) || 70;
      const compPct = Number(config.competition_percentage) || 20;
      const reservePct = Number(config.reserve_percentage) || 10;
      const minThreshold = Number(config.minimum_threshold) || 40;

      // Budget allocation
      const autoBudget = budget * (autoPct / 100);
      const compBudget = budget * (compPct / 100);
      const reserveBudget = budget * (reservePct / 100);

      // Aggregate points per worker
      let pointsQuery = supabase.from("employee_points_log").select("worker_id, points, point_type")
        .gte("point_date", startOfMonth).lte("point_date", endOfMonth);
      if (branch_id) pointsQuery = pointsQuery.eq("branch_id", branch_id);
      const { data: pointsData } = await pointsQuery;

      const workerTotals: Record<string, { rewards: number; penalties: number; net: number }> = {};
      for (const p of pointsData || []) {
        if (!workerTotals[p.worker_id]) workerTotals[p.worker_id] = { rewards: 0, penalties: 0, net: 0 };
        if (p.point_type === "reward") workerTotals[p.worker_id].rewards += Number(p.points);
        else workerTotals[p.worker_id].penalties += Math.abs(Number(p.points));
      }
      for (const wId of Object.keys(workerTotals)) {
        workerTotals[wId].net = workerTotals[wId].rewards - workerTotals[wId].penalties;
      }

      // === Minimum Threshold Check ===
      // If total points < threshold% of some target, reduce effective budget
      const totalNetPoints = Object.values(workerTotals).reduce((s, w) => s + Math.max(0, w.net), 0);
      // We use totalNetPoints vs a reference. If no explicit target, we check if any points exist.
      // Simple: if total < threshold% of workers*600(max), reduce
      const workerIds = Object.keys(workerTotals);
      const maxPossible = workerIds.length * 600; // theoretical max
      const performanceRatio = maxPossible > 0 ? (totalNetPoints / maxPossible) * 100 : 100;
      const budgetMultiplier = performanceRatio < minThreshold ? (minThreshold / 100) : 1;
      const effectiveAutoBudget = autoBudget * budgetMultiplier;

      // === Auto Bonuses (Fixed Point Value + Correction Factor) ===
      const totalRawBonuses = Object.values(workerTotals).reduce(
        (s, w) => s + Math.max(0, w.net) * pointValue, 0
      );
      const correctionFactor = totalRawBonuses > effectiveAutoBudget && totalRawBonuses > 0
        ? effectiveAutoBudget / totalRawBonuses
        : 1;

      // Get worker salaries
      const { data: workersData } = await supabase.from("workers").select("id, salary, bonus_cap_percentage")
        .in("id", workerIds);
      const salaryMap: Record<string, { salary: number; cap: number }> = {};
      for (const w of workersData || []) {
        salaryMap[w.id] = { salary: Number(w.salary) || 0, cap: Number(w.bonus_cap_percentage) || 20 };
      }

      // Rank workers for competition
      const ranked = Object.entries(workerTotals)
        .map(([id, t]) => ({ id, net: t.net }))
        .sort((a, b) => b.net - a.net);

      let totalAutoUsed = 0;

      for (const [wId, totals] of Object.entries(workerTotals)) {
        const rawBonus = Math.max(0, totals.net) * pointValue;
        const correctedBonus = rawBonus * correctionFactor;
        const sInfo = salaryMap[wId] || { salary: 0, cap: 20 };
        const salaryCap = sInfo.salary > 0 ? sInfo.salary * (sInfo.cap / 100) : Infinity;
        const cappedAmount = Math.min(correctedBonus, salaryCap);

        // Competition bonus for top 3
        let competitionBonus = 0;
        const rankIdx = ranked.findIndex(r => r.id === wId);
        if (rankIdx === 0) competitionBonus = compBudget * (Number(config.top1_bonus_pct) / 100);
        else if (rankIdx === 1) competitionBonus = compBudget * (Number(config.top2_bonus_pct) / 100);
        else if (rankIdx === 2) competitionBonus = compBudget * (Number(config.top3_bonus_pct) / 100);

        const totalBonus = cappedAmount + competitionBonus;
        totalAutoUsed += cappedAmount;

        // Upsert monthly summary
        const { data: existing } = await supabase.from("monthly_bonus_summary").select("id")
          .eq("worker_id", wId).eq("month", startOfMonth).maybeSingle();

        const record = {
          worker_id: wId, month: startOfMonth,
          total_points: totals.net, reward_points: totals.rewards, penalty_points: totals.penalties,
          point_value: pointValue, bonus_amount: totalBonus, capped_amount: Math.min(totalBonus, salaryCap),
          status: "calculated", branch_id: branch_id || null,
        };

        if (existing) await supabase.from("monthly_bonus_summary").update(record).eq("id", existing.id);
        else await supabase.from("monthly_bonus_summary").insert(record);
      }

      // === Surplus → Reserve Fund ===
      const surplus = effectiveAutoBudget - totalAutoUsed;
      const totalSurplus = Math.max(0, surplus) + reserveBudget;

      if (totalSurplus > 0) {
        const { data: existingFund } = await supabase.from("reward_reserve_fund").select("id, carried_balance")
          .eq("month", startOfMonth).maybeSingle();

        if (existingFund) {
          await supabase.from("reward_reserve_fund").update({
            surplus_added: totalSurplus,
            carried_balance: (Number(existingFund.carried_balance) || 0),
          }).eq("id", existingFund.id);
        } else {
          // Get previous month's balance
          const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
          const { data: prevFund } = await supabase.from("reward_reserve_fund").select("carried_balance, surplus_added, used_amount")
            .eq("month", prevMonth).maybeSingle();
          const prevBalance = prevFund
            ? Number(prevFund.carried_balance) + Number(prevFund.surplus_added) - Number(prevFund.used_amount)
            : 0;

          await supabase.from("reward_reserve_fund").insert({
            month: startOfMonth, carried_balance: Math.max(0, prevBalance),
            surplus_added: totalSurplus, used_amount: 0,
            branch_id: branch_id || null,
          });
        }
      }

      return new Response(JSON.stringify({
        success: true, month, pointValue, correctionFactor: correctionFactor.toFixed(4),
        workers: workerIds.length, surplus: totalSurplus.toFixed(0),
        performanceRatio: performanceRatio.toFixed(1), budgetMultiplier,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
