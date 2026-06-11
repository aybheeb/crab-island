/**
 * Sends a kitchen ticket to the Epson TM-T20 via raw ESC/POS bytes.
 * No native Node bindings required — uses a PowerShell P/Invoke shim
 * to call winspool.drv directly.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ── ESC/POS byte helpers ─────────────────────────────────────────────────────

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

function init()           { return Buffer.from([ESC, 0x40]); }
function alignLeft()      { return Buffer.from([ESC, 0x61, 0x00]); }
function alignCenter()    { return Buffer.from([ESC, 0x61, 0x01]); }
function boldOn()         { return Buffer.from([ESC, 0x45, 0x01]); }
function boldOff()        { return Buffer.from([ESC, 0x45, 0x00]); }
function doubleSize()     { return Buffer.from([ESC, 0x21, 0x30]); } // double width + height
function normalSize()     { return Buffer.from([ESC, 0x21, 0x00]); }
function feed(n = 1)      { return Buffer.from([ESC, 0x64, n]); }
function cut()            { return Buffer.from([GS,  0x56, 0x41, 0x05]); } // partial cut + feed 5

function text(str) {
  return Buffer.from(str + "\n", "ascii");
}

function divider(char = "-", width = 42) {
  return text(char.repeat(width));
}

function formatTimestamp() {
  return new Date().toLocaleString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

// ── Build ticket bytes ────────────────────────────────────────────────────────

function buildKitchenTicket() {
  const parts = [];

  parts.push(init());

  // Header
  parts.push(alignCenter());
  parts.push(doubleSize());
  parts.push(boldOn());
  parts.push(text("CRAB ISLAND"));
  parts.push(normalSize());
  parts.push(boldOff());
  parts.push(text("** KITCHEN TICKET **"));
  parts.push(divider());

  // Order info
  parts.push(alignLeft());
  parts.push(boldOn());
  parts.push(text("ORDER #1042       TABLE: 7"));
  parts.push(boldOff());
  parts.push(text(`Printed: ${formatTimestamp()}`));
  parts.push(divider());

  // Items
  const items = [
    { qty: 2, name: "Shrimp Po Boy",       mods: ["Extra remoulade", "No lettuce"] },
    { qty: 1, name: "Crab Cake Platter",   mods: ["Sub coleslaw for fries", "Sauce on the side"] },
    { qty: 3, name: "Fish Tacos",          mods: ["Extra pico", "Corn tortilla"] },
    { qty: 1, name: "Lobster Bisque",      mods: [] },
  ];

  for (const item of items) {
    parts.push(boldOn());
    parts.push(text(`${item.qty}x  ${item.name}`));
    parts.push(boldOff());
    for (const mod of item.mods) {
      parts.push(text(`    >> ${mod}`));
    }
  }

  parts.push(divider());

  // Footer
  parts.push(alignCenter());
  parts.push(text("-- FIRE WHEN READY --"));
  parts.push(feed(4));
  parts.push(cut());

  return Buffer.concat(parts);
}

// ── PowerShell raw-print helper ───────────────────────────────────────────────

const PS_RAW_PRINT = String.raw`
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
    [DllImport("winspool.drv", EntryPoint="OpenPrinterA", SetLastError=true)]
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

    [DllImport("winspool.drv", EntryPoint="WritePrinter", SetLastError=true)]
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
  const tmpFile = path.join(os.tmpdir(), `ticket_${Date.now()}.bin`);
  const psFile  = path.join(os.tmpdir(), `rawprint_${Date.now()}.ps1`);

  try {
    fs.writeFileSync(tmpFile, dataBuffer);
    fs.writeFileSync(psFile, PS_RAW_PRINT, "utf8");

    console.log(`[INFO] Temp ESC/POS file: ${tmpFile} (${dataBuffer.length} bytes)`);
    console.log(`[INFO] Sending to printer: "${printerName}"`);

    const result = execSync(
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psFile}" "${printerName}" "${tmpFile}"`,
      { encoding: "utf8", timeout: 15000 }
    ).trim();

    if (result === "OK") {
      console.log("[SUCCESS] Kitchen ticket sent to printer.");
    } else {
      throw new Error(`Unexpected PS output: ${result}`);
    }
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    try { fs.unlinkSync(psFile);  } catch (_) {}
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PRINTER_NAMES = [
  "EPSON TM-T20 Receipt",   // exact Windows printer name
  "EPSON TM-T20",           // fallback — shorter name variant
];

(async () => {
  console.log("[INFO] Building ESC/POS kitchen ticket...");
  const ticket = buildKitchenTicket();
  console.log(`[INFO] Ticket size: ${ticket.length} bytes`);

  for (let i = 0; i < PRINTER_NAMES.length; i++) {
    const name = PRINTER_NAMES[i];
    try {
      sendRawToPrinter(name, ticket);
      return;
    } catch (err) {
      console.error(`[ERROR] Failed with printer name "${name}": ${err.message}`);
      if (i < PRINTER_NAMES.length - 1) {
        console.log("[INFO] Trying next printer name...");
      } else {
        console.error("[FATAL] All printer names exhausted. Check that:");
        console.error("  1. The printer is powered on and online");
        console.error("  2. The printer name matches exactly what is in Printers & Scanners");
        console.error("     (Run: Get-Printer | Select-Object Name in PowerShell)");
        process.exit(1);
      }
    }
  }
})();
