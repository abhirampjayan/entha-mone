import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let soundDir: string;

// ---------------------------------------------------------------------------
// WAV generation — produces sine-wave beeps entirely in memory so no binary
// files need to be bundled in the VSIX.
// ---------------------------------------------------------------------------

function generateBeepWav(frequency: number, durationSec: number, sampleRate = 44100): Buffer {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const attack  = Math.min(t / 0.01, 1);
    const release = Math.min((durationSec - t) / 0.05, 1);
    const sample  = Math.sin(2 * Math.PI * frequency * t) * attack * release * 28000;
    buf.writeInt16LE(Math.round(sample), 44 + i * 2);
  }

  return buf;
}

function concatWavs(a: Buffer, b: Buffer): Buffer {
  const pcmA = a.subarray(44);
  const pcmB = b.subarray(44);
  const dataSize = pcmA.length + pcmB.length;
  const header = Buffer.from(a.subarray(0, 44));
  header.writeUInt32LE(36 + dataSize, 4);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmA, pcmB]);
}

function ensureSounds(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const errorPath   = path.join(dir, 'error.wav');
  const successPath = path.join(dir, 'success.wav');

  if (!fs.existsSync(errorPath)) {
    fs.writeFileSync(errorPath, concatWavs(
      generateBeepWav(520, 0.12),
      generateBeepWav(380, 0.18)
    ));
  }

  if (!fs.existsSync(successPath)) {
    fs.writeFileSync(successPath, concatWavs(
      generateBeepWav(440, 0.10),
      generateBeepWav(660, 0.15)
    ));
  }
}

// ---------------------------------------------------------------------------
// Sound playback — cross-platform via CLI utilities
// ---------------------------------------------------------------------------

function playSound(_context: vscode.ExtensionContext, soundType: 'error' | 'success') {
  const config = vscode.workspace.getConfiguration('enthaMone');
  if (!config.get<boolean>('enabled', true)) {
    return;
  }

  const customPath = config.get<string>(`${soundType}Sound`, '').trim();
  let filePath: string;
  if (customPath && fs.existsSync(customPath)) {
    filePath = customPath;
  } else {
    filePath = path.join(soundDir, `${soundType}.wav`);
  }

  const volume = config.get<number>('volume', 1.0);
  let cmd: string;

  switch (process.platform) {
    case 'darwin':
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
// Extension lifecycle
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  soundDir = path.join(context.globalStorageUri.fsPath, 'sounds');
  ensureSounds(soundDir);

  const testCommand = vscode.commands.registerCommand('enthaMone.testSound', () => {
    playSound(context, 'error');
    vscode.window.showInformationMessage('[entha-mone] playing test sound…');
  });

  const toggleCommand = vscode.commands.registerCommand('enthaMone.toggle', () => {
    const cfg = vscode.workspace.getConfiguration('enthaMone');
    const next = !cfg.get<boolean>('enabled', true);
    cfg.update('enabled', next, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      `Entha Mone sounds: ${next ? 'ON 🔊' : 'OFF 🔇'}`
    );
  });

  const onTerminalClose = vscode.window.onDidCloseTerminal((terminal) => {
    const code = terminal.exitStatus?.code;
    if (code !== undefined && code !== 0) {
      playSound(context, 'error');
    }
  });

  const onShellExec = vscode.window.onDidEndTerminalShellExecution((e) => {
    if (e.exitCode !== undefined && e.exitCode !== 0) {
      playSound(context, 'error');
    }
  });

  context.subscriptions.push(
    onTerminalClose,
    onShellExec,
    testCommand,
    toggleCommand
  );
}

export function deactivate() {}
