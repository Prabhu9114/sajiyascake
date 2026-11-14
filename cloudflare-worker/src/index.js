export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-File-Name, X-Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const DEFAULT_STORE_SETTINGS = {
      shopName: "Sajiya's Cake",
      shopWhatsApp: '917873562312',
      displayPhone: '+91 78735 62312',
      address: 'Main Road, Near Station Chowk, Rajgangpur, Odisha 770017',
      mapLink: 'https://maps.google.com/?q=Rajgangpur,Odisha',
      hours: 'Open Daily: 9:00 AM – 10:00 PM',
      aboutText: "Welcome to Sajiya's Cake — Rajgangpur's boutique custom cake studio. Every cake is freshly baked to order using 100% pure vegetarian ingredients, rich Belgian chocolate, and handcrafted cream artistry.",
      storePhotos: []
    };

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
      flavors: { vanilla: 0, pineapple: 80, blackforest: 100, butterscotch: 120, truffle: 180, redvelvet: 200, rasmalai: 250 },
      decorations: { sprinkles: 40, cherries: 80, roses: 100, chocochips: 150, goldflakes: 120, candles: 30 },
      toppers: { none: 0, hbd: 70, anniversary: 70, congrats: 70, crown: 120 }
    };

    const DEFAULT_PRODUCTS = [
      {
        id: 'prod-1',
        name: 'Together Forever Royal',
        category: 'Signature Cakes',
        price: 1480,
        tag: 'Bestseller',
        desc: '2 Tier Rose Berry & Vanilla Truffle with handcrafted Cream Roses & Gold Flakes',
        mediaType: 'preset',
        preset: { tiers: 2, weightIndex: 0, flavorId: 'truffle', tierColors: ['#FB7185', '#FFFDF9', '#F9A8D4'], dripId: 'whitechoco', decorations: ['roses', 'goldflakes'], topperId: 'anniversary', cakeMessage: 'Together Forever' }
      }
    ];

    const DEFAULT_ACCESSORIES = [
      { id: 'acc-1', name: 'Sparkle Fountain Candle', price: 40, icon: 'fa-wand-sparkles', desc: 'Smokeless golden firework sparkle candle', imageUrl: '' }
    ];

    const DEFAULT_REVIEWS = [
      { id: 'rev-1', name: 'Ananya Sharma', rating: 5, comment: 'Ordered a custom cake — looked identical and tasted super fresh!', date: '2 days ago' }
    ];

    const jsonResponse = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    const getActiveAdminPin = async () => {
      const kvPin = await env.SAJIYAS_CAKE_KV.get('admin_pin');
      return kvPin || env.ADMIN_PIN || '1234';
    };

    const isAuthorized = async (req) => {
      const activePin = await getActiveAdminPin();
      return (req.headers.get('Authorization') || '') === `Bearer ${activePin}`;
    };

    // UPLOAD MEDIA
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      try {
        const contentType = request.headers.get('X-Content-Type') || 'image/png';
        const rawName = (request.headers.get('X-File-Name') || `media-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `${Date.now()}-${rawName}`;
        const buffer = await request.arrayBuffer();

        await env.SAJIYAS_CAKE_KV.put(`media:${key}`, buffer, {
          metadata: { contentType, fileName: rawName },
          expirationTtl: 15552000
        });

        const publicUrl = `${url.origin}/api/media/${encodeURIComponent(key)}`;
        return jsonResponse({ success: true, url: publicUrl, key, contentType });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    if (url.pathname.startsWith('/api/media/') && request.method === 'GET') {
      const key = decodeURIComponent(url.pathname.replace('/api/media/', ''));
      const { value, metadata } = await env.SAJIYAS_CAKE_KV.getWithMetadata(`media:${key}`, { type: 'arrayBuffer' });
      if (!value) return new Response('Media not found', { status: 404, headers: corsHeaders });
      return new Response(value, {
        headers: {
          ...corsHeaders,
          'Content-Type': (metadata && metadata.contentType) || 'image/png',
          'Cache-Control': 'public, max-age=31536000'
        }
      });
    }

    // GET PUBLIC STORE DATA (Strictly pulling from KV first)
    if (url.pathname === '/api/public-data' && request.method === 'GET') {
      try {
        let storeSettings = DEFAULT_STORE_SETTINGS;
        const storedSettings = await env.SAJIYAS_CAKE_KV.get('store_settings', 'json');
        if (storedSettings) storeSettings = { ...DEFAULT_STORE_SETTINGS, ...storedSettings };

        let pricing = DEFAULT_PRICING;
        const storedPricing = await env.SAJIYAS_CAKE_KV.get('pricing_config', 'json');
        if (storedPricing) pricing = { ...DEFAULT_PRICING, ...storedPricing };

        let products = DEFAULT_PRODUCTS;
        const storedProducts = await env.SAJIYAS_CAKE_KV.get('catalog_products', 'json');
        if (storedProducts && Array.isArray(storedProducts)) products = storedProducts;

        let accessories = DEFAULT_ACCESSORIES;
        const storedAccessories = await env.SAJIYAS_CAKE_KV.get('catalog_accessories', 'json');
        if (storedAccessories && Array.isArray(storedAccessories)) accessories = storedAccessories;

        let reviews = DEFAULT_REVIEWS;
        const storedReviews = await env.SAJIYAS_CAKE_KV.get('customer_reviews', 'json');
        if (storedReviews && Array.isArray(storedReviews)) reviews = storedReviews;

        const baseDelivered = parseInt((await env.SAJIYAS_CAKE_KV.get('delivered_offset')) || '128', 10);
        let dbDelivered = 0;
        try {
          const countRow = await env.SAJIYAS_CAKE_DB.prepare(
            "SELECT COUNT(*) as cnt FROM sajiyascake_orders WHERE status = 'DELIVERED'"
          ).first();
          dbDelivered = countRow ? Number(countRow.cnt || 0) : 0;
        } catch (e) {}

        return jsonResponse({
          success: true,
          storeSettings,
          pricing,
          products,
          accessories,
          deliveredCount: baseDelivered + dbDelivered,
          reviews
        });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // TRACK ORDER
    if (url.pathname === '/api/track-order' && request.method === 'GET') {
      const oid = (url.searchParams.get('orderId') || '').trim().toUpperCase();
      if (!oid) return jsonResponse({ success: false, error: 'Order ID required' }, 400);
      const formattedId = oid.startsWith('#') ? oid : `#${oid}`;
      const row = await env.SAJIYAS_CAKE_DB.prepare(
        'SELECT order_id, customer_name, delivery_date, total_amount, status, created_at FROM sajiyascake_orders WHERE UPPER(order_id) = ?'
      ).bind(formattedId).first();
      if (!row) return jsonResponse({ success: false, error: 'Order not found' }, 404);
      return jsonResponse({ success: true, order: row });
    }

    // REVIEWS
    if (url.pathname === '/api/reviews' && request.method === 'POST') {
      try {
        const body = await request.json();
        const stored = await env.SAJIYAS_CAKE_KV.get('customer_reviews', 'json');
        const reviews = Array.isArray(stored) ? stored : DEFAULT_REVIEWS;
        reviews.unshift({
          id: 'rev-' + Date.now(),
          name: String(body.name || 'Guest').slice(0, 40),
          rating: Math.min(5, Math.max(1, Number(body.rating) || 5)),
          comment: String(body.comment || '').slice(0, 260),
          date: 'Just now'
        });
        await env.SAJIYAS_CAKE_KV.put('customer_reviews', JSON.stringify(reviews.slice(0, 50)));
        return jsonResponse({ success: true, reviews });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // ADMIN LOGIN
    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
      const { pin } = await request.json();
      const activePin = await getActiveAdminPin();
      if (String(pin) === String(activePin)) return jsonResponse({ success: true });
      return jsonResponse({ success: false, error: 'Invalid Admin PIN' }, 401);
    }

    // ADMIN SAVE STORE SETTINGS & PIN
    if (url.pathname === '/api/admin/store-settings' && request.method === 'POST') {
      if (!(await isAuthorized(request))) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const { storeSettings, newPin } = await request.json();
      if (storeSettings) await env.SAJIYAS_CAKE_KV.put('store_settings', JSON.stringify(storeSettings));
      if (newPin && String(newPin).trim().length >= 4) await env.SAJIYAS_CAKE_KV.put('admin_pin', String(newPin).trim());
      return jsonResponse({ success: true });
    }

    // ADMIN SAVE PRODUCTS
    if (url.pathname === '/api/admin/products' && request.method === 'POST') {
      if (!(await isAuthorized(request))) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const { products } = await request.json();
      if (Array.isArray(products)) await env.SAJIYAS_CAKE_KV.put('catalog_products', JSON.stringify(products));
      return jsonResponse({ success: true });
    }

    // ADMIN SAVE ACCESSORIES
    if (url.pathname === '/api/admin/accessories' && request.method === 'POST') {
      if (!(await isAuthorized(request))) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const { accessories } = await request.json();
      if (Array.isArray(accessories)) await env.SAJIYAS_CAKE_KV.put('catalog_accessories', JSON.stringify(accessories));
      return jsonResponse({ success: true });
    }

    // ADMIN SAVE REVIEWS
    if (url.pathname === '/api/admin/reviews' && request.method === 'POST') {
      if (!(await isAuthorized(request))) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const { reviews } = await request.json();
      if (Array.isArray(reviews)) await env.SAJIYAS_CAKE_KV.put('customer_reviews', JSON.stringify(reviews));
      return jsonResponse({ success: true });
    }

    // ADMIN SAVE PRICING
    if (url.pathname === '/api/admin/pricing' && request.method === 'POST') {
      if (!(await isAuthorized(request))) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const { pricing, deliveredOffset } = await request.json();
      if (pricing) await env.SAJIYAS_CAKE_KV.put('pricing_config', JSON.stringify(pricing));
      if (deliveredOffset !== undefined) await env.SAJIYAS_CAKE_KV.put('delivered_offset', String(Number(deliveredOffset) || 0));
      return jsonResponse({ success: true });
    }

    // ADMIN ORDER STATUS
    if (url.pathname === '/api/admin/order-status' && request.method === 'POST') {
      if (!(await isAuthorized(request))) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const { orderId, status } = await request.json();
      await env.SAJIYAS_CAKE_DB.prepare('UPDATE sajiyascake_orders SET status = ? WHERE order_id = ?').bind(status, orderId).run();
      return jsonResponse({ success: true });
    }

    // ORDERS
    if (url.pathname === '/api/orders' && request.method === 'POST') {
      try {
        const data = await request.json();
        await env.SAJIYAS_CAKE_DB.prepare(
          `INSERT INTO sajiyascake_orders 
          (order_id, customer_name, customer_phone, delivery_date, cake_message, tiers, weight, eggless, flavor, tier_colors, drip, decorations, topper, total_amount, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          data.orderId, data.customerName, data.customerPhone, data.deliveryDate, data.cakeMessage,
          data.tiers, data.weight, data.eggless ? 1 : 0, data.flavor, JSON.stringify(data.tierColors || []),
          data.drip, JSON.stringify([...(data.decorations || []), ...(data.accessories || [])]),
          data.topper, data.totalAmount, data.notes || ''
        ).run();
        return jsonResponse({ success: true, orderId: data.orderId });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    if (url.pathname === '/api/orders' && request.method === 'GET') {
      const { results } = await env.SAJIYAS_CAKE_DB.prepare('SELECT * FROM sajiyascake_orders ORDER BY id DESC LIMIT 50').all();
      return jsonResponse({ app: "Sajiya's Cake", orders: results || [] });
    }

    return jsonResponse({ app: "Sajiya's Cake API", status: "Active" });
  }
};
