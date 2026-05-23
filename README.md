# Entha Mone

A VS Code extension that plays a sound when something goes wrong in your terminal — so you don't have to stare at it waiting.

## Features

- Plays an error sound when a terminal process exits with a non-zero code
- Plays an error sound when any shell command (with [shell integration](#shell-integration)) exits non-zero — even if the terminal stays open
- Supports custom sound files (WAV / MP3 / AIFF)
- Toggle sounds on/off without reloading

## Shell Integration

Per-command detection requires VS Code's built-in shell integration. It is enabled by default in most setups. If sounds aren't firing after failed commands, check that shell integration is active:

```
View → Terminal → ✓ Shell Integration
```

Terminal-close detection works without shell integration.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `enthaMone.enabled` | `true` | Enable or disable all sounds |
| `enthaMone.errorSound` | `""` | Absolute path to a custom error sound file. Leave empty to use the built-in beep. |
| `enthaMone.successSound` | `""` | Absolute path to a custom success sound file. Leave empty to use the built-in beep. |
| `enthaMone.volume` | `1.0` | Playback volume (`0.1`–`1.0`). macOS only. |
| `enthaMone.debounceMs` | `500` | Milliseconds to wait after the last diagnostic change before triggering a sound. |

## Commands

| Command | Description |
|---|---|
| `Entha Mone: Toggle sounds on/off` | Globally enable or disable sounds |
| `Entha Mone: Test sound` | Play the error sound immediately to verify your setup |

## Requirements

VS Code 1.93 or later.
