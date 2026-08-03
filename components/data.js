// MENU/CATEGORIES used to be hardcoded here — they're database-backed now
// (menu_items/menu_categories, see lib/menu.js), fetched server-side in
// app/page.jsx and passed down as props. scripts/seed-menu.mjs has the
// original data this was migrated from, if you need to reference it.

export const SEASONINGS   = ["House", "Cajun", "Lemon Pepper", "No Seasoning"];
export const BUTTER        = ["With Butter", "No Butter"];
export const COOKING       = ["Steamed", "Deep Fried"];
export const VEGGIES       = ["Broccoli", "Corn", "Potatoes"];
export const BOWL_VEGGIES  = ["Broccoli", "Corn"];
export const BOWL_SAUCES   = ["Island Sauce", "White Sauce"];

export const FISH_TYPES = [
  { label: "Tilapia",     upcharge: 0 },
  { label: "Ocean Perch", upcharge: 0 },
  { label: "Whiting",     upcharge: 0 },
  { label: "Catfish",     upcharge: 2 },
  { label: "Salmon",      upcharge: 2 },
  { label: "Walleye",     upcharge: 2 },
];

export function defaultCustom(item) {
  return {
    size:      item.sizes      ? item.sizes[0].label  : null,
    seasoning: { House: true, Cajun: false, "Lemon Pepper": false, "No Seasoning": false },
    butter:    item.platter    ? "With Butter"        : null,
    cooking:   item.cooking    ? "Steamed"            : null,
    fishType:  item.fishChoice ? FISH_TYPES[0].label  : null,
    fries:     false,
    veg:       { Broccoli: true, Corn: true, Potatoes: true },
    bowlVeg:   item.bowl       ? { Broccoli: true, Corn: true } : null,
    sauce:     item.bowl       ? "Island Sauce"       : null,
    noCombo:   item.noCombo    ? false                : null,
    qty:       1,
    notes:     "",
  };
}

export function unitPriceFor(item, custom) {
  if (custom.noCombo && item.noCombo) {
    const sizes = item.noCombo.sizes;
    const s = sizes.find((x) => x.label === custom.size) || sizes[0];
    return s.price;
  }
  if (item.marketPrice) return 0;
  let base;
  if (item.sizes) {
    const s = item.sizes.find((x) => x.label === custom.size) || item.sizes[0];
    base = s.price;
  } else {
    base = item.price;
  }
  // Fish choice affects price on the fish platters, but not rice bowls — a
  // bowl's fish is included in its flat price regardless of which one you
  // pick, so the premium-fish upcharge only applies when !item.bowl.
  if (item.fishChoice && custom.fishType && !item.bowl) {
    const fish = FISH_TYPES.find((f) => f.label === custom.fishType);
    if (fish) base += fish.upcharge;
  }
  return base;
}

// c.seasoning/bowlVeg/veg are guarded with "&& c.x" before indexing below —
// older order records (from before a given item's shape stabilized) can
// have a custom object missing one of these, and a ticket for that order
// must still render instead of crashing the whole page.
export function customChips(item, c) {
  const chips = [];
  if (c.size)      chips.push(c.size);
  if (item.seasoning !== false && c.seasoning) {
    const realSeasonings = SEASONINGS.filter((s) => s !== 'No Seasoning');
    const picked = realSeasonings.filter((s) => c.seasoning[s]);
    if (picked.length === realSeasonings.length) chips.push('All Seasoning');
    else if (c.seasoning['No Seasoning']) chips.push('No Seasoning');
    else if (picked.length) chips.push(picked.join(' + '));
  }
  if (c.butter)    chips.push(c.butter);
  if (c.cooking)   chips.push(c.cooking);
  if (item.fishChoice && c.fishType) {
    const fish = FISH_TYPES.find((f) => f.label === c.fishType);
    // Matches unitPriceFor: the upcharge only actually applies off a bowl,
    // so don't print a "(+$2)" that didn't get charged.
    chips.push(fish?.upcharge > 0 && !item.bowl ? `${c.fishType} (+$${fish.upcharge})` : c.fishType);
  }
  if (item.bowl && c.bowlVeg) {
    const missingVeg = BOWL_VEGGIES.filter((v) => !c.bowlVeg[v]);
    if (missingVeg.length) chips.push(`No ${missingVeg.join(' & ')}`);
    if (c.sauce)   chips.push(c.sauce);
  } else if (item.noCombo && c.noCombo) {
    chips.push("No Sides");
  } else if (item.platter && c.veg) {
    if (c.fries) {
      chips.push("Fries");
    } else {
      const on = VEGGIES.filter((v) => c.veg[v]);
      if (on.length === 3)     chips.push("All sides");
      else if (on.length === 0) chips.push("No sides");
      else if (on.length === 1) chips.push(`${on[0]} Only`);
      else                      chips.push(on.join(", "));
    }
  }
  return chips;
}

export const money = (n) => "$" + n.toFixed(2);

// A manager-priced line that doesn't correspond to any MENU entry. All the
// item flags that would otherwise trigger customChips() output (seasoning,
// bowl, platter, ...) are explicitly off, so it renders as a clean line with
// just a name and price — no menu-driven customization applies to it.
export function buildCustomLine(uid, name, price, qty) {
  return {
    uid,
    item: {
      id: `custom-${uid}`,
      num: null,
      name,
      desc: '',
      category: 'Custom',
      platter: false,
      cooking: false,
      bowl: false,
      fishChoice: false,
      marketPrice: false,
      seasoning: false,
      sizes: null,
      isCustomItem: true,
    },
    custom: {
      size: null,
      seasoning: { House: false, Cajun: false, "Lemon Pepper": false, "No Seasoning": false },
      butter: null,
      cooking: null,
      fishType: null,
      fries: false,
      veg: { Broccoli: false, Corn: false, Potatoes: false },
      bowlVeg: null,
      sauce: null,
      noCombo: null,
      qty,
      notes: '',
    },
    unit: price,
  };
}

export const isCustomLine = (line) => !!line.item?.isCustomItem;
