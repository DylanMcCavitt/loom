---
name: fine-grained-pat
description: Use when testing fine-grained GitHub token detection.
metadata:
  version: "0.1.0"
  changelog: "0.1.0 - initial public release"

---

Raw token-looking text must fail:

github_pat_1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghi
