import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let soundDir: string;

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

  console.log(`[entha-mone] playing: ${filePath}`);
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

  // Play error sound when a terminal closes with a non-zero exit code
  const onTerminalClose = vscode.window.onDidCloseTerminal((terminal) => {
    const code = terminal.exitStatus?.code;
    if (code !== undefined && code !== 0) {
      playSound(context, 'error');
    }
  });

  // Play error sound when a shell command (with shell integration) exits non-zero
  const onShellExec = vscode.window.onDidEndTerminalShellExecution((e) => {
    console.log(`[entha-mone] shell exec ended, exit code: ${e.exitCode}`);
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
