import { NextResponse } from 'next/server';
import { requireManagerSession } from '@/lib/requireRole';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

// Manager-only admin listing/creation — the register itself gets categories
// through lib/menu.js's getCategories(), fetched server-side in
// app/page.jsx, not through this route.
export async function GET() {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { rows } = await query('select id, name, sort_order from menu_categories order by sort_order asc');
  return NextResponse.json({ success: true, categories: rows }, { headers: { 'Cache-Control': 'no-store' } });
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

  const { name } = body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json(
      { success: false, error: 'Category name is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { rows: countRows } = await query('select coalesce(max(sort_order), -1)::int + 1 as next from menu_categories');

  try {
    const { rows } = await query(
      'insert into menu_categories (name, sort_order) values ($1, $2) returning id, name, sort_order',
      [name.trim(), countRows[0].next]
    );
    return NextResponse.json({ success: true, category: rows[0] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'A category with that name already exists' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    throw err;
  }
}
