# Excel dependency

Runtime: SheetJS CE **0.18.5**, Apache-2.0. Source downloaded with normal TLS verification from https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js; license from the same pinned npm release. SHA-256 is recorded in `SHA256SUMS` and checked during build. This fingerprint detects checkout corruption; it is not a publisher signature.

This is the application's existing version, now local so application operation requires no CDN. It is **not approved for production**: CVE-2023-30533 (prototype pollution, fixed in 0.19.3) and CVE-2024-22363 (ReDoS, fixed in 0.20.2) affect this version. See https://github.com/advisories/GHSA-4r6h-8v6p-xvw6 and https://github.com/advisories/GHSA-5pgg-2g8v-p4x9.

The managed egress proxy refused a CONNECT to `cdn.sheetjs.com`; the official 0.20.3 distribution could not be acquired. Do not substitute an unofficial repackaging or disable TLS. A draft network addition for that hostname was saved. After the environment settings are applied, acquire an appropriately reviewed fixed release from the official distribution, verify provenance/license, update both main/worker paths and checksums, rerun every test and independent acceptance oracle, and revise the release report. Do not merely change the checksum to hide an unexpected download.

File/row/column/sheet limits and a 15-second Worker timeout reduce resource exposure but do not fix these vulnerabilities. A Worker has no hard memory quota; a hostile compressed workbook remains a release risk. Do not use this candidate for untrusted documents. `npm audit` does not scan this vendored file; a zero npm finding count is not a clean security assessment.
