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
const CUT          = () => Buffer.from([GS,  0x56, 0x41, 0x05]);

// Replace Unicode chars (e.g. ½, ×) that won't survive ASCII encoding
function sanitize(str) {
  return String(str ?? '')
    .replace(/½/g, '1/2')
    .replace(/×/g, 'x')
    .replace(/[^\x00-\x7F]/g, '?');
}

const row     = (str) => Buffer.from(sanitize(str) + '\n', 'ascii');
const divider = (w = 42) => row('='.repeat(w));

// ── Kitchen ticket ───────────────────────────────────────────────────────────

function buildKitchenTicketBytes(order) {
  const { orderNo, cust, lines, ts } = order;
  const stamp = new Date(ts).toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  const parts = [
    INIT(),

    // Header
    ALIGN_CENTER(),
    DOUBLE_SIZE(),
    BOLD_ON(),
    row('CRAB ISLAND'),
    NORMAL_SIZE(),
    BOLD_OFF(),
    row('** KITCHEN TICKET **'),
    divider(),

    // Order number — smaller, bold only
    ALIGN_LEFT(),
    BOLD_ON(),
    row(`ORDER ${orderNo}`),
    BOLD_OFF(),

    // Customer name — double size + bold, most visible thing for kitchen staff
    GS_DOUBLE(),
    BOLD_ON(),
    row(cust.name ? cust.name.toUpperCase() : 'WALK-IN'),
    BOLD_OFF(),
    GS_NORMAL(),
  ];

  if (cust.phone) parts.push(row(`Ph: ${cust.phone}`));
  parts.push(row(`Printed: ${stamp}`));
  parts.push(divider());

  for (const l of lines) {
    const prefix = l.item.num ? `${l.item.num} ` : '';

    // Item name: 2x2 + bold
    parts.push(GS_DOUBLE());
    parts.push(BOLD_ON());
    parts.push(row(`${l.custom.qty}x  ${prefix}${l.item.name}`));
    parts.push(BOLD_OFF());
    parts.push(GS_NORMAL());

    // Customizations: double height (not width) so they're readable but smaller than item name
    const chips = customChips(l.item, l.custom);
    if (chips.length > 0 || l.custom.notes) {
      parts.push(GS_TALL());
      for (const chip of chips) parts.push(row(`  >> ${chip}`));
      if (l.custom.notes) parts.push(row(`  NOTE: ${l.custom.notes}`));
      parts.push(GS_NORMAL());
    }

    parts.push(FEED(1));
  }

  parts.push(divider());
  parts.push(ALIGN_CENTER());
  parts.push(row('-- FIRE WHEN READY --'));
  parts.push(FEED(4));
  parts.push(CUT());

  return Buffer.concat(parts);
}

// ── Customer receipt ─────────────────────────────────────────────────────────

function buildCustomerReceiptBytes(order) {
  const { orderNo, cust, lines, total, ts } = order;
  const stamp = new Date(ts).toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  const parts = [
    INIT(),

    // Header
    ALIGN_CENTER(),
    DOUBLE_SIZE(),
    BOLD_ON(),
    row('CRAB ISLAND'),
    NORMAL_SIZE(),
    BOLD_OFF(),
    row('You buy it, we steam it or fry it.'),
    divider(),

    // Order info
    ALIGN_LEFT(),
    BOLD_ON(),
    row(`ORDER ${orderNo}`),
    row(cust.name ? cust.name.toUpperCase() : 'WALK-IN'),
    BOLD_OFF(),
  ];

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
    parts.push(FEED(1));
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
  parts.push(FEED(4));
  parts.push(CUT());

  return Buffer.concat(parts);
}

// ── PowerShell winspool.drv P/Invoke shim ───────────────────────────────────

const PS_RAWPRINT = String.raw`
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

    public static bool SendFile(string printerName, string filePath) {
        byte[] data = System.IO.File.ReadAllBytes(filePath);
        IntPtr ptr = Marshal.AllocCoTaskMem(data.Length);
        Marshal.Copy(data, 0, ptr, data.Length);
        try {
            IntPtr hPrinter;
            if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
            var di = new DOCINFOA { pDocName = "KitchenTicket", pDataType = "RAW" };
            if (StartDocPrinter(hPrinter, 1, di) == 0) { ClosePrinter(hPrinter); return false; }
            StartPagePrinter(hPrinter);
            int written;
            bool ok = WritePrinter(hPrinter, ptr, data.Length, out written);
            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return ok;
        } finally {
            Marshal.FreeCoTaskMem(ptr);
        }
    }
}
"@
$result = [RawPrint]::SendFile($args[0], $args[1])
if ($result) { Write-Output "OK" } else { Write-Error "SendFile returned false"; exit 1 }
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

const PRINTER_NAMES = [
  'EPSON TM-T20 Receipt', // exact Windows printer name on this machine
  'EPSON TM-T20',         // fallback variant
];

export async function printTicket(order) {
  // Kitchen ticket first, customer receipt second — printer cuts between them
  const bytes = Buffer.concat([
    buildKitchenTicketBytes(order),
    buildCustomerReceiptBytes(order),
  ]);
  let lastErr;

  for (const name of PRINTER_NAMES) {
    try {
      sendRawToPrinter(name, bytes);
      console.log(`[printService] Kitchen + receipt printed via "${name}"`);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[printService] Failed with "${name}": ${err.message}`);
    }
  }

  throw new Error(`Print failed on all printer names. Last: ${lastErr.message}`);
}
