import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Audio — Web Audio API via a short-lived webview (no exec, no child_process)
// ---------------------------------------------------------------------------

type Tone = { freq: number; dur: number };

const SOUNDS: Record<'error' | 'success', Tone[]> = {
  error:   [{ freq: 520, dur: 0.12 }, { freq: 380, dur: 0.18 }],
  success: [{ freq: 440, dur: 0.10 }, { freq: 660, dur: 0.15 }],
};

function buildHtml(tones: Tone[], volume: number): string {
  const tonesJson = JSON.stringify(tones);
  const vol = Math.max(0, Math.min(1, volume)) * 0.4;
  return `<!DOCTYPE html><html><body><script>
(function(){
  const ctx = new AudioContext();
  ctx.resume().then(() => {
    let t = ctx.currentTime + 0.05;
    for (const {freq, dur} of ${tonesJson}) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(${vol.toFixed(3)}, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
      t += dur + 0.02;
    }
  });
})();
</script></body></html>`;
}

function playSound(context: vscode.ExtensionContext, soundType: 'error' | 'success') {
  const config = vscode.workspace.getConfiguration('enthaMone');
  if (!config.get<boolean>('enabled', true)) {
    return;
  }

  const tones = SOUNDS[soundType];
  const volume = config.get<number>('volume', 1.0);
  const totalMs = tones.reduce((s, t) => s + (t.dur + 0.02) * 1000, 0) + 300;

  const panel = vscode.window.createWebviewPanel(
    'enthaMoneAudio',
    '',
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: false }
  );

  panel.webview.html = buildHtml(tones, volume);

  const timer = setTimeout(() => {
    try { panel.dispose(); } catch { /* already disposed */ }
  }, totalMs);

  panel.onDidDispose(() => clearTimeout(timer), null, context.subscriptions);
}

// ---------------------------------------------------------------------------
// Extension lifecycle
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
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
