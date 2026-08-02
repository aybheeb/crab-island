import { query } from './db';

// Active menu, reshaped to match exactly what components/data.js's
// hardcoded MENU array used to look like — Menu.jsx, unitPriceFor(),
// customChips() etc. all keep working unchanged against this shape.
// Only for rendering the register; the manager admin screens query
// menu_items/menu_categories directly since they need raw ids, category_id,
// and inactive rows too.
export async function getMenu() {
  const { rows } = await query(
    `select mi.id, mi.num, mi.name, mi.description, mc.name as category,
            mi.platter, mi.cooking, mi.bowl, mi.fish_choice, mi.market_price,
            mi.seasoning, mi.taxable, mi.ebt_eligible, mi.price, mi.sizes, mi.no_combo_sizes
     from menu_items mi
     join menu_categories mc on mc.id = mi.category_id
     where mi.active = true
     order by mc.sort_order asc, mi.sort_order asc`
  );

  return rows.map((row) => ({
    id: row.id,
    num: row.num,
    name: row.name,
    desc: row.description,
    category: row.category,
    platter: row.platter,
    cooking: row.cooking,
    bowl: row.bowl,
    fishChoice: row.fish_choice,
    marketPrice: row.market_price,
    seasoning: row.seasoning,
    taxable: row.taxable,
    ebtEligible: row.ebt_eligible,
    price: row.sizes ? undefined : Number(row.price),
    sizes: row.sizes || null,
    noCombo: row.no_combo_sizes ? { sizes: row.no_combo_sizes } : null,
  }));
}

export async function getCategories() {
  const { rows } = await query('select name from menu_categories order by sort_order asc');
  return rows.map((r) => r.name);
}
