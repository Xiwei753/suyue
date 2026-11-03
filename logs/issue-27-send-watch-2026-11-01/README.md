# Issue 27: send-to-watch attempt

- Captured: 2026-11-01 22:43:49–22:43:50 (device log time, local time)
- Source: phone-side HiLog for `com.xiwei.suyue`, during the single send attempt requested for this capture.
- Result: the phone reports the remote watch app as installed, then `sendMessage HELLO` returns code `206`; `sendBook` fails at the HELLO stage.
- Scope: this is a focused phone-side log excerpt. No `BOOK_META` or book-file transfer appears in this attempt, and no separate watch-side log was available from the connected HDC target.

Log: [phone-hilog-2026-11-01-224349.log](phone-hilog-2026-11-01-224349.log)
