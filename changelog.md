## 1.0

Initial release.

- Kernel-level per-app internet blocking via `iptables` UID owner matching, IPv4 and IPv6
- Dedicated `airgap` chain hooked once at the head of `OUTPUT`, loaded atomically with `iptables-restore`
- Watchdog resyncs on package install/update and repairs the chain after netd flushes the filter table
- Correct handling of shared UIDs, reinstall UID changes and work-profile UIDs
- WebUI with user/system/blocked filtering, six sort modes, search and batched applies
- Backup, restore and import of the isolated app list
