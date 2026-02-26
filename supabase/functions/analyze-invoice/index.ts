import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const { image_base64, payment_method } = await req.json();
    if (!image_base64) {
      throw new Error('image_base64 is required');
    }

    const prompt = `أنت محلل فواتير ووثائق مالية. قم بتحليل هذه الصورة واستخراج البيانات التالية بدقة:

1. المبلغ الإجمالي (amount) - الرقم فقط بدون عملة
2. رقم الفاتورة (invoice_number) 
3. اسم العميل (customer_name)
${payment_method === 'check' ? '4. رقم الشيك (check_number)\n5. اسم البنك (check_bank)' : ''}
${payment_method === 'bank_receipt' ? '4. رقم الوصل (receipt_number)' : ''}
${payment_method === 'bank_transfer' ? '4. مرجع التحويل (transfer_reference)' : ''}

أجب بتنسيق JSON فقط بدون أي نص إضافي. مثال:
{"amount": "15000", "invoice_number": "FC-2024-001", "customer_name": "محل الأمانة"}

إذا لم تجد قيمة معينة، اتركها فارغة "".`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${image_base64}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 1024,
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI Gateway error:', response.status, errText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ success: false, error: 'تم تجاوز حد الطلبات، حاول مرة أخرى لاحقاً' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ success: false, error: 'يرجى إضافة رصيد لحساب Lovable AI' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = textContent.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0]);
      return new Response(JSON.stringify({ success: true, data: extracted }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, raw_text: textContent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('analyze-invoice error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
