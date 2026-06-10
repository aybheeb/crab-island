export const CATEGORIES = ["Seafood Platters", "Combination Platters", "Rice Bowls", "Sides"];

export const MENU = [
  // ── Seafood Platters ──────────────────────────────────────────
  { id: "1",  num: "#1",  name: "Large Shrimp",    desc: "½ lb. or 1 lb.",         category: "Seafood Platters",    platter: true,  cooking: true,  sizes: [{ label: "½ lb.", price: 16.99 }, { label: "1 lb.", price: 28.99 }] },
  { id: "2",  num: "#2",  name: "Jumbo Shrimp",    desc: "½ lb. or 1 lb.",         category: "Seafood Platters",    platter: true,  cooking: false, sizes: [{ label: "½ lb.", price: 18.99 }, { label: "1 lb.", price: 30.99 }] },
  { id: "3",  num: "#3",  name: "Snow Crab (1 lb.)", desc: "",            category: "Seafood Platters",    platter: true,  cooking: false, price: 38.99,  sizes: null },
  { id: "4",  num: "#4",  name: "King Crab",       desc: "Ask for today's rate",   category: "Seafood Platters",    platter: true,  cooking: false, marketPrice: true, sizes: null },
  { id: "5",  num: "#5",  name: "Tilapia",         desc: "½ lb. or 1 lb. fillet",  category: "Seafood Platters",    platter: true,  cooking: true,  sizes: [{ label: "½ lb.", price: 10.99 }, { label: "1 lb.", price: 17.99 }] },
  { id: "6",  num: "#6",  name: "Ocean Perch",     desc: "½ lb. or 1 lb.",         category: "Seafood Platters",    platter: true,  cooking: true,  sizes: [{ label: "½ lb.", price: 12.99 }, { label: "1 lb.", price: 18.99 }] },
  { id: "7",  num: "#7",  name: "Cat Fish",        desc: "½ lb. or 1 lb.",         category: "Seafood Platters",    platter: true,  cooking: true,  sizes: [{ label: "½ lb.", price: 13.99 }, { label: "1 lb.", price: 19.99 }] },
  { id: "8",  num: "#8",  name: "Whiting",         desc: "½ lb. or 1 lb.",         category: "Seafood Platters",    platter: true,  cooking: true,  sizes: [{ label: "½ lb.", price: 10.99 }, { label: "1 lb.", price: 17.99 }] },
  { id: "9",  num: "#9",  name: "Salmon",          desc: "½ lb. or 1 lb. fillet",  category: "Seafood Platters",    platter: true,  cooking: false, sizes: [{ label: "½ lb.", price: 17.99 }, { label: "1 lb.", price: 24.99 }] },
  { id: "10", num: "#10", name: "Walleye",         desc: "½ lb. or 1 lb.",         category: "Seafood Platters",    platter: true,  cooking: true,  sizes: [{ label: "½ lb.", price: 15.99 }, { label: "1 lb.", price: 22.99 }] },
  { id: "11", num: "#11", name: "Scallops",        desc: "½ lb. or 1 lb.",         category: "Seafood Platters",    platter: true,  cooking: false, sizes: [{ label: "½ lb.", price: 21.99 }, { label: "1 lb.", price: 40.99 }] },
  { id: "12", num: "#12", name: "Mussels (1 lb.)",  desc: "",                       category: "Seafood Platters",    platter: true,  cooking: false, price: 15.99,  sizes: null },
  { id: "13", num: "#13", name: "Crawfish (1 lb.)", desc: "",                       category: "Seafood Platters",    platter: true,  cooking: false, price: 17.99,  sizes: null },

  // ── Combination Platters ──────────────────────────────────────
  { id: "14", num: "#14", name: "Seafood Combo",           desc: "Snow Crab Cluster & ½ lb. Shrimp",                                       category: "Combination Platters", platter: true, cooking: true,  price: 33.99, sizes: null },
  { id: "15", num: "#15", name: "Crab & Lobster Tail",     desc: "Snow Crab Cluster & One Medium Lobster Tail",                            category: "Combination Platters", platter: true, cooking: false, price: 38.99, sizes: null },
  { id: "16", num: "#16", name: "Crab & Fish",             desc: "Snow Crab Cluster & ½ lb. Fish (Catfish/Salmon/Walleye add $2)",         category: "Combination Platters", platter: true, cooking: true,  price: 26.99, sizes: null, fishChoice: true },
  { id: "17", num: "#17", name: "Crab & Crawfish",         desc: "Snow Crab & 1 lb. Crawfish",                                            category: "Combination Platters", platter: true, cooking: false, price: 27.99, sizes: null },
  { id: "21", num: "#21", name: "Shrimp & Lobster Tail",  desc: "½ lb. Shrimp & One Medium Lobster Tail",                                category: "Combination Platters", platter: true, cooking: true,  price: 33.99, sizes: null },
  { id: "22", num: "#22", name: "Shrimp & Fish",           desc: "½ lb. Shrimp & ½ lb. Fish (Catfish/Salmon/Walleye add $2)",             category: "Combination Platters", platter: true, cooking: true,  price: 21.99, sizes: null, fishChoice: true },
  { id: "24", num: "#24", name: "Shrimp & Mussels",        desc: "½ lb. Large Shrimp & 1 lb. Mussels",                                    category: "Combination Platters", platter: true, cooking: true,  price: 24.99, sizes: null },
  { id: "25", num: "#25", name: "Double Seafood",          desc: "1 lb. Snow Crab & 1 lb. Shrimp",                                        category: "Combination Platters", platter: true, cooking: true,  price: 62.99, sizes: null },
  { id: "26", num: "#26", name: "Ultimate Combo",          desc: "Snow Crab, ½ lb. Fish, One Medium Tail, ½ lb. Shrimp (Catfish/Salmon/Walleye add $2)", category: "Combination Platters", platter: true, cooking: true, price: 54.99, sizes: null, fishChoice: true },
  { id: "28", num: "#28", name: "King Combo",              desc: "1 lb. Snow Crab, 1 lb. Large Shrimp, Two Medium Tails",                 category: "Combination Platters", platter: true, cooking: true,  price: 93.99, sizes: null },
  { id: "29", num: "#29", name: "Shrimp, Crab & Lobster", desc: "½ lb. Large Shrimp, Snow Crab, Small Lobster Tail",                     category: "Combination Platters", platter: true, cooking: true,  price: 43.99, sizes: null },

  // ── Rice Bowls ────────────────────────────────────────────────
  { id: "31", num: "#31", name: "Fish Bowl",        desc: "Rice, broccoli or corn, Island or White sauce", category: "Rice Bowls", platter: false, cooking: false, bowl: true, price: 17.99, sizes: null },
  { id: "32", num: "#32", name: "Shrimp Bowl",      desc: "Rice, broccoli or corn, Island or White sauce", category: "Rice Bowls", platter: false, cooking: false, bowl: true, price: 16.99, sizes: null },
  { id: "33", num: "#33", name: "Fish & Shrimp Bowl", desc: "Rice, broccoli or corn, Island or White sauce", category: "Rice Bowls", platter: false, cooking: false, bowl: true, price: 17.99, sizes: null },
  { id: "34", num: "#34", name: "Chicken Bowl",     desc: "Rice, broccoli or corn, Island or White sauce", category: "Rice Bowls", platter: false, cooking: false, bowl: true, price: 14.99, sizes: null },

  // ── Sides ─────────────────────────────────────────────────────
  { id: "s1",  num: null, name: "Crab Leg Cluster (×1)", desc: "",                category: "Sides", platter: false, cooking: false, price: 17.99, sizes: null },
  { id: "s2",  num: null, name: "Lobster Tail",           desc: "Small or Medium", category: "Sides", platter: false, cooking: false, sizes: [{ label: "Small", price: 15.99 }, { label: "Medium", price: 20.99 }] },
  { id: "s3",  num: null, name: "Steamed Veggies", desc: "Fresh steamed",  category: "Sides", platter: false, cooking: false, price: 7.99,  sizes: null },
  { id: "s4",  num: null, name: "Clams (½ lb.)",           desc: "",                category: "Sides", platter: false, cooking: false, price: 7.99,  sizes: null },
  { id: "s5",  num: null, name: "Scallops (4 pcs)",       desc: "",                category: "Sides", platter: false, cooking: false, price: 13.99, sizes: null },
  { id: "s6",  num: null, name: "Oysters (½ dozen)",      desc: "",                category: "Sides", platter: false, cooking: false, price: 13.99, sizes: null },
  { id: "s7",  num: null, name: "Fried Calamari",         desc: "",                category: "Sides", platter: false, cooking: false, price: 13.99, sizes: null },
  { id: "s8",  num: null, name: "Clam Strips",            desc: "",                category: "Sides", platter: false, cooking: false, price: 5.99,  sizes: null },
  { id: "s9",  num: null, name: "Turkey Sausage",         desc: "",                category: "Sides", platter: false, cooking: false, price: 6.99,  sizes: null },
  { id: "s10", num: null, name: "Eggs (×2)",               desc: "",                category: "Sides", platter: false, cooking: false, price: 2.99,  sizes: null },
  { id: "s11", num: null, name: "Garlic Bread (×2 pcs)",  desc: "",                category: "Sides", platter: false, cooking: false, price: 1.99,  sizes: null },
  { id: "s12", num: null, name: "Fries",                  desc: "",                category: "Sides", platter: false, cooking: false, price: 4.99,  sizes: null },
];

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
    seasoning: "House",
    butter:    item.platter    ? "With Butter"        : null,
    cooking:   item.cooking    ? "Steamed"            : null,
    fishType:  item.fishChoice ? FISH_TYPES[0].label  : null,
    fries:     false,
    veg:       { Broccoli: true, Corn: true, Potatoes: true },
    bowlVeg:   item.bowl       ? "Broccoli"           : null,
    sauce:     item.bowl       ? "Island Sauce"       : null,
    qty:       1,
    notes:     "",
  };
}

export function unitPriceFor(item, custom) {
  if (item.marketPrice) return 0;
  let base;
  if (item.sizes) {
    const s = item.sizes.find((x) => x.label === custom.size) || item.sizes[0];
    base = s.price;
  } else {
    base = item.price;
  }
  if (item.fishChoice && custom.fishType) {
    const fish = FISH_TYPES.find((f) => f.label === custom.fishType);
    if (fish) base += fish.upcharge;
  }
  return base;
}

export function customChips(item, c) {
  const chips = [];
  if (c.size)      chips.push(c.size);
  chips.push(c.seasoning);
  if (c.butter)    chips.push(c.butter);
  if (c.cooking)   chips.push(c.cooking);
  if (item.fishChoice && c.fishType) {
    const fish = FISH_TYPES.find((f) => f.label === c.fishType);
    chips.push(fish?.upcharge > 0 ? `${c.fishType} (+$${fish.upcharge})` : c.fishType);
  }
  if (item.bowl) {
    if (c.bowlVeg) chips.push(c.bowlVeg);
    if (c.sauce)   chips.push(c.sauce);
  } else if (item.platter) {
    if (c.fries) {
      chips.push("Fries (all sides)");
    } else {
      const on = VEGGIES.filter((v) => c.veg[v]);
      if (on.length === 3)     chips.push("All sides");
      else if (on.length === 0) chips.push("No sides");
      else                      chips.push(on.join(", "));
    }
  }
  return chips;
}

export const money = (n) => "$" + n.toFixed(2);
