import { query } from './db';

// Durable mirror of order history for reporting — NOT the operational
// source of truth (the print-server's local JSON is, and keeps working
// through a Supabase/internet outage). Callers should treat every function
// here as best-effort: catch and log, never let a mirroring failure fail
// the real print-server request that already succeeded.

async function insertOrderItems(orderId, lines) {
  for (const l of lines || []) {
    const qty = l.custom?.qty || 1;
    const unit = l.unit || 0;
    await query(
      `insert into order_items (order_id, item_name, item_num, category, qty, unit_price, line_total)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId, l.item?.name || 'Unknown', l.item?.num || null, l.item?.category || null, qty, unit, unit * qty]
    );
  }
}

export async function recordPendingOrder(order) {
  const { rows } = await query(
    `insert into orders
       (order_no, cust_name, cust_phone, status, total, cashier_id, cashier_name, shift_id, placed_at)
     values ($1, $2, $3, 'pending', $4, $5, $6, $7, $8)
     returning id`,
    [
      order.orderNo,
      order.cust?.name || null,
      order.cust?.phone || null,
      order.total,
      order.cashierId || null,
      order.cashierName || null,
      order.shiftId || null,
      new Date(order.ts),
    ]
  );
  const orderId = rows[0].id;
  await insertOrderItems(orderId, order.lines);
  return orderId;
}

// Replaces a still-pending order's mirrored line items wholesale — simpler
// and less error-prone than diffing old vs. new lines, and cheap since a
// pending order's item count is always small. Only ever called for a
// 'pending' order (the print-server itself refuses to edit anything else),
// so there's no paid/voided history at risk of being overwritten here.
export async function recordOrderEdited(orderNo, { cust, lines, total }) {
  const { rows } = await query(
    `update orders set cust_name = $1, cust_phone = $2, total = $3
     where id = (
       select id from orders where order_no = $4 and status = 'pending'
       order by placed_at desc limit 1
     )
     returning id`,
    [cust?.name || null, cust?.phone || null, total, orderNo]
  );
  if (rows.length === 0) return; // mirror never had this order (e.g. its create-mirror failed) — nothing to fix up
  const orderId = rows[0].id;
  await query('delete from order_items where order_id = $1', [orderId]);
  await insertOrderItems(orderId, lines);
}

// order_no resets daily, so it's never enough alone — always paired with a
// status filter for whichever transition is happening, taking the most
// recent match in the unlikely event more than one exists.
export async function recordOrderPaid(orderNo, { payMethod, changeDue, tenders, total }) {
  await query(
    `update orders set
       status = 'paid', paid_at = now(), pay_method = $1,
       cash = $2, credit = $3, ebt = $4, change_due = $5, total = $6
     where id = (
       select id from orders where order_no = $7 and status = 'pending'
       order by placed_at desc limit 1
     )`,
    [payMethod || null, tenders?.cash || 0, tenders?.credit || 0, tenders?.ebt || 0, changeDue ?? null, total, orderNo]
  );
}

export async function recordOrderVoided(orderNo, { voidedBy, voidedByName, reason }) {
  await query(
    `update orders set
       status = 'voided', voided_at = now(), voided_by = $1, voided_by_name = $2, void_reason = $3
     where id = (
       select id from orders where order_no = $4 and status in ('pending', 'paid')
       order by placed_at desc limit 1
     )`,
    [voidedBy || null, voidedByName || null, reason || null, orderNo]
  );
}

export async function getSalesReport({ from, to }) {
  const { rows } = await query(
    `select
       count(*)::int as order_count,
       coalesce(sum(item_counts.qty), 0)::int as item_count,
       coalesce(sum(o.cash), 0) as cash,
       coalesce(sum(o.credit), 0) as credit,
       coalesce(sum(o.ebt), 0) as ebt,
       coalesce(sum(o.total), 0) as grand_total
     from orders o
     left join (
       select order_id, sum(qty) as qty from order_items group by order_id
     ) item_counts on item_counts.order_id = o.id
     where o.status = 'paid' and o.paid_at >= $1 and o.paid_at < $2`,
    [from, to]
  );
  const row = rows[0];
  return {
    orderCount: row.order_count,
    itemCount: row.item_count,
    cash: Number(row.cash),
    credit: Number(row.credit),
    ebt: Number(row.ebt),
    grandTotal: Number(row.grand_total),
  };
}

export async function getItemBreakdown({ from, to }) {
  const { rows } = await query(
    // max(item_num) rather than grouping by it — a renumbered item over the
    // report period should still roll up as one row, not split in two.
    `select oi.item_name as name, oi.category, max(oi.item_num) as num,
            sum(oi.qty)::int as qty, sum(oi.line_total) as revenue
     from order_items oi
     join orders o on o.id = oi.order_id
     where o.status = 'paid' and o.paid_at >= $1 and o.paid_at < $2
     group by oi.item_name, oi.category
     order by qty desc`,
    [from, to]
  );
  return rows.map((r) => ({ name: r.name, category: r.category, num: r.num, qty: r.qty, revenue: Number(r.revenue) }));
}

export async function getCategoryBreakdown({ from, to }) {
  const { rows } = await query(
    `select oi.category, sum(oi.qty)::int as qty, sum(oi.line_total) as revenue
     from order_items oi
     join orders o on o.id = oi.order_id
     where o.status = 'paid' and o.paid_at >= $1 and o.paid_at < $2
     group by oi.category
     order by qty desc`,
    [from, to]
  );
  return rows.map((r) => ({ category: r.category, qty: r.qty, revenue: Number(r.revenue) }));
}

// Raw per-order (paid_at, total) pairs for the trend chart — bucketed into
// calendar days client-side (ReportsView.jsx) rather than here, so "day"
// means the manager's own local day, not a UTC day that could split a
// single evening's sales across two bars.
export async function getDailyTotals({ from, to }) {
  const { rows } = await query(
    `select paid_at, total from orders where status = 'paid' and paid_at >= $1 and paid_at < $2 order by paid_at`,
    [from, to]
  );
  return rows.map((r) => ({ paidAt: r.paid_at, total: Number(r.total) }));
}
