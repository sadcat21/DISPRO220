import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action, batch_size = 10, offset = 0 } = body;

    if (action === 'update_types') {
      // Update stores with سبيرات/سوبيرات/Supérette → customer_type = 'سوبيرات'
      const { data: supResult, error: supError } = await supabase
        .from('customers')
        .update({ customer_type: 'سوبيرات' })
        .or('store_name.ilike.%سبيرات%,store_name.ilike.%سوبيرات%,store_name.ilike.%supérette%,store_name.ilike.%سوبرات%,store_name.ilike.%sup %')
        .is('customer_type', null)
        .select('id, store_name');

      // Update stores with شوب/shop → customer_type = 'تغذية عامة'
      const { data: shopResult, error: shopError } = await supabase
        .from('customers')
        .update({ customer_type: 'تغذية عامة' })
        .or('store_name.ilike.%شوب%,store_name.ilike.%shop%')
        .is('customer_type', null)
        .select('id, store_name');

      return new Response(JSON.stringify({
        sup_updated: supResult?.length || 0,
        sup_items: supResult,
        sup_error: supError?.message,
        shop_updated: shopResult?.length || 0,
        shop_items: shopResult,
        shop_error: shopError?.message,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'translate_names') {
      // Get customers without name_fr or store_name_fr
      const { data: customers, error } = await supabase
        .from('customers')
        .select('id, name, store_name, name_fr, store_name_fr')
        .or('name_fr.is.null,store_name_fr.is.null')
        .range(offset, offset + batch_size - 1);

      console.log('Query result:', { count: customers?.length, error, offset, batch_size });
      if (error) throw error;
      if (!customers || customers.length === 0) {
        return new Response(JSON.stringify({ translated: 0, results: [], message: 'No more customers to translate' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const results: { id: string; name_fr?: string; store_name_fr?: string }[] = [];
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      for (const c of customers || []) {
        await delay(5000); // Wait 5s between customers to avoid rate limiting
        const updates: Record<string, string> = {};

        // Translate name if needed
        if (!c.name_fr && c.name) {
          try {
            const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: "You are a transliteration expert for Algerian names. Transliterate Arabic names to French phonetically. Always respond with valid JSON only: { \"fr\": \"transliterated text\" }" },
                  { role: "user", content: `Transliterate this Algerian person name from Arabic to French: "${c.name}"\nRespond with JSON: { "fr": "transliterated text" }` },
                ],
                temperature: 0.3,
              }),
            });
            console.log(`Name translate response status: ${resp.status}`);
            if (resp.ok) {
              const data = await resp.json();
              const content = data.choices?.[0]?.message?.content || '';
              console.log(`Name AI response for ${c.name}: ${content}`);
              const match = content.match(/\{[\s\S]*\}/);
              if (match) {
                const parsed = JSON.parse(match[0]);
                if (parsed.fr) updates.name_fr = parsed.fr;
              }
            } else {
              const errText = await resp.text();
              console.error(`Name translate error: ${resp.status} ${errText}`);
            }
          } catch (e) {
            console.error(`Failed to translate name for ${c.id}:`, e);
          }
        }

        // Translate store_name if needed
        if (!c.store_name_fr && c.store_name) {
          try {
            const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: `You are a transliteration expert for store/shop names in Algeria.
IMPORTANT: When Arabic text contains words borrowed from French (like سبيرات/سوبيرات = Supérette, شوب = Shop, بوتيك = Boutique, ماركت = Market/Marché, تغذية = Alimentation, كروسيري = Grosserie, أليمونتار = Alimentaire, ميني = Mini), use the CORRECT original French/English spelling.
For proper names, transliterate phonetically.
Always respond with valid JSON: { "fr": "transliterated text" }` },
                  { role: "user", content: `Transliterate this Algerian store name from Arabic to French: "${c.store_name}"\nRespond with JSON: { "fr": "transliterated text" }` },
                ],
                temperature: 0.3,
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              const content = data.choices?.[0]?.message?.content || '';
              const match = content.match(/\{[\s\S]*\}/);
              if (match) {
                const parsed = JSON.parse(match[0]);
                if (parsed.fr) updates.store_name_fr = parsed.fr;
              }
            }
          } catch (e) {
            console.error(`Failed to translate store for ${c.id}:`, e);
          }
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from('customers')
            .update(updates)
            .eq('id', c.id);
          if (!updateError) {
            results.push({ id: c.id, ...updates });
          }
        }
      }

      return new Response(JSON.stringify({ translated: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
