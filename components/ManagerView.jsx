'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from './Menu';
import { DailyReportModal } from './Order';
import StaffManagementModal from './StaffManagementModal';

// Manager dashboard shell — reachable at /manager (role-gated server-side by
// app/manager/page.jsx). Daily Report + Close Day live here now instead of
// on the cashier register header. More manager-only tiles (menu editing)
// land here as their own features ship.
export default function ManagerView({ staff }) {
  const router = useRouter();

  const [showReport, setShowReport] = useState(false);
  const [showStaff, setShowStaff] = useState(false);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [closingDay, setClosingDay] = useState(false);
  const [toast, setToast] = useState(null);

  const flashToast = (msg, isError = false) => {
    setToast({ msg, id: Date.now(), isError });
    setTimeout(() => setToast(null), isError ? 3500 : 1500);
  };

  const handleLogout = () => {
    fetch('/api/staff/logout', { method: 'POST' })
      .then(() => router.refresh())
      .catch((err) => flashToast(`Logout error: ${err.message}`, true));
  };

  const fetchReport = () => {
    setReportLoading(true);
    setReportError(null);
    fetch('/api/daily-report')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setReport(d.report);
        else setReportError(d.error ?? 'Failed to load report');
      })
      .catch((err) => setReportError(err.message))
      .finally(() => setReportLoading(false));
  };

  const openReport = () => { setShowReport(true); fetchReport(); };

  // On success, the register's own page (app/page.jsx -> App.jsx) will pick
  // up the reset day the next time it mounts/reloads, via its existing
  // GET /api/orders fetch — no state to hand off here.
  const closeDay = () => {
    setClosingDay(true);
    fetch('/api/close-day', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setShowReport(false);
          flashToast('Day closed — report printed');
        } else {
          setReportError(d.error ?? 'Failed to close day');
        }
      })
      .catch((err) => setReportError(err.message))
      .finally(() => setClosingDay(false));
  };

  return (
    <div className="mgr-screen">
      <header className="mgr-hdr">
        <div className="mgr-hdr-inner">
          <h1 className="mgr-title">Manager</h1>
          <div className="hdr-spacer" />
          <div className="hdr-staff">
            <span className="hdr-staff-name">{staff.name}</span>
            <button className="hdr-btn" onClick={handleLogout}>Log Out</button>
          </div>
        </div>
      </header>

      <div className="mgr-body">
        <Link href="/" className="mgr-tile">
          <Icon.receipt />
          <span>Go to Register</span>
        </Link>
        <button className="mgr-tile" onClick={openReport}>
          <Icon.print />
          <span>Daily Report</span>
        </button>
        <button className="mgr-tile" onClick={() => setShowStaff(true)}>
          <Icon.users />
          <span>Manage Staff</span>
        </button>
        <Link href="/manager/menu" className="mgr-tile">
          <Icon.list />
          <span>Menu</span>
        </Link>
        <Link href="/manager/reports" className="mgr-tile">
          <Icon.chart />
          <span>Reports</span>
        </Link>
      </div>

      {showReport && (
        <DailyReportModal
          report={report}
          loading={reportLoading}
          error={reportError}
          closing={closingDay}
          onClose={() => setShowReport(false)}
          onCloseDay={closeDay}
        />
      )}

      {showStaff && <StaffManagementModal onClose={() => setShowStaff(false)} />}

      {toast && (
        <div className={`add-toast${toast.isError ? ' toast-error' : ''}`} key={toast.id}>
          {toast.isError ? <Icon.x /> : <Icon.check />} {toast.msg}
        </div>
      )}
    </div>
  );
}
