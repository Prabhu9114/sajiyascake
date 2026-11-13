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
      },
      accessories: {
        sparkle_candle: 40,
        number_candle: 35,
        knife_set: 30,
        party_popper: 60,
        hbd_banner: 90,
        foil_balloons: 150
      }
    };

    const DEFAULT_PRODUCTS = [
      {
        id: 'prod-1',
        name: 'Together Forever Royal',
        category: 'Signature Cakes',
        price: 1480,
        tag: 'Bestseller',
        desc: '2 Tier Rose Berry & Vanilla Truffle with Cream Roses',
        preset: { tiers: 2, weightIndex: 0, flavorId: 'truffle', tierColors: ['#FB7185', '#FFFDF9', '#F9A8D4'], dripId: 'whitechoco', decorations: ['roses', 'goldflakes'], topperId: 'anniversary', cakeMessage: 'Together Forever' }
      },
      {
        id: 'prod-2',
        name: 'Butterscotch Bliss',
        category: "What's Trending",
        price: 650,
        tag: 'Trending',
        desc: '1 Tier Golden Butterscotch with Caramel Drip & Sprinkles',
        preset: { tiers: 1, weightIndex: 0, flavorId: 'butterscotch', tierColors: ['#FDE047', '#FFFDF9', '#FDE047'], dripId: 'caramel', decorations: ['sprinkles', 'cherries'], topperId: 'hbd', cakeMessage: 'Happy Birthday' }
      },
      {
        id: 'prod-3',
        name: 'Midnight Choco Truffle',
        category: 'Occasional Cakes',
        price: 780,
        tag: 'Chef Special',
        desc: 'Rich Dark Chocolate Truffle with Oreo & Choco Chips',
        preset: { tiers: 1, weightIndex: 0, flavorId: 'truffle', tierColors: ['#5C3317', '#5C3317', '#5C3317'], dripId: 'choco', decorations: ['chocochips', 'goldflakes'], topperId: 'hbd', cakeMessage: 'Happy Birthday' }
      },
      {
        id: 'prod-4',
        name: 'Royal Rasmalai Crown',
        category: 'Theme Cakes',
        price: 1750,
        tag: 'Festive',
        desc: '2 Tier Kesar Rasmalai Fusion topped with Royal Gold Crown',
        preset: { tiers: 2, weightIndex: 0, flavorId: 'rasmalai', tierColors: ['#FDBA74', '#FDE047', '#FFFDF9'], dripId: 'whitechoco', decorations: ['roses', 'goldflakes'], topperId: 'crown', cakeMessage: 'Best Wishes' }
      }
    ];

    const DEFAULT_REVIEWS = [
      {
        id: 'rev-1',
        name: 'Ananya Sharma',
        rating: 5,
        comment: 'Ordered a 2-tier Rose Berry Truffle cake — looked identical to the receipt slip and tasted super fresh!',
        date: '2 days ago'
      },
      {
        id: 'rev-2',
        name: 'Rohit Verma',
        rating: 5,
        comment: 'Best eggless Rasmalai cake in Rajgangpur! Delivered right on time.',
        date: '5 days ago'
      }
    ];

    const jsonResponse = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    const isAuthorized = (req) => (req.headers.get('Authorization') || '') === `Bearer ${ADMIN_PIN}`;

    if (url.pathname === '/api/public-data' && request.method === 'GET') {
      try {
        const storedPricing = await env.SAJIYAS_CAKE_KV.get('pricing_config');
        const pricing = storedPricing ? { ...DEFAULT_PRICING, ...JSON.parse(storedPricing) } : DEFAULT_PRICING;

        const storedProducts = await env.SAJIYAS_CAKE_KV.get('catalog_products');
        const products = storedProducts ? JSON.parse(storedProducts) : DEFAULT_PRODUCTS;

        const baseDelivered = parseInt((await env.SAJIYAS_CAKE_KV.get('delivered_offset')) || '128', 10);
        let dbDelivered = 0;
        try {
          const countRow = await env.SAJIYAS_CAKE_DB.prepare(
            "SELECT COUNT(*) as cnt FROM sajiyascake_orders WHERE status = 'DELIVERED'"
          ).first();
          dbDelivered = countRow ? Number(countRow.cnt || 0) : 0;
        } catch (e) {}

        const storedReviews = await env.SAJIYAS_CAKE_KV.get('customer_reviews');
        const reviews = storedReviews ? JSON.parse(storedReviews) : DEFAULT_REVIEWS;

        return jsonResponse({
          success: true,
          pricing,
          products,
          deliveredCount: baseDelivered + dbDelivered,
          deliveredOffset: baseDelivered,
          reviews
        });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    if (url.pathname === '/api/reviews' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.name || !body.comment) {
          return jsonResponse({ success: false, error: 'Name and review required' }, 400);
        }
        const stored = await env.SAJIYAS_CAKE_KV.get('customer_reviews');
        const reviews = stored ? JSON.parse(stored) : DEFAULT_REVIEWS;
        const newReview = {
          id: 'rev-' + Date.now(),
          name: String(body.name).slice(0, 40),
          rating: Math.min(5, Math.max(1, Number(body.rating) || 5)),
          comment: String(body.comment).slice(0, 260),
          date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        };
        reviews.unshift(newReview);
        await env.SAJIYAS_CAKE_KV.put('customer_reviews', JSON.stringify(reviews.slice(0, 40)));
        return jsonResponse({ success: true, reviews: reviews.slice(0, 40) });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
      const { pin } = await request.json();
      if (String(pin) === String(ADMIN_PIN)) {
        return jsonResponse({ success: true });
      }
      return jsonResponse({ success: false, error: 'Invalid Admin PIN' }, 401);
    }

    if (url.pathname === '/api/admin/products' && request.method === 'POST') {
      if (!isAuthorized(request)) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const { products } = await request.json();
      if (Array.isArray(products)) {
        await env.SAJIYAS_CAKE_KV.put('catalog_products', JSON.stringify(products));
      }
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/reviews' && request.method === 'POST') {
      if (!isAuthorized(request)) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const { reviews } = await request.json();
      if (Array.isArray(reviews)) {
        await env.SAJIYAS_CAKE_KV.put('customer_reviews', JSON.stringify(reviews));
      }
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/pricing' && request.method === 'POST') {
      if (!isAuthorized(request)) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const { pricing, deliveredOffset } = await request.json();
      if (pricing) {
        await env.SAJIYAS_CAKE_KV.put('pricing_config', JSON.stringify(pricing));
      }
      if (deliveredOffset !== undefined && deliveredOffset !== null) {
        await env.SAJIYAS_CAKE_KV.put('delivered_offset', String(Number(deliveredOffset) || 0));
      }
      return jsonResponse({ success: true });
    }

    if (url.pathname === '/api/admin/order-status' && request.method === 'POST') {
      if (!isAuthorized(request)) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const { orderId, status } = await request.json();
      await env.SAJIYAS_CAKE_DB.prepare(
        'UPDATE sajiyascake_orders SET status = ? WHERE order_id = ?'
      ).bind(status, orderId).run();
      return jsonResponse({ success: true });
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
          JSON.stringify([...(data.decorations || []), ...(data.accessories || [])]),
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

    if (url.pathname === '/api/orders' && request.method === 'GET') {
      const { results } = await env.SAJIYAS_CAKE_DB.prepare(
        'SELECT * FROM sajiyascake_orders ORDER BY id DESC LIMIT 50'
      ).all();
      return jsonResponse({ app: "Sajiya's Cake", orders: results || [] });
    }

    return jsonResponse({ app: "Sajiya's Cake API", status: "Active" });
  }
};
