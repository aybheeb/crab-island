import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { customChips, money } from '../../components/data.js';

// ── ESC/POS byte builders ────────────────────────────────────────────────────

const ESC = 0x1b;
const GS  = 0x1d;

const INIT         = () => Buffer.from([ESC, 0x40]);
const ALIGN_LEFT   = () => Buffer.from([ESC, 0x61, 0x00]);
const ALIGN_CENTER = () => Buffer.from([ESC, 0x61, 0x01]);
const BOLD_ON      = () => Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF     = () => Buffer.from([ESC, 0x45, 0x00]);
const DOUBLE_SIZE  = () => Buffer.from([ESC, 0x21, 0x30]); // ESC ! — used for header
const NORMAL_SIZE  = () => Buffer.from([ESC, 0x21, 0x00]);
const GS_DOUBLE    = () => Buffer.from([GS,  0x21, 0x11]); // GS ! 2x height + 2x width
const GS_TALL      = () => Buffer.from([GS,  0x21, 0x10]); // GS ! 2x height, 1x width
const GS_NORMAL    = () => Buffer.from([GS,  0x21, 0x00]);
const FEED         = (n = 1) => Buffer.from([ESC, 0x64, n]);
const CUT          = () => Buffer.from([GS,  0x56, 0x41, 0x00]);
// ESC p m t1 t2 — Generate Pulse on drawer pin; m=0 → pin 2, m=1 → pin 5; t1=ON time, t2=OFF time (×2ms)
const DRAWER_KICK_PIN2 = () => Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]);
const DRAWER_KICK_PIN5 = () => Buffer.from([ESC, 0x70, 0x01, 0x19, 0xfa]);
// Star Line Mode drawer kick-out variants — differs by firmware, so both are sent.
const DRAWER_KICK_STAR_1 = () => Buffer.from([ESC, 0x07]);
const DRAWER_KICK_STAR_2 = () => Buffer.from([ESC, 0x1c, 0x07]);

// Replace Unicode chars (e.g. ½, ×) that won't survive ASCII encoding
function sanitize(str) {
  return String(str ?? '')
    .replace(/½/g, '1/2')
    .replace(/×/g, 'x')
    .replace(/[^\x00-\x7F]/g, '?');
}

const row     = (str) => Buffer.from(sanitize(str) + '\n', 'ascii');
const divider = (w = 42) => row('='.repeat(w));

// ── Printer dialect profiles ────────────────────────────────────────────────
// Which formatting/cut/drawer-kick commands are actually safe depends on the physical
// printer model doing the printing, not which logical role (kitchen/cashier) it's
// serving. Profiles are picked by matching the printer name currently assigned to a
// role, so swapping which physical printer serves which role is just an env var
// change — the correct workarounds follow the hardware automatically.
const PRINTER_PROFILES = {
  epson: {
    bigText: true,
    lineSpacer: () => FEED(1),
    trailingCut: () => [FEED(4), CUT()],
    drawerKick: () => Buffer.concat([DRAWER_KICK_PIN2(), DRAWER_KICK_PIN5()]),
  },
  star: {
    bigText: false, // ESC ! / GS ! size commands leak their trailing parameter byte as literal text on this unit
    // A FEED command followed by more print data in the same job triggers an immediate
    // physical cut on this unit (confirmed by testing) — plain blank rows are ordinary
    // print data and don't trigger it.
    lineSpacer: () => row(''),
    // GS V (CUT) doesn't execute as a real cut here either — it just leaks its own bytes
    // as literal text ("VA"). Blank lines give manual tear-off margin instead. The count
    // is tuned empirically for this printer's head-to-tear-bar distance.
    trailingCut: () => Array.from({ length: 9 }, () => row('')),
    drawerKick: () => Buffer.concat([
      DRAWER_KICK_PIN2(), DRAWER_KICK_PIN5(), DRAWER_KICK_STAR_1(), DRAWER_KICK_STAR_2(),
    ]),
  },
};

function detectProfile(printerNames) {
  const first = (printerNames[0] || '').toLowerCase();
  if (first.includes('star'))  return PRINTER_PROFILES.star;
  if (first.includes('epson')) return PRINTER_PROFILES.epson;
  // Unrecognized hardware — default to the conservative profile (no size commands, no
  // real cut) rather than risk garbled text or a cut command that just leaks garbage.
  return PRINTER_PROFILES.star;
}

// ── Kitchen ticket ───────────────────────────────────────────────────────────

function buildKitchenTicketBytes(order, profile) {
  const { orderNo, cust, lines, ts } = order;
  const stamp = new Date(ts).toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  const parts = [INIT(), ALIGN_CENTER()];

  // Header
  if (profile.bigText) parts.push(DOUBLE_SIZE());
  parts.push(BOLD_ON());
  parts.push(row('CRAB ISLAND'));
  if (profile.bigText) parts.push(NORMAL_SIZE());
  parts.push(BOLD_OFF());
  parts.push(row('** KITCHEN TICKET **'));
  parts.push(divider());

  // Order number — bold only
  parts.push(ALIGN_LEFT());
  parts.push(BOLD_ON());
  parts.push(row(`ORDER ${orderNo}`));
  parts.push(BOLD_OFF());

  // Customer name — most visible thing for kitchen staff
  if (profile.bigText) parts.push(GS_DOUBLE());
  parts.push(BOLD_ON());
  parts.push(row(cust.name ? cust.name.toUpperCase() : 'WALK-IN'));
  parts.push(BOLD_OFF());
  if (profile.bigText) parts.push(GS_NORMAL());

  if (cust.phone) parts.push(row(`Ph: ${cust.phone}`));
  parts.push(row(`Printed: ${stamp}`));
  parts.push(divider());

  for (const l of lines) {
    const prefix = l.item.num ? `${l.item.num} ` : '';

    // Item name
    if (profile.bigText) parts.push(GS_DOUBLE());
    parts.push(BOLD_ON());
    parts.push(row(`${l.custom.qty}x  ${prefix}${l.item.name}`));
    parts.push(BOLD_OFF());
    if (profile.bigText) parts.push(GS_NORMAL());

    // Customizations
    const chips = customChips(l.item, l.custom);
    if (chips.length > 0 || l.custom.notes) {
      if (profile.bigText) parts.push(GS_TALL());
      for (const chip of chips) parts.push(row(`  >> ${chip}`));
      if (l.custom.notes) parts.push(row(`  NOTE: ${l.custom.notes}`));
      if (profile.bigText) parts.push(GS_NORMAL());
    }

    parts.push(profile.lineSpacer());
  }

  parts.push(divider());
  parts.push(ALIGN_CENTER());
  parts.push(row('-- FIRE WHEN READY --'));
  parts.push(...profile.trailingCut());

  return Buffer.concat(parts);
}

// ── Cashier receipt (merchant / customer copy) ──────────────────────────────

function buildReceiptBytes(order, copyLabel, profile) {
  const { orderNo, cust, lines, total, ts } = order;
  const stamp = new Date(ts).toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  const parts = [INIT(), ALIGN_CENTER()];

  // Header
  if (profile.bigText) parts.push(DOUBLE_SIZE());
  parts.push(BOLD_ON());
  parts.push(row('CRAB ISLAND'));
  if (profile.bigText) parts.push(NORMAL_SIZE());
  parts.push(BOLD_OFF());
  parts.push(row('You buy it, we steam it or fry it.'));
  parts.push(BOLD_ON());
  parts.push(row(`*** ${copyLabel} ***`));
  parts.push(BOLD_OFF());
  parts.push(divider());

  // Order info
  parts.push(ALIGN_LEFT());
  parts.push(BOLD_ON());
  parts.push(row(`ORDER ${orderNo}`));
  parts.push(row(cust.name ? cust.name.toUpperCase() : 'WALK-IN'));
  parts.push(BOLD_OFF());

  if (cust.phone) parts.push(row(`Ph: ${cust.phone}`));
  parts.push(row(stamp));
  parts.push(divider());

  // Items with prices
  for (const l of lines) {
    const prefix   = l.item.num ? `${l.item.num} ` : '';
    const itemLine = `${l.custom.qty}x  ${prefix}${l.item.name}`;
    const priceStr = l.item.marketPrice ? 'MKT' : money(l.unit * l.custom.qty);
    const padLen   = Math.max(1, 42 - itemLine.length - priceStr.length);

    parts.push(BOLD_ON());
    parts.push(row(itemLine + ' '.repeat(padLen) + priceStr));
    parts.push(BOLD_OFF());

    const chips = customChips(l.item, l.custom);
    for (const chip of chips) parts.push(row(`    ${chip}`));
    if (l.custom.notes) parts.push(row(`    "${l.custom.notes}"`));
    parts.push(profile.lineSpacer());
  }

  // Total
  const totalStr = money(total);
  const totalPad = Math.max(0, 42 - 'TOTAL:'.length - totalStr.length);
  parts.push(divider());
  parts.push(BOLD_ON());
  parts.push(row(`TOTAL:${' '.repeat(totalPad)}${totalStr}`));
  parts.push(BOLD_OFF());
  parts.push(divider());

  parts.push(ALIGN_CENTER());
  parts.push(row('Thank you! Enjoy your seafood.'));

  return Buffer.concat(parts);
}

// ── PowerShell winspool.drv P/Invoke shim ───────────────────────────────────

const PS_RAWPRINT = String.raw`
param([string]$PrinterName, [string]$FilePath)

$available = @(Get-Printer | Select-Object -ExpandProperty Name)
if ($available -notcontains $PrinterName) {
  Write-Error "Printer '$PrinterName' not found. Available printers: $($available -join ', ')"
  exit 1
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
}

public class RawPrint {
    [DllImport("winspool.drv", EntryPoint="OpenPrinterA",    SetLastError=true)]
    public static extern bool OpenPrinter(string name, out IntPtr hPrinter, IntPtr pDefault);
    [DllImport("winspool.drv", EntryPoint="ClosePrinter")]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", SetLastError=true)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.drv", EntryPoint="EndDocPrinter")]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="StartPagePrinter")]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="EndPagePrinter")]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="WritePrinter",    SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    // Throws with the Win32 error code/message on any failed step, instead of silently returning false —
    // makes "why didn't this print" diagnosable from the caller's stderr without attaching a debugger.
    public static void SendFile(string printerName, string filePath) {
        byte[] data = System.IO.File.ReadAllBytes(filePath);
        IntPtr ptr = Marshal.AllocCoTaskMem(data.Length);
        Marshal.Copy(data, 0, ptr, data.Length);
        try {
            IntPtr hPrinter;
            if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
                throw new InvalidOperationException("OpenPrinter failed: " + new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()).Message);
            try {
                var di = new DOCINFOA { pDocName = "KitchenTicket", pDataType = "RAW" };
                if (StartDocPrinter(hPrinter, 1, di) == 0)
                    throw new InvalidOperationException("StartDocPrinter failed: " + new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()).Message);
                try {
                    StartPagePrinter(hPrinter);
                    int written;
                    bool ok = WritePrinter(hPrinter, ptr, data.Length, out written);
                    if (!ok)
                        throw new InvalidOperationException("WritePrinter failed: " + new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()).Message);
                    if (written != data.Length)
                        throw new InvalidOperationException("WritePrinter wrote " + written + " of " + data.Length + " bytes");
                    EndPagePrinter(hPrinter);
                    EndDocPrinter(hPrinter);
                } catch {
                    EndPagePrinter(hPrinter);
                    EndDocPrinter(hPrinter);
                    throw;
                }
            } finally {
                ClosePrinter(hPrinter);
            }
        } finally {
            Marshal.FreeCoTaskMem(ptr);
        }
    }
}
"@

try {
  [RawPrint]::SendFile($PrinterName, $FilePath)
  Write-Output "OK"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`;

function sendRawToPrinter(printerName, dataBuffer) {
  const id     = Date.now();
  const binFile = join(tmpdir(), `ci_ticket_${id}.bin`);
  const psFile  = join(tmpdir(), `ci_rawprint_${id}.ps1`);

  try {
    writeFileSync(binFile, dataBuffer);
    writeFileSync(psFile, PS_RAWPRINT, 'utf8');

    console.log(`[printService] ${dataBuffer.length}b → "${printerName}"`);
    const out = execSync(
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psFile}" "${printerName}" "${binFile}"`,
      { encoding: 'utf8', timeout: 15000 }
    ).trim();

    if (out !== 'OK') throw new Error(`Unexpected PS output: ${out}`);
  } finally {
    try { unlinkSync(binFile); } catch (_) {}
    try { unlinkSync(psFile);  } catch (_) {}
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

// Comma-separated list of exact Windows printer names to try, in order.
// Override via env so a printer rename/reinstall doesn't require a code change.
function namesFromEnv(envVar, fallback) {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// Kitchen printer — fires the kitchen ticket only.
const KITCHEN_PRINTER_NAMES = namesFromEnv('KITCHEN_PRINTER_NAMES', [
  'EPSON TM-T20 Receipt', // exact Windows printer name on this machine
  'EPSON TM-T20',         // fallback variant
]);

// Cashier printer — fires merchant/customer receipt copies and the cash drawer kick.
const CASHIER_PRINTER_NAMES = namesFromEnv('CASHIER_PRINTER_NAMES', [
  'Star TSP650II Cutter', // exact Windows printer name on this machine
]);

// Picked from the printer names above — swapping which physical printer serves which
// role (env var change) automatically applies the right formatting/cut/drawer workarounds.
const KITCHEN_PROFILE  = detectProfile(KITCHEN_PRINTER_NAMES);
const CASHIER_PROFILE  = detectProfile(CASHIER_PRINTER_NAMES);

function sendToFirstAvailable(names, bytes, jobLabel) {
  let lastErr;
  for (const name of names) {
    try {
      sendRawToPrinter(name, bytes);
      console.log(`[printService] ${jobLabel} printed via "${name}"`);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[printService] ${jobLabel} failed with "${name}": ${err.message}`);
    }
  }
  throw new Error(`${jobLabel} failed on all printer names. Last: ${lastErr.message}`);
}

export async function openCashDrawer() {
  sendToFirstAvailable(CASHIER_PRINTER_NAMES, CASHIER_PROFILE.drawerKick(), 'Cash drawer kick');
}

export async function printTicket(order) {
  const errors = [];

  try {
    // Cashier receipt first — each print is a blocking call (PowerShell spawn + spool
    // wait), so whichever prints first finishes first. Cashier goes first so the
    // customer isn't left waiting at the register for the kitchen ticket to finish.
    // Merchant copy only, by default — customer copy is printed on demand via
    // printCustomerReceipt(), since most customers decline a printed receipt.
    const merchantBytes = Buffer.concat([
      buildReceiptBytes(order, 'MERCHANT COPY', CASHIER_PROFILE),
      ...CASHIER_PROFILE.trailingCut(),
    ]);
    sendToFirstAvailable(CASHIER_PRINTER_NAMES, merchantBytes, 'Merchant receipt');
  } catch (err) {
    errors.push(err.message);
  }

  try {
    sendToFirstAvailable(
      KITCHEN_PRINTER_NAMES,
      buildKitchenTicketBytes(order, KITCHEN_PROFILE),
      'Kitchen ticket'
    );
  } catch (err) {
    errors.push(err.message);
  }

  if (errors.length > 0) throw new Error(errors.join(' | '));
}

// Prints just the customer copy, on demand — for when a customer asks for a receipt
// after the fact (merchant copy has already printed via printTicket()).
export async function printCustomerReceipt(order) {
  const bytes = Buffer.concat([
    buildReceiptBytes(order, 'CUSTOMER COPY', CASHIER_PROFILE),
    ...CASHIER_PROFILE.trailingCut(),
  ]);
  sendToFirstAvailable(CASHIER_PRINTER_NAMES, bytes, 'Customer receipt');
}
