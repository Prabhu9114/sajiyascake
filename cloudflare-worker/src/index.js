export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const ADMIN_PIN = env.ADMIN_PIN || '1234';

    const DEFAULT_PRICING = {
      perPoundRate: 450,
      egglessCharge: 50,
      dripCharge: 80,
      tierWeights: {
        1: [
          { label: '0.5 kg (1 Pound)', pounds: 1, price: 450 },
          { label: '1.0 kg (2 Pounds)', pounds: 2, price: 850 }
        ],
        2: [
          { label: '1.5 kg (3 Pounds)', pounds: 3, price: 1300 },
          { label: '2.0 kg (4 Pounds)', pounds: 4, price: 1700 }
        ],
        3: [
          { label: '3.0 kg (6 Pounds)', pounds: 6, price: 2500 },
          { label: '4.0 kg (8 Pounds)', pounds: 8, price: 3300 }
        ]
      },
      flavors: {
        vanilla: 0,
        pineapple: 80,
        blackforest: 100,
        butterscotch: 120,
        truffle: 180,
        redvelvet: 200,
        rasmalai: 250
      },
      decorations: {
        sprinkles: 40,
        cherries: 80,
        roses: 100,
        chocochips: 150,
        goldflakes: 120,
        candles: 30
      },
      toppers: {
        none: 0,
        hbd: 70,
        anniversary: 70,
        congrats: 70,
        crown: 120
      }
    };

    const jsonResponse = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    // 1. PUBLIC CONFIG (PRICING + DELIVERED COUNT + APPROVED REVIEWS)
    if (url.pathname === '/api/public-data' && request.method === 'GET') {
      try {
        const storedPricing = await env.SAJIYAS_CAKE_KV.get('pricing_config');
        const pricing = storedPricing ? JSON.parse(storedPricing) : DEFAULT_PRICING;

        const baseDelivered = parseInt((await env.SAJIYAS_CAKE_KV.get('delivered_offset')) || '128', 10);
        let dbDelivered = 0;
        try {
          const countRow = await env.SAJIYAS_CAKE_DB.prepare(
            "SELECT COUNT(*) as cnt FROM sajiyascake_orders WHERE status = 'DELIVERED'"
          ).first();
          dbDelivered = countRow ? Number(countRow.cnt || 0) : 0;
        } catch (e) {}

        const storedReviews = await env.SAJIYAS_CAKE_KV.get('customer_reviews');
        const reviews = storedReviews
          ? JSON.parse(storedReviews)
          : [
              {
                id: 'rev-1',
                name: 'Ananya Sharma',
                rating: 5,
                comment: 'Ordered a 2-tier Rose Berry Truffle cake — looked identical to the preview and tasted super fresh!',
                date: '2 days ago'
              },
              {
                id: 'rev-2',
                name: 'Rohit Verma',
                rating: 5,
                comment: 'Best eggless Rasmalai cake in town! Delivered right on time.',
                date: '5 days ago'
              }
            ];

        return jsonResponse({
          success: true,
          pricing,
          deliveredCount: baseDelivered + dbDelivered,
          reviews
        });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // 2. SUBMIT CUSTOMER REVIEW
    if (url.pathname === '/api/reviews' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.name || !body.comment) {
          return jsonResponse({ success: false, error: 'Name and review required' }, 400);
        }
        const stored = await env.SAJIYAS_CAKE_KV.get('customer_reviews');
        const reviews = stored ? JSON.parse(stored) : [];
        const newReview = {
          id: 'rev-' + Date.now(),
          name: String(body.name).slice(0, 40),
          rating: Math.min(5, Math.max(1, Number(body.rating) || 5)),
          comment: String(body.comment).slice(0, 260),
          date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        };
        reviews.unshift(newReview);
        await env.SAJIYAS_CAKE_KV.put('customer_reviews', JSON.stringify(reviews.slice(0, 30)));
        return jsonResponse({ success: true, review: newReview, reviews: reviews.slice(0, 30) });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // 3. ADMIN VERIFY PIN
    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
      const { pin } = await request.json();
      if (String(pin) === String(ADMIN_PIN)) {
        return jsonResponse({ success: true });
      }
      return jsonResponse({ success: false, error: 'Invalid Admin PIN' }, 401);
    }

    // 4. ADMIN SAVE DYNAMIC PRICE CHART
    if (url.pathname === '/api/admin/pricing' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${ADMIN_PIN}`) {
        return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      }
      const { pricing, deliveredOffset } = await request.json();
      if (pricing) {
        await env.SAJIYAS_CAKE_KV.put('pricing_config', JSON.stringify(pricing));
      }
      if (deliveredOffset !== undefined && deliveredOffset !== null) {
        await env.SAJIYAS_CAKE_KV.put('delivered_offset', String(Number(deliveredOffset) || 0));
      }
      return jsonResponse({ success: true });
    }

    // 5. ADMIN UPDATE ORDER STATUS (e.g., PENDING -> DELIVERED)
    if (url.pathname === '/api/admin/order-status' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${ADMIN_PIN}`) {
        return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      }
      const { orderId, status } = await request.json();
      await env.SAJIYAS_CAKE_DB.prepare(
        'UPDATE sajiyascake_orders SET status = ? WHERE order_id = ?'
      ).bind(status, orderId).run();
      return jsonResponse({ success: true });
    }

    // 6. PLACE NEW ORDER (POST)
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
        return jsonResponse({ success: true, orderId: data.orderId });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // 7. LIST ORDERS (GET)
    if (url.pathname === '/api/orders' && request.method === 'GET') {
      const { results } = await env.SAJIYAS_CAKE_DB.prepare(
        'SELECT * FROM sajiyascake_orders ORDER BY id DESC LIMIT 50'
      ).all();
      return jsonResponse({ app: "Sajiya's Cake", orders: results || [] });
    }

    return jsonResponse({ app: "Sajiya's Cake API", status: "Active" });
  }
};
