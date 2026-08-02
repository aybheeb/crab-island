import { NextResponse } from 'next/server';
import { requireManagerSession } from '@/lib/requireRole';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

// Categories are "on delete restrict" against menu_items — a category still
// holding items throws a real FK violation (23503) rather than silently
// orphaning or cascading them, so the manager has to clear it out first.
export async function DELETE(_request, { params }) {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { id } = await params;

  try {
    const { rowCount } = await query('delete from menu_categories where id = $1', [id]);
    if (rowCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Category not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err.code === '23503') {
      return NextResponse.json(
        { success: false, error: 'This category still has items — remove or move them first' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    throw err;
  }
}
