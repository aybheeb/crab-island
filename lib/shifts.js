import { query } from './db';

// A cashier can only have one open shift at a time — reuse it if one's
// already open (e.g. the tab was closed without clocking out and they're
// logging back in) rather than stacking a second open shift.
export async function openShiftFor(staffId) {
  const existing = await query(
    'select id from shifts where staff_id = $1 and clocked_out_at is null order by clocked_in_at desc limit 1',
    [staffId]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const created = await query(
    'insert into shifts (staff_id) values ($1) returning id',
    [staffId]
  );
  return created.rows[0].id;
}

export async function closeShift(shiftId) {
  if (!shiftId) return;
  await query('update shifts set clocked_out_at = now() where id = $1 and clocked_out_at is null', [shiftId]);
}

export async function isShiftOpen(shiftId) {
  if (!shiftId) return false;
  const { rows } = await query('select 1 from shifts where id = $1 and clocked_out_at is null', [shiftId]);
  return rows.length > 0;
}
