import { NextResponse } from 'next/server';
import { getMenu, getCategories } from '@/lib/menu';

export const runtime = 'nodejs';

// Lets the register re-fetch the active menu/categories on demand (e.g. when
// the tab regains focus) instead of only ever seeing whatever app/page.jsx
// fetched server-side at the last full page load — any logged-in staff
// member can call this, same access level as the register itself.
export async function GET() {
  const [menu, categories] = await Promise.all([getMenu(), getCategories()]);
  return NextResponse.json({ success: true, menu, categories }, { headers: { 'Cache-Control': 'no-store' } });
}
