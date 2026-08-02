import { NextResponse } from 'next/server';
import { requireManagerSession } from '@/lib/requireRole';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

function validateSizes(sizes) {
  if (!Array.isArray(sizes) || sizes.length === 0) return false;
  return sizes.every((s) => s && typeof s.label === 'string' && s.label.trim() && typeof s.price === 'number' && s.price >= 0);
}

// Edit form always submits a full replace of the item's content — items are
// simply edited or deleted, no separate deactivate/reactivate state.
export async function PATCH(request, { params }) {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { rows: existingRows } = await query('select id from menu_items where id = $1', [id]);
  if (!existingRows[0]) {
    return NextResponse.json(
      { success: false, error: 'Menu item not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const {
    categoryId, num, name, desc, platter, cooking, bowl, fishChoice,
    marketPrice, seasoning, taxable, ebtEligible, price, sizes, noComboSizes, active,
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

  await query(
    `update menu_items set
       category_id = $1, num = $2, name = $3, description = $4,
       platter = $5, cooking = $6, bowl = $7, fish_choice = $8,
       market_price = $9, seasoning = $10, taxable = $11, ebt_eligible = $12,
       price = $13, sizes = $14::jsonb, no_combo_sizes = $15::jsonb,
       active = $16
     where id = $17`,
    [
      categoryId, num || null, name.trim(), desc || '', !!platter, !!cooking, !!bowl, !!fishChoice,
      !!marketPrice, seasoning !== false, !!taxable, ebtEligible !== false,
      hasSizes ? null : (hasPrice ? price : null),
      hasSizes ? JSON.stringify(sizes) : null,
      noComboSizes ? JSON.stringify(noComboSizes) : null,
      active === undefined ? true : !!active,
      id,
    ]
  );

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}

// Safe to hard-delete — orders snapshot the full item object inline at
// creation time (see server/services/orderStore.js), there's no live
// reference from order history back to this table.
export async function DELETE(_request, { params }) {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { id } = await params;

  const { rowCount } = await query('delete from menu_items where id = $1', [id]);
  if (rowCount === 0) {
    return NextResponse.json(
      { success: false, error: 'Menu item not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
