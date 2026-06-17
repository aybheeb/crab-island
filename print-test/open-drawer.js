/**
 * Standalone cash-drawer kick test.
 * Run: node print-test/open-drawer.js
 *
 * Sends ESC p 0 0x19 0xFA (Generate Pulse, DK1 pin, 50ms ON / 500ms OFF)
 * through the same winspool.drv raw-print path used for tickets.
 */

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");
const os   = require("os");

// ESC p m t1 t2  — Generate Pulse
//   m  = 0x00  → DK1 pin (the standard cash-drawer port)
//   t1 = 0x19  → ON  time: 25 × 2ms = 50ms
//   t2 = 0xFA  → OFF time: 250 × 2ms = 500ms
const DRAWER_KICK = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

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
    [DllImport("winspool.drv", EntryPoint="OpenPrinterA",     SetLastError=true)]
    public static extern bool OpenPrinter(string name, out IntPtr hPrinter, IntPtr pDefault);
    [DllImport("winspool.drv", EntryPoint="ClosePrinter")]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", SetLastError=true)]
    public static extern int  StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.drv", EntryPoint="EndDocPrinter")]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="StartPagePrinter")]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="EndPagePrinter")]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="WritePrinter",     SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendFile(string printerName, string filePath) {
        byte[] data = System.IO.File.ReadAllBytes(filePath);
        IntPtr ptr  = Marshal.AllocCoTaskMem(data.Length);
        Marshal.Copy(data, 0, ptr, data.Length);
        try {
            IntPtr hPrinter;
            if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
            var di = new DOCINFOA { pDocName = "DrawerKick", pDataType = "RAW" };
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

const PRINTER_NAMES = [
  "EPSON TM-T20 Receipt",
  "EPSON TM-T20",
];

function sendRaw(printerName, buf) {
  const binFile = path.join(os.tmpdir(), `drawer_kick_${Date.now()}.bin`);
  const psFile  = path.join(os.tmpdir(), `drawer_kick_${Date.now()}.ps1`);
  try {
    fs.writeFileSync(binFile, buf);
    fs.writeFileSync(psFile,  PS_RAW_PRINT, "utf8");
    const out = execSync(
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psFile}" "${printerName}" "${binFile}"`,
      { encoding: "utf8", timeout: 15000 }
    ).trim();
    if (out !== "OK") throw new Error(`Unexpected PS output: ${out}`);
  } finally {
    try { fs.unlinkSync(binFile); } catch (_) {}
    try { fs.unlinkSync(psFile);  } catch (_) {}
  }
}

(async () => {
  console.log("[INFO] Sending drawer-kick command (ESC p 0 0x19 0xFA)...");
  for (let i = 0; i < PRINTER_NAMES.length; i++) {
    const name = PRINTER_NAMES[i];
    try {
      sendRaw(name, DRAWER_KICK);
      console.log(`[SUCCESS] Drawer kicked via "${name}" — did it pop?`);
      return;
    } catch (err) {
      console.error(`[ERROR] Failed with "${name}": ${err.message}`);
      if (i < PRINTER_NAMES.length - 1) {
        console.log("[INFO] Trying next printer name...");
      } else {
        console.error("[FATAL] All printer names failed. Verify with:");
        console.error('  powershell -Command "Get-Printer | Select-Object Name"');
        process.exit(1);
      }
    }
  }
})();
