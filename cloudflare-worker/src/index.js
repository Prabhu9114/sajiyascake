export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/api/orders' && request.method === 'POST') {
      try {
        const data = await request.json();

        await env.SAJIYAS_CAKE_DB.prepare(
          `INSERT INTO sajiyascake_orders 
          (order_id, customer_name, customer_phone, delivery_date, cake_message, tiers, weight, eggless, flavor, tier_colors, drip, decorations, topper, total_amount, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          data.orderId,
          data.customerName,
          data.customerPhone,
          data.deliveryDate,
          data.cakeMessage,
          data.tiers,
          data.weight,
          data.eggless ? 1 : 0,
          data.flavor,
          JSON.stringify(data.tierColors || []),
          data.drip,
          JSON.stringify(data.decorations || []),
          data.topper,
          data.totalAmount,
          data.notes || ''
        ).run();

        await env.SAJIYAS_CAKE_KV.put(`order:${data.orderId}`, JSON.stringify(data), { expirationTtl: 2592000 });
        const count = parseInt((await env.SAJIYAS_CAKE_KV.get('total_orders')) || '0', 10) + 1;
        await env.SAJIYAS_CAKE_KV.put('total_orders', String(count));

        return new Response(JSON.stringify({ success: true, orderId: data.orderId, totalOrders: count }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (url.pathname === '/api/orders' && request.method === 'GET') {
      const { results } = await env.SAJIYAS_CAKE_DB.prepare(
        'SELECT * FROM sajiyascake_orders ORDER BY id DESC LIMIT 50'
      ).all();

      return new Response(JSON.stringify({ app: "Sajiya's Cake", orders: results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ app: "Sajiya's Cake API", status: "Active" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};
