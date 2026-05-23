import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let previousErrorCount = 0;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let soundDir: string;

// ---------------------------------------------------------------------------
// WAV generation — produces a pure sine-wave beep entirely in memory so we
// never need bundled audio files. Runs once on first activation.
// ---------------------------------------------------------------------------

function generateBeepWav(
  frequency: number,
  durationSec: number,
  sampleRate = 44100
): Buffer {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);   // PCM
  buf.writeUInt16LE(1, 22);   // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Smooth attack + release envelope to avoid clicks
    const attack  = Math.min(t / 0.01, 1);
    const release = Math.min((durationSec - t) / 0.05, 1);
    const envelope = attack * release;
    const sample = Math.sin(2 * Math.PI * frequency * t) * envelope * 28000;
    buf.writeInt16LE(Math.round(sample), 44 + i * 2);
  }

  return buf;
}

function ensureSounds(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const errorPath   = path.join(dir, 'error.wav');
  const successPath = path.join(dir, 'success.wav');

  if (!fs.existsSync(errorPath)) {
    // Two descending tones for error — classic "uh-oh" feel
    const part1 = generateBeepWav(520, 0.12);
    const part2 = generateBeepWav(380, 0.18);
    // Concatenate the PCM data, fix the RIFF size header
    const combined = concatWavs(part1, part2);
    fs.writeFileSync(errorPath, combined);
  }

  if (!fs.existsSync(successPath)) {
    // Two ascending tones — "all good!"
    const part1 = generateBeepWav(440, 0.10);
    const part2 = generateBeepWav(660, 0.15);
    const combined = concatWavs(part1, part2);
    fs.writeFileSync(successPath, combined);
  }
}

function concatWavs(a: Buffer, b: Buffer): Buffer {
  // Both must have the same fmt (44100 / mono / 16-bit PCM)
  const pcmA = a.slice(44);
  const pcmB = b.slice(44);
  const dataSize = pcmA.length + pcmB.length;
  const header = Buffer.from(a.slice(0, 44));
  header.writeUInt32LE(36 + dataSize, 4);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmA, pcmB]);
}

// ---------------------------------------------------------------------------
// Sound playback — cross-platform via CLI utilities
// ---------------------------------------------------------------------------

function playSound(context: vscode.ExtensionContext, soundType: 'error' | 'success') {
  const config = vscode.workspace.getConfiguration('enthaMone');
  if (!config.get<boolean>('enabled', true)) {
    return;
  }

  const customPath = config.get<string>(`${soundType}Sound`, '').trim();
  let filePath: string;
  if (customPath && fs.existsSync(customPath)) {
    filePath = customPath;
  } else {
    filePath = context.asAbsolutePath(path.join('src', 'entha-mone.wav'));
  }

  const volume = config.get<number>('volume', 1.0);
  let cmd: string;

  switch (process.platform) {
    case 'darwin':
      // afplay accepts -v for volume (0.0–255.0 but 1.0 is full)
      cmd = `afplay -v ${volume} "${filePath}"`;
      break;
    case 'linux':
      cmd = `paplay "${filePath}" 2>/dev/null || aplay "${filePath}" 2>/dev/null`;
      break;
    case 'win32':
      cmd = `powershell -c (New-Object Media.SoundPlayer '${filePath}').PlaySync()`;
      break;
    default:
      return;
  }

  exec(cmd, (err) => {
    if (err) {
      console.error(`[entha-mone] playback failed: ${err.message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Diagnostic counting
// ---------------------------------------------------------------------------

function countErrors(): number {
  let n = 0;
  for (const [, diags] of vscode.languages.getDiagnostics()) {
    n += diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Extension lifecycle
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  soundDir = path.join(context.globalStorageUri.fsPath, 'sounds');
  ensureSounds(soundDir);

  // Seed the count from whatever state already exists when we first load
  previousErrorCount = countErrors();

  const config = vscode.workspace.getConfiguration('enthaMone');
  const getDebounce = () => config.get<number>('debounceMs', 500);

  const onDiagnostics = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const current = countErrors();

      if (current > previousErrorCount) {
        playSound(context, 'error');
      } else if (current === 0 && previousErrorCount > 0) {
        playSound(context, 'success');
      }

      previousErrorCount = current;
    }, getDebounce());
  };

  const toggleCommand = vscode.commands.registerCommand('enthaMone.toggle', () => {
    const cfg = vscode.workspace.getConfiguration('enthaMone');
    const next = !cfg.get<boolean>('enabled', true);
    cfg.update('enabled', next, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      `Entha Mone sounds: ${next ? 'ON 🔊' : 'OFF 🔇'}`
    );
  });

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(onDiagnostics),
    toggleCommand
  );
}

export function deactivate() {
  clearTimeout(debounceTimer);
}
