// One-off migration: moves the hardcoded MENU array (components/data.js) into
// menu_categories/menu_items, and applies the specific changes requested this
// week — King Crab (#4) gets real pricing instead of "ask for today's rate",
// a new Drinks category, and a Sauce cup side.
//
// Safe to re-run: categories upsert by name, items upsert by (category, num
// or name) so re-running after further code edits here won't duplicate rows.
import { Client } from 'pg';
import { withLibpqCompat } from '../lib/pgConnectionString.js';

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('POSTGRES_URL_NON_POOLING (or POSTGRES_URL) is not set — run `vercel env pull .env.local` first.');
  process.exit(1);
}

const CATEGORIES = ['Seafood Platters', 'Combination Platters', 'Rice Bowls', 'Sides', 'Drinks'];

const MENU = [
  // ── Seafood Platters ──────────────────────────────────────────
  { num: '#1', name: 'Large Shrimp', desc: '½ lb. or 1 lb.', category: 'Seafood Platters', platter: true, cooking: true, sizes: [{ label: '½ lb.', price: 16.99 }, { label: '1 lb.', price: 28.99 }], noCombo: { sizes: [{ label: '½ lb.', price: 12.99 }, { label: '1 lb.', price: 22.99 }] } },
  { num: '#2', name: 'Jumbo Shrimp', desc: '½ lb. or 1 lb.', category: 'Seafood Platters', platter: true, cooking: false, sizes: [{ label: '½ lb.', price: 18.99 }, { label: '1 lb.', price: 30.99 }], noCombo: { sizes: [{ label: '½ lb.', price: 14.99 }, { label: '1 lb.', price: 26.00 }] } },
  { num: '#3', name: 'Snow Crab (1 lb.)', desc: '', category: 'Seafood Platters', platter: true, cooking: false, price: 38.99, noCombo: { sizes: [{ label: '½ lb.', price: 17.99 }, { label: '1 lb.', price: 32.99 }] } },
  // #4 King Crab — was marketPrice ("Ask for today's rate"); now real sizes per this week's message: 1 lb $59.99, ½ lb $30.99.
  { num: '#4', name: 'King Crab', desc: '½ lb. or 1 lb.', category: 'Seafood Platters', platter: true, cooking: false, sizes: [{ label: '½ lb.', price: 30.99 }, { label: '1 lb.', price: 59.99 }], noCombo: { sizes: [{ label: '½ lb.', price: 27.99 }, { label: '1 lb.', price: 54.99 }] } },
  { num: '#5', name: 'Tilapia', desc: '½ lb. or 1 lb. fillet', category: 'Seafood Platters', platter: true, cooking: true, sizes: [{ label: '½ lb.', price: 10.99 }, { label: '1 lb.', price: 17.99 }], noCombo: { sizes: [{ label: '½ lb.', price: 8.00 }, { label: '1 lb.', price: 13.99 }] } },
  { num: '#6', name: 'Ocean Perch', desc: '½ lb. or 1 lb.', category: 'Seafood Platters', platter: true, cooking: true, sizes: [{ label: '½ lb.', price: 12.99 }, { label: '1 lb.', price: 18.99 }], noCombo: { sizes: [{ label: '½ lb.', price: 9.00 }, { label: '1 lb.', price: 15.99 }] } },
  { num: '#7', name: 'Cat Fish', desc: '½ lb. or 1 lb.', category: 'Seafood Platters', platter: true, cooking: true, sizes: [{ label: '½ lb.', price: 13.99 }, { label: '1 lb.', price: 19.99 }], noCombo: { sizes: [{ label: '½ lb.', price: 9.50 }, { label: '1 lb.', price: 17.00 }] } },
  { num: '#8', name: 'Whiting', desc: '½ lb. or 1 lb.', category: 'Seafood Platters', platter: true, cooking: true, sizes: [{ label: '½ lb.', price: 10.99 }, { label: '1 lb.', price: 17.99 }], noCombo: { sizes: [{ label: '½ lb.', price: 7.00 }, { label: '1 lb.', price: 11.99 }] } },
  { num: '#9', name: 'Salmon', desc: '½ lb. or 1 lb. fillet', category: 'Seafood Platters', platter: true, cooking: false, sizes: [{ label: '½ lb.', price: 17.99 }, { label: '1 lb.', price: 24.99 }], noCombo: { sizes: [{ label: '½ lb.', price: 11.99 }, { label: '1 lb.', price: 19.99 }] } },
  { num: '#10', name: 'Walleye', desc: '½ lb. or 1 lb.', category: 'Seafood Platters', platter: true, cooking: true, sizes: [{ label: '½ lb.', price: 15.99 }, { label: '1 lb.', price: 22.99 }], noCombo: { sizes: [{ label: '½ lb.', price: 9.99 }, { label: '1 lb.', price: 17.99 }] } },
  { num: '#11', name: 'Scallops', desc: '½ lb. or 1 lb.', category: 'Seafood Platters', platter: true, cooking: false, sizes: [{ label: '½ lb.', price: 21.99 }, { label: '1 lb.', price: 40.99 }], noCombo: { sizes: [{ label: '½ lb.', price: 17.99 }, { label: '1 lb.', price: 31.99 }] } },
  { num: '#12', name: 'Mussels (1 lb.)', desc: '', category: 'Seafood Platters', platter: true, cooking: false, price: 15.99, noCombo: { sizes: [{ label: '½ lb.', price: 6.99 }, { label: '1 lb.', price: 10.99 }] } },
  { num: '#13', name: 'Crawfish (1 lb.)', desc: '', category: 'Seafood Platters', platter: true, cooking: false, price: 17.99, noCombo: { sizes: [{ label: '½ lb.', price: 7.99 }, { label: '1 lb.', price: 12.99 }] } },

  // ── Combination Platters ──────────────────────────────────────
  { num: '#14', name: 'Seafood Combo', desc: 'Snow Crab Cluster & ½ lb. Shrimp', category: 'Combination Platters', platter: true, cooking: false, price: 33.99 },
  { num: '#15', name: 'Crab & Lobster Tail', desc: 'Snow Crab Cluster & One Medium Lobster Tail', category: 'Combination Platters', platter: true, cooking: false, price: 38.99 },
  { num: '#16', name: 'Crab & Fish', desc: 'Snow Crab Cluster & ½ lb. Fish (Catfish/Salmon/Walleye add $2)', category: 'Combination Platters', platter: true, cooking: false, price: 26.99, fishChoice: true },
  { num: '#17', name: 'Crab & Crawfish', desc: 'Snow Crab & 1 lb. Crawfish', category: 'Combination Platters', platter: true, cooking: false, price: 27.99 },
  { num: '#21', name: 'Shrimp & Lobster Tail', desc: '½ lb. Shrimp & One Medium Lobster Tail', category: 'Combination Platters', platter: true, cooking: false, price: 33.99 },
  { num: '#22', name: 'Shrimp & Fish', desc: '½ lb. Shrimp & ½ lb. Fish (Catfish/Salmon/Walleye add $2)', category: 'Combination Platters', platter: true, cooking: true, price: 21.99, fishChoice: true },
  { num: '#24', name: 'Shrimp & Mussels', desc: '½ lb. Large Shrimp & 1 lb. Mussels', category: 'Combination Platters', platter: true, cooking: false, price: 24.99 },
  { num: '#25', name: 'Double Seafood', desc: '1 lb. Snow Crab & 1 lb. Shrimp', category: 'Combination Platters', platter: true, cooking: false, price: 62.99 },
  { num: '#26', name: 'Ultimate Combo', desc: 'Snow Crab, ½ lb. Fish, One Medium Tail, ½ lb. Shrimp (Catfish/Salmon/Walleye add $2)', category: 'Combination Platters', platter: true, cooking: false, price: 54.99, fishChoice: true },
  { num: '#28', name: 'King Combo', desc: '1 lb. Snow Crab, 1 lb. Large Shrimp, Two Medium Tails', category: 'Combination Platters', platter: true, cooking: false, price: 93.99 },
  { num: '#29', name: 'Shrimp, Crab & Lobster', desc: '½ lb. Large Shrimp, Snow Crab, Small Lobster Tail', category: 'Combination Platters', platter: true, cooking: false, price: 43.99 },

  // ── Rice Bowls ────────────────────────────────────────────────
  { num: '#31', name: 'Fish Bowl', desc: 'Rice, broccoli and corn, Island or White sauce', category: 'Rice Bowls', bowl: true, price: 17.99, seasoning: false },
  { num: '#32', name: 'Shrimp Bowl', desc: 'Rice, broccoli and corn, Island or White sauce', category: 'Rice Bowls', bowl: true, price: 16.99, seasoning: false },
  { num: '#33', name: 'Fish & Shrimp Bowl', desc: 'Rice, broccoli and corn, Island or White sauce', category: 'Rice Bowls', bowl: true, price: 17.99, seasoning: false },
  { num: '#34', name: 'Chicken Bowl', desc: 'Rice, broccoli and corn, Island or White sauce', category: 'Rice Bowls', bowl: true, price: 14.99, seasoning: false },

  // ── Sides ─────────────────────────────────────────────────────
  { num: null, name: 'Crab Leg Cluster (×1)', desc: '', category: 'Sides', price: 17.99 },
  { num: null, name: 'Lobster Tail', desc: 'Small or Medium', category: 'Sides', sizes: [{ label: 'Small', price: 15.99 }, { label: 'Medium', price: 20.99 }] },
  { num: null, name: 'Steamed Veggies', desc: 'Regular, Small Pan, or Large Pan', category: 'Sides', sizes: [{ label: 'Regular', price: 7.99 }, { label: 'Small Pan', price: 18.99 }, { label: 'Large Pan', price: 48.99 }] },
  { num: null, name: 'Clams', desc: '½ lb. or 1 lb.', category: 'Sides', sizes: [{ label: '½ lb.', price: 7.99 }, { label: '1 lb.', price: 12.99 }] },
  { num: null, name: 'Scallops (4 pcs)', desc: '', category: 'Sides', price: 13.99 },
  { num: null, name: 'Oysters (½ dozen)', desc: '', category: 'Sides', price: 13.99 },
  { num: null, name: 'Fried Calamari', desc: '', category: 'Sides', price: 13.99 },
  { num: null, name: 'Clam Strips', desc: '', category: 'Sides', price: 6.99 },
  { num: null, name: 'Turkey Sausage', desc: '', category: 'Sides', price: 6.99, seasoning: false },
  { num: null, name: 'Eggs', desc: '×1 or ×2', category: 'Sides', sizes: [{ label: '×1', price: 1.50 }, { label: '×2', price: 2.99 }] },
  { num: null, name: 'Garlic Bread (×2 pcs)', desc: '', category: 'Sides', price: 1.99, seasoning: false },
  { num: null, name: 'Fries', desc: '', category: 'Sides', price: 4.99 },
  { num: null, name: 'Broccoli', desc: '', category: 'Sides', price: 4.00 },
  { num: null, name: 'Potato', desc: '', category: 'Sides', price: 4.00 },
  { num: null, name: 'Corn (1 pc)', desc: '', category: 'Sides', price: 1.50 },
  { num: null, name: 'Cheesecake', desc: '', category: 'Sides', price: 3.99, seasoning: false },
  { num: null, name: 'Strawberry Cheesecake', desc: '', category: 'Sides', price: 4.99, seasoning: false },
  { num: null, name: 'Rice', desc: 'Small or Large', category: 'Sides', sizes: [{ label: 'Small', price: 3.99 }, { label: 'Large', price: 5.99 }], seasoning: false },
  // New this week — a manager-requested side.
  { num: null, name: 'Sauce Cup', desc: '', category: 'Sides', price: 0.75, seasoning: false },

  // ── Drinks (new this week) ──────────────────────────────────────
  { num: null, name: 'Tea', desc: '', category: 'Drinks', price: 2.25, seasoning: false, taxable: true },
  { num: null, name: 'Soda', desc: '', category: 'Drinks', price: 1.25, seasoning: false, taxable: true },
  { num: null, name: 'Water', desc: '', category: 'Drinks', price: 1.00, seasoning: false, taxable: true },
];

const client = new Client({ connectionString: withLibpqCompat(connectionString) });
await client.connect();

try {
  const categoryIds = {};
  for (let i = 0; i < CATEGORIES.length; i++) {
    const { rows } = await client.query(
      `insert into menu_categories (name, sort_order) values ($1, $2)
       on conflict (name) do update set sort_order = excluded.sort_order
       returning id`,
      [CATEGORIES[i], i]
    );
    categoryIds[CATEGORIES[i]] = rows[0].id;
  }

  const bySortOrder = {};
  let inserted = 0;
  let updated = 0;
  for (const item of MENU) {
    const categoryId = categoryIds[item.category];
    const sortOrder = (bySortOrder[item.category] ?? -1) + 1;
    bySortOrder[item.category] = sortOrder;

    const matchKey = item.num || item.name;
    const { rows: existingRows } = await client.query(
      `select id from menu_items where category_id = $1 and coalesce(num, name) = $2`,
      [categoryId, matchKey]
    );

    const values = [
      categoryId,
      item.num ?? null,
      item.name,
      item.desc ?? '',
      !!item.platter,
      !!item.cooking,
      !!item.bowl,
      !!item.fishChoice,
      !!item.marketPrice,
      item.seasoning !== false,
      !!item.taxable,
      item.price ?? null,
      item.sizes ? JSON.stringify(item.sizes) : null,
      item.noCombo ? JSON.stringify(item.noCombo.sizes) : null,
      sortOrder,
    ];

    if (existingRows[0]) {
      await client.query(
        `update menu_items set
           category_id = $1, num = $2, name = $3, description = $4,
           platter = $5, cooking = $6, bowl = $7, fish_choice = $8,
           market_price = $9, seasoning = $10, taxable = $11,
           price = $12, sizes = $13::jsonb, no_combo_sizes = $14::jsonb, sort_order = $15
         where id = $16`,
        [...values, existingRows[0].id]
      );
      updated++;
    } else {
      await client.query(
        `insert into menu_items
           (category_id, num, name, description, platter, cooking, bowl, fish_choice,
            market_price, seasoning, taxable, price, sizes, no_combo_sizes, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15)`,
        values
      );
      inserted++;
    }
  }

  console.log(`Menu seeded: ${inserted} inserted, ${updated} updated, ${CATEGORIES.length} categories.`);
} finally {
  await client.end();
}
