# Airgap

Cut internet access per app, on rooted Android. Magisk / KernelSU / APatch module.

Blocked apps are rejected at the kernel level with `iptables` UID owner matching, so there is
no VPN slot consumed, no battery-draining userspace proxy, and nothing for an app to detect.

## Requirements

- Magisk, KernelSU or APatch
- A kernel with `xt_owner` (`-m owner`) support — essentially every Android kernel
- [KsuWebUI](https://github.com/5ec1cff/KsuWebUIStandalone) or [MMRL](https://github.com/DerGoogler/MMRL) for the app picker

## Install

Flash `airgap-x.y.zip` in your root manager and reboot. Open the module's **Action** / **WebUI**
entry to pick apps.

## WebUI

- Filter by **All / User / System / Blocked**
- Sort by name, blocked-first, user-first, system-first or UID
- Search, with the full package name and UID on every row
- Export a backup, restore one, or paste backup JSON straight in

Toggles are batched: flipping ten switches issues one rule rebuild, not ten.

## CLI

Available as `airgap` on `$PATH` under KernelSU and APatch, otherwise at
`/data/adb/modules/airgap/system/bin/airgap`.

```
airgap block <pkg>...            isolate the given packages
airgap unblock <pkg>...|all      restore internet access
airgap set [<pkg>...|--none]     replace the isolated set with exactly these packages
airgap list                      show isolated packages and their UIDs
airgap status                    show rule, hook and watchdog state
airgap apply                     rebuild and reload all rules
airgap clear                     remove every rule and unhook the chain
airgap backup [file]             write a backup (default: /sdcard/Download)
airgap restore <file> [--merge]  restore from a backup file
airgap daemon | stop             control the resync watchdog
```

## How it works

Rules live in a dedicated `airgap` chain hooked once at the head of `OUTPUT`, loaded atomically
via `iptables-restore`. Every apply rebuilds that chain from `/data/adb/airgap/isolated.json`,
which is what keeps the following correct without any bookkeeping:

- **Shared UIDs** — apps declaring the same `sharedUserId` share one kernel UID. Unblocking one
  of them keeps the rule as long as another still needs it.
- **Reinstalls** — an app's UID changes when it is reinstalled. A watchdog watches
  `packages.list` via `inotifyd` and re-resolves within seconds, so a stale rule never blocks
  the wrong app.
- **netd flushes** — Android rebuilds the filter table on VPN, tethering and connectivity
  changes, which silently drops rules placed directly in `OUTPUT`. A 60s integrity pass
  detects this and repairs the chain.
- **Work profiles** — secondary-user UIDs (`uid + user × 100000`) are covered too.

Both IPv4 and IPv6 are handled. `REJECT` is used where the kernel supports it so blocked apps
fail fast instead of hanging, falling back to `DROP` otherwise.

## Backup & restore

```
airgap backup                    # -> /sdcard/Download/airgap-YYYYmmdd-HHMMSS.json
airgap restore <file>            # replace the current set
airgap restore <file> --merge    # add to the current set
```

Packages in a backup that are not installed are skipped and reported. Restore also accepts a
plain JSON array of package names.

## Uninstall

Remove the module in your root manager. This tears down the chain, stops the watchdog and
deletes `/data/adb/airgap`.

## Building

The repository *is* the module — zip its contents with the module files at the archive root,
excluding the repo-only files that the module does not need at runtime:

```
zip -r9X airgap.zip . -x '.git/*' '.github/*' 'README.md' 'update.json' 'changelog.md'
```

## Releasing

Root managers poll `update.json` and offer an update only when its `versionCode` is **higher**
than the installed one, so every release must bump it.

1. Bump `version` and `versionCode` in `module.prop`
2. Add the entry to `changelog.md`
3. Update `version`, `versionCode` and `zipUrl` in `update.json` to match
4. `zip -r9X airgap-<version>.zip . -x '.git/*' '.github/*' 'README.md' 'update.json' 'changelog.md'`
5. `gh release create v<version> airgap-<version>.zip --title "Airgap <version>"`
6. Push to the default branch — `update.json` is served from it, so the update only goes
   live once pushed

## License

[Apache-2.0](LICENSE)
