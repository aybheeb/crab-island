import { NextResponse } from 'next/server';
import { requireManagerSession } from '@/lib/requireRole';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

function validateSizes(sizes) {
  if (!Array.isArray(sizes) || sizes.length === 0) return false;
  return sizes.every((s) => s && typeof s.label === 'string' && s.label.trim() && typeof s.price === 'number' && s.price >= 0);
}

// Manager-only admin listing (includes inactive items, so they can be
// reactivated) — the register gets items through lib/menu.js's getMenu(),
// fetched server-side in app/page.jsx, not through this route.
export async function GET() {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { rows } = await query(
    `select mi.id, mi.category_id as "categoryId", mc.name as category, mi.num, mi.name,
            mi.description as desc, mi.platter, mi.cooking, mi.bowl,
            mi.fish_choice as "fishChoice", mi.market_price as "marketPrice",
            mi.seasoning, mi.taxable, mi.ebt_eligible as "ebtEligible", mi.price, mi.sizes, mi.no_combo_sizes as "noComboSizes",
            mi.active, mi.sort_order as "sortOrder"
     from menu_items mi
     join menu_categories mc on mc.id = mi.category_id
     order by mc.sort_order asc, mi.sort_order asc`
  );
  // pg returns numeric columns as strings (to avoid float precision loss) —
  // sizes/no_combo_sizes are jsonb, so their nested prices already came back
  // as real numbers; only the flat price column needs converting here.
  const items = rows.map((row) => ({ ...row, price: row.price === null ? null : Number(row.price) }));
  return NextResponse.json({ success: true, items }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const {
    categoryId, num, name, desc, platter, cooking, bowl, fishChoice,
    marketPrice, seasoning, taxable, ebtEligible, price, sizes, noComboSizes,
  } = body || {};

  if (!categoryId || typeof categoryId !== 'string') {
    return NextResponse.json(
      { success: false, error: 'categoryId is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json(
      { success: false, error: 'Name is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const hasSizes = sizes !== undefined && sizes !== null;
  const hasPrice = typeof price === 'number' && price >= 0;
  if (!marketPrice && !hasSizes && !hasPrice) {
    return NextResponse.json(
      { success: false, error: 'Provide a price, a sizes list, or mark this item market-price' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (hasSizes && !validateSizes(sizes)) {
    return NextResponse.json(
      { success: false, error: 'Each size needs a label and a non-negative price' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (noComboSizes !== undefined && noComboSizes !== null && !validateSizes(noComboSizes)) {
    return NextResponse.json(
      { success: false, error: 'Each no-combo size needs a label and a non-negative price' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { rows: catRows } = await query('select id from menu_categories where id = $1', [categoryId]);
  if (!catRows[0]) {
    return NextResponse.json(
      { success: false, error: 'Category not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { rows: sortRows } = await query(
    'select coalesce(max(sort_order), -1)::int + 1 as next from menu_items where category_id = $1',
    [categoryId]
  );

  const { rows } = await query(
    `insert into menu_items
       (category_id, num, name, description, platter, cooking, bowl, fish_choice,
        market_price, seasoning, taxable, ebt_eligible, price, sizes, no_combo_sizes, sort_order)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16)
     returning id`,
    [
      categoryId, num || null, name.trim(), desc || '', !!platter, !!cooking, !!bowl, !!fishChoice,
      !!marketPrice, seasoning !== false, !!taxable, ebtEligible !== false,
      hasSizes ? null : (hasPrice ? price : null),
      hasSizes ? JSON.stringify(sizes) : null,
      noComboSizes ? JSON.stringify(noComboSizes) : null,
      sortRows[0].next,
    ]
  );

  return NextResponse.json({ success: true, id: rows[0].id }, { headers: { 'Cache-Control': 'no-store' } });
}
