import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text, sourceLang, targetLangs, mode } = await req.json();

    if (!text || !sourceLang || !targetLangs || targetLangs.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields: text, sourceLang, targetLangs' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const langNames: Record<string, string> = {
      ar: 'Arabic',
      fr: 'French', 
      en: 'English',
    };

    const sourceLangName = langNames[sourceLang] || sourceLang;
    const targetLangNames = targetLangs.map((l: string) => `${langNames[l] || l} (key: ${l})`).join(', ');

    const isTransliterate = mode === 'transliterate';

    const systemPrompt = isTransliterate
      ? `You are a transliteration expert for store/shop names, especially in the Algerian context.
Your job is to transliterate (write the pronunciation) of names from one script to another.

IMPORTANT EXCEPTION: When Arabic text contains words that are originally borrowed from French (like سبيرات/سوبيرات = Supérette, شوب = Shop/Choppe, بوتيك = Boutique, كروسيري = Grosserie, مول = Mall, بريموار = Primeur, أليمونتار = Alimentaire, طابا = Tabac, بولانجري = Boulangerie, كافيتيريا = Cafétéria, فارماسي = Pharmacie, ليبرري = Librairie, كوافور = Coiffeur/Coiffeuse, ريستورون = Restaurant, بيتزيريا = Pizzeria, كريميري = Crèmerie, باتيسري = Pâtisserie, فريب = Friperie, مرشي = Marché, ديبو = Dépôt, ميني مارشي = Mini Marché, سوبر مارشي = Supermarché), you MUST write the CORRECT original French/English spelling, NOT a phonetic transliteration.

For proper names (people names, unique brand names), transliterate phonetically as usual.

Examples:
- "سوبيرات الحلال" → { "fr": "Supérette El Halal" } (NOT "Soubirat Al Halal")
- "شوب محمد" → { "fr": "Shop Mohamed" }
- "بوتيك أمين" → { "fr": "Boutique Amine" }
- "محمد" → { "fr": "Mohamed" }

Always respond with valid JSON only, no extra text.`
      : `You are a professional translator. Translate the given text accurately and naturally. 
For short labels/categories, keep translations concise.
For Arabic text with Algerian dialect, translate to standard but natural language.
Always respond with valid JSON only, no extra text.`;

    const userPrompt = isTransliterate
      ? `Transliterate the following store/shop name from ${sourceLangName} to ${targetLangNames}.
For words borrowed from French (like سبيرات, شوب, بوتيك, etc.), use the correct original French spelling.
For proper names, transliterate phonetically.

Text: "${text}"

Respond with JSON format: { "lang_code": "transliterated text" }
Example: "سوبيرات الحلال" → { "fr": "Supérette El Halal" }
Example: "محمد" → { "fr": "Mohamed", "en": "Mohamed" }`
      : `Translate the following text from ${sourceLangName} to ${targetLangNames}.

Text: "${text}"

Respond with JSON format: { "lang_code": "translated text" }
Example: { "fr": "Transport", "en": "Transportation" }`;

    console.log(`Translating "${text}" from ${sourceLang} to ${targetLangs.join(', ')}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log("AI response:", content);

    // Parse JSON from response (handle markdown code blocks)
    let translations: Record<string, string> = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        translations = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      throw new Error("Failed to parse translation response");
    }

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error("Translation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
