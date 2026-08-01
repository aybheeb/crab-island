'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from './Menu';
import { money } from './data';

function emptyForm(categoryId) {
  return {
    categoryId: categoryId || '',
    num: '',
    name: '',
    desc: '',
    pricingMode: 'single', // 'single' | 'sizes' | 'market'
    price: '',
    sizes: [{ label: '', price: '' }],
    hasNoCombo: false,
    noComboSizes: [{ label: '', price: '' }],
    platter: false,
    cooking: false,
    bowl: false,
    fishChoice: false,
    seasoning: true,
    taxable: false,
    active: true,
  };
}

function formFromItem(item) {
  return {
    categoryId: item.categoryId,
    num: item.num || '',
    name: item.name,
    desc: item.desc || '',
    pricingMode: item.marketPrice ? 'market' : (item.sizes ? 'sizes' : 'single'),
    price: item.price != null ? String(item.price) : '',
    sizes: item.sizes && item.sizes.length ? item.sizes.map((s) => ({ label: s.label, price: String(s.price) })) : [{ label: '', price: '' }],
    hasNoCombo: !!item.noComboSizes,
    noComboSizes: item.noComboSizes && item.noComboSizes.length ? item.noComboSizes.map((s) => ({ label: s.label, price: String(s.price) })) : [{ label: '', price: '' }],
    platter: !!item.platter,
    cooking: !!item.cooking,
    bowl: !!item.bowl,
    fishChoice: !!item.fishChoice,
    seasoning: item.seasoning !== false,
    taxable: !!item.taxable,
    active: item.active !== false,
  };
}

function SizeRows({ rows, onChange, label }) {
  const setRow = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => onChange([...rows, { label: '', price: '' }]);
  const removeRow = (i) => onChange(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows);

  return (
    <div className="size-row-group">
      {rows.map((row, i) => (
        <div className="size-row" key={i}>
          <input
            className="text-input"
            placeholder="Label (e.g. ½ lb.)"
            value={row.label}
            onChange={(e) => setRow(i, { label: e.target.value })}
          />
          <input
            className="text-input"
            type="number"
            step="0.01"
            min="0"
            placeholder="Price"
            value={row.price}
            onChange={(e) => setRow(i, { price: e.target.value })}
          />
          <button type="button" className="icon-btn danger" onClick={() => removeRow(i)} aria-label={`Remove ${label} row`}>
            <Icon.trash />
          </button>
        </div>
      ))}
      <button type="button" className="icon-btn" onClick={addRow}><Icon.plus /> Add Size</button>
    </div>
  );
}

// Manager-only menu editor: add/edit/deactivate/delete items, add
// categories. Reachable at /manager/menu (role-gated server-side).
export default function MenuManagementView({ staff }) {
  const router = useRouter();

  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [view, setView] = useState('list'); // 'list' | 'form'
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [toast, setToast] = useState(null);

  const flashToast = (msg, isError = false) => {
    setToast({ msg, id: Date.now(), isError });
    setTimeout(() => setToast(null), isError ? 3500 : 1500);
  };

  const loadData = () => {
    setLoading(true);
    setListError(null);
    Promise.all([
      fetch('/api/menu-items').then((r) => r.json()),
      fetch('/api/menu-categories').then((r) => r.json()),
    ])
      .then(([itemsRes, catsRes]) => {
        if (itemsRes.success) setItems(itemsRes.items);
        if (catsRes.success) setCategories(catsRes.categories);
        if (!itemsRes.success) setListError(itemsRes.error ?? 'Failed to load items');
        else if (!catsRes.success) setListError(catsRes.error ?? 'Failed to load categories');
      })
      .catch((err) => setListError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const handleLogout = () => {
    fetch('/api/staff/logout', { method: 'POST' })
      .then(() => router.refresh())
      .catch((err) => flashToast(`Logout error: ${err.message}`, true));
  };

  const startAdd = (categoryId) => {
    setForm(emptyForm(categoryId));
    setEditingId(null);
    setFormError(null);
    setView('form');
  };

  const startEdit = (item) => {
    setForm(formFromItem(item));
    setEditingId(item.id);
    setFormError(null);
    setView('form');
  };

  const backToList = () => {
    setView('list');
    setEditingId(null);
    setFormError(null);
  };

  const buildPayload = () => {
    const payload = {
      categoryId: form.categoryId,
      num: form.num.trim() || null,
      name: form.name.trim(),
      desc: form.desc.trim(),
      platter: form.platter,
      cooking: form.cooking,
      bowl: form.bowl,
      fishChoice: form.fishChoice,
      marketPrice: form.pricingMode === 'market',
      seasoning: form.seasoning,
      taxable: form.taxable,
      active: form.active,
    };
    if (form.pricingMode === 'sizes') {
      payload.sizes = form.sizes
        .filter((s) => s.label.trim() && s.price !== '')
        .map((s) => ({ label: s.label.trim(), price: parseFloat(s.price) }));
    } else if (form.pricingMode === 'single') {
      payload.price = parseFloat(form.price);
    }
    if (form.hasNoCombo) {
      payload.noComboSizes = form.noComboSizes
        .filter((s) => s.label.trim() && s.price !== '')
        .map((s) => ({ label: s.label.trim(), price: parseFloat(s.price) }));
    }
    return payload;
  };

  const canSubmit = form.categoryId && form.name.trim() && (
    form.pricingMode === 'market' ||
    (form.pricingMode === 'single' && form.price !== '') ||
    (form.pricingMode === 'sizes' && form.sizes.some((s) => s.label.trim() && s.price !== ''))
  );

  const submit = () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setFormError(null);
    const payload = buildPayload();
    const url = editingId ? `/api/menu-items/${editingId}` : '/api/menu-items';
    const method = editingId ? 'PATCH' : 'POST';
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setFormError(d.error ?? 'Failed to save'); setBusy(false); return; }
        flashToast(editingId ? 'Item updated' : 'Item added');
        backToList();
        loadData();
      })
      .catch((err) => { setFormError(err.message); setBusy(false); });
  };

  const toggleActive = (item) => {
    fetch(`/api/menu-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setListError(d.error ?? 'Failed to update'); return; }
        loadData();
      })
      .catch((err) => setListError(err.message));
  };

  const deleteItem = (item) => {
    fetch(`/api/menu-items/${item.id}`, { method: 'DELETE' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setListError(d.error ?? 'Failed to delete'); return; }
        setDeleteConfirmId(null);
        loadData();
      })
      .catch((err) => setListError(err.message));
  };

  const addCategory = () => {
    if (!newCategoryName.trim() || categoryBusy) return;
    setCategoryBusy(true);
    fetch('/api/menu-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategoryName.trim() }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { flashToast(d.error ?? 'Failed to add category', true); setCategoryBusy(false); return; }
        setNewCategoryName('');
        setCategoryBusy(false);
        loadData();
      })
      .catch((err) => { flashToast(err.message, true); setCategoryBusy(false); });
  };

  const itemsByCategory = categories && items
    ? categories.map((cat) => ({ cat, items: items.filter((i) => i.categoryId === cat.id) }))
    : [];

  return (
    <div className="mgr-screen">
      <header className="mgr-hdr">
        <div className="mgr-hdr-inner">
          <Link href="/manager" className="hdr-btn" style={{ marginRight: 12 }}><Icon.x /> Back</Link>
          <h1 className="mgr-title">Menu</h1>
          <div className="hdr-spacer" />
          <div className="hdr-staff">
            <span className="hdr-staff-name">{staff.name}</span>
            <button className="hdr-btn" onClick={handleLogout}>Log Out</button>
          </div>
        </div>
      </header>

      <div className="mgr-menu-body">
        {loading && <div className="po-empty">Loading…</div>}
        {listError && <div className="field-error-msg" style={{ margin: '0 0 16px' }}>{listError}</div>}

        {view === 'list' && !loading && categories && items && (
          <>
            <div className="opt-group">
              <label className="opt-label">Add Category</label>
              <div className="size-row">
                <input
                  className="text-input"
                  placeholder="e.g. Desserts"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
                <button className="btn-primary" style={{ width: 'auto', padding: '0 20px' }} onClick={addCategory} disabled={!newCategoryName.trim() || categoryBusy}>
                  <Icon.plus /> Add
                </button>
              </div>
            </div>

            {itemsByCategory.map(({ cat, items: catItems }) => (
              <div className="mgr-menu-category" key={cat.id}>
                <div className="mgr-menu-category-head">
                  <h3>{cat.name}</h3>
                  <button className="icon-btn" onClick={() => startAdd(cat.id)}><Icon.plus /> Add Item</button>
                </div>
                {catItems.length === 0 ? (
                  <div className="po-empty">No items in this category yet.</div>
                ) : (
                  <div className="po-list">
                    {catItems.map((item) => (
                      <div className="staff-card" key={item.id}>
                        <div className="staff-card-top">
                          <h4>{item.num ? `${item.num} ` : ''}{item.name}</h4>
                          <p>
                            {item.marketPrice ? 'Ask for today\'s rate' : item.sizes
                              ? item.sizes.map((s) => `${s.label} ${money(s.price)}`).join(' · ')
                              : money(item.price)}
                          </p>
                          <span className={`status-badge ${item.active ? 'status-active' : 'status-inactive'}`}>
                            {item.active ? 'Active' : 'Deactivated'}
                          </span>
                        </div>
                        {deleteConfirmId === item.id ? (
                          <div className="staff-card-actions">
                            <span className="field-error-msg" style={{ margin: 0, flex: '1 0 100%' }}>Delete permanently?</span>
                            <button className="icon-btn" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
                            <button className="icon-btn" style={{ borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => deleteItem(item)}>
                              <Icon.trash /> Confirm Delete
                            </button>
                          </div>
                        ) : (
                          <div className="staff-card-actions">
                            <button className="icon-btn" onClick={() => startEdit(item)}><Icon.edit /> Edit</button>
                            <button
                              className="icon-btn"
                              onClick={() => toggleActive(item)}
                              style={item.active ? { borderColor: 'var(--red)', color: 'var(--red)' } : { borderColor: 'var(--ok)', color: 'var(--ok)' }}
                            >
                              {item.active ? <><Icon.x /> Deactivate</> : <><Icon.check /> Reactivate</>}
                            </button>
                            <button className="icon-btn" onClick={() => setDeleteConfirmId(item.id)}><Icon.trash /> Delete</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {view === 'form' && (
          <div className="menu-form">
            <div className="opt-group">
              <label className="opt-label">Category</label>
              <select className="text-input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="" disabled>Choose a category…</option>
                {categories?.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>

            <div className="opt-group">
              <label className="opt-label">Number (optional)</label>
              <input className="text-input" placeholder="e.g. #4" value={form.num} onChange={(e) => setForm({ ...form, num: e.target.value })} />
            </div>

            <div className="opt-group">
              <label className="opt-label">Name</label>
              <input className="text-input" placeholder="Item name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>

            <div className="opt-group">
              <label className="opt-label">Description</label>
              <input className="text-input" placeholder="e.g. ½ lb. or 1 lb." value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
            </div>

            <div className="opt-group">
              <label className="opt-label">Pricing</label>
              <div className="role-toggle" style={{ marginBottom: 12 }}>
                <button type="button" className={"role-toggle-btn" + (form.pricingMode === 'single' ? ' active' : '')} onClick={() => setForm({ ...form, pricingMode: 'single' })}>Single Price</button>
                <button type="button" className={"role-toggle-btn" + (form.pricingMode === 'sizes' ? ' active' : '')} onClick={() => setForm({ ...form, pricingMode: 'sizes' })}>Multiple Sizes</button>
                <button type="button" className={"role-toggle-btn" + (form.pricingMode === 'market' ? ' active' : '')} onClick={() => setForm({ ...form, pricingMode: 'market' })}>Market Price</button>
              </div>
              {form.pricingMode === 'single' && (
                <input
                  className="text-input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Price"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              )}
              {form.pricingMode === 'sizes' && (
                <SizeRows rows={form.sizes} onChange={(sizes) => setForm({ ...form, sizes })} label="size" />
              )}
              {form.pricingMode === 'market' && (
                <p className="po-empty">Cashiers will see &quot;Ask for today&apos;s rate&quot; with no price.</p>
              )}
            </div>

            <div className="opt-group">
              <label className="check-row">
                <input type="checkbox" checked={form.hasNoCombo} onChange={(e) => setForm({ ...form, hasNoCombo: e.target.checked })} />
                Offer a cheaper "no sides" price
              </label>
              {form.hasNoCombo && (
                <div style={{ marginTop: 10 }}>
                  <SizeRows rows={form.noComboSizes} onChange={(noComboSizes) => setForm({ ...form, noComboSizes })} label="no-combo size" />
                </div>
              )}
            </div>

            <div className="opt-group">
              <label className="opt-label">Options</label>
              <div className="check-grid">
                <label className="check-row"><input type="checkbox" checked={form.platter} onChange={(e) => setForm({ ...form, platter: e.target.checked })} /> Platter (sides included)</label>
                <label className="check-row"><input type="checkbox" checked={form.cooking} onChange={(e) => setForm({ ...form, cooking: e.target.checked })} /> Steamed/Fried choice</label>
                <label className="check-row"><input type="checkbox" checked={form.bowl} onChange={(e) => setForm({ ...form, bowl: e.target.checked })} /> Rice bowl</label>
                <label className="check-row"><input type="checkbox" checked={form.fishChoice} onChange={(e) => setForm({ ...form, fishChoice: e.target.checked })} /> Fish substitution choice</label>
                <label className="check-row"><input type="checkbox" checked={form.seasoning} onChange={(e) => setForm({ ...form, seasoning: e.target.checked })} /> Show seasoning options</label>
                <label className="check-row"><input type="checkbox" checked={form.taxable} onChange={(e) => setForm({ ...form, taxable: e.target.checked })} /> Taxable</label>
                {editingId && (
                  <label className="check-row"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
                )}
              </div>
            </div>

            {formError && <div className="field-error-msg">{formError}</div>}
          </div>
        )}
      </div>

      <div className="mgr-menu-foot">
        {view === 'form' && (
          <>
            <button className="btn-ghost" onClick={backToList} disabled={busy}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={!canSubmit || busy}>
              {busy ? 'Saving…' : editingId ? 'Save Changes' : 'Add Item'}
            </button>
          </>
        )}
      </div>

      {toast && (
        <div className={`add-toast${toast.isError ? ' toast-error' : ''}`} key={toast.id}>
          {toast.isError ? <Icon.x /> : <Icon.check />} {toast.msg}
        </div>
      )}
    </div>
  );
}
