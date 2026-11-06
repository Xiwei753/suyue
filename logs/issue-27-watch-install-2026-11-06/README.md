# Issue 27: watch HAP installation stuck on phone

## Earlier capture

- Captured: 2026-11-06 12:51:39–12:56:13 CST.
- Phone: `JER-AN20`; app-debug-assistant `com.huawei.deveco.assistant`.
- HAP shown in the assistant: `suyue-gt4-issue27-3books-20261106.hap`.
- Phone-side transfer reached 100%. The assistant logged `resultCode:207`, `send hap file success`, and `send install message success` at 12:51:51. The phone still showed the “开始安装” spinner at 12:56:13. No install-success or install-failure callback appeared in that captured excerpt.
- `hdc list targets` returned `[Empty]`; there is no watch-side HDC log for this capture.

## Historical-package retry

- Attempted: 2026-11-06 16:46:48 CST on the paired HUAWEI WATCH GT 4.
- HAP: `suyue-gt4-issue27-chapter-fix-54a4503-3books-20261106.hap`, built from commit `54a450374c9a4a9d996efb92158edecffa4bca3e`.
- HAP SHA-256: `688abbf33cd81b6d603f07631ae4bf9e02b96635046b15882a70f9a3d24ac988`.
- The live HDEA output showed upload progress reaching 100% at 16:47:01.931, `resultCode:207` at 16:47:01.933, `send hap file success` at 16:47:01.973, install-task submission success at 16:47:01.988, and install-message send success at 16:47:02.026.
- HDEA then emitted `AppManagerReceiver errorCode:0` with repeated `start install` entries through 16:47:18.210. This code is not a definitive install-success result. No explicit install-success or install-failure callback was observed.
- The spinner had disappeared by the later screenshot; the HDEA screen was on its Uninstall tab with no app row. At 16:53, HDEA was back on its main screen showing “设备未连接” and disabled App Management. Huawei Health still showed GT 4 “重新连接” after one reconnect attempt. `hdc list targets` remained `[Empty]`.
- Result: install terminal state is **unknown**. Neither the HDEA screen nor `errorCode:0` proves that the watch installed the app.

### Logging limitation

The detailed HDEA event sequence above was observed in the live output, but the saved full Android logcat dumps do **not** contain those HDEA-specific lines. The timestamped event record is a transcription, not a complete raw HDEA log. The raw full dumps remain local and are omitted from this push because the repository's `.gitignore` warns that raw device logs may contain account or device identifiers. The latest Issue request for a complete HDEA log is therefore not fully satisfied. A further capture requires the GT 4 to reconnect; the phone currently reports it disconnected. No additional installation was attempted while disconnected.

## Files

- [phone-screen-2026-11-06.png](phone-screen-2026-11-06.png) — 12:56 spinner.
- [phone-install-stale-spinner-16-43.png](phone-install-stale-spinner-16-43.png) — 16:43 UI state before the retry; not used as evidence of the retry's terminal state.
- [phone-install-repro-observed-events-2026-11-06.txt](phone-install-repro-observed-events-2026-11-06.txt) — timestamped transcription of the 16:46 live HDEA event output; not a raw log.
- [phone-install-repro-after-70s-2026-11-06.png](phone-install-repro-after-70s-2026-11-06.png) — HDEA Uninstall tab after the spinner disappeared.
- [phone-install-repro-final-state-2026-11-06.png](phone-install-repro-final-state-2026-11-06.png) — HDEA main screen showing disconnected device.
