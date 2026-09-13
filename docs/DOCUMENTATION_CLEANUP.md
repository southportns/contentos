# Documentation Cleanup Note

**Created**: 2026-09-13
**Task**: P0.3.7 Transition Cleanup — Canonical Documentation Rule

---

## Canonical vs Duplicate Files

The following 5 documentation pairs exist in `docs/`. The **short-name versions** are canonical.

| Canonical (Keep) | Duplicate (Legacy) |
|------------------|-------------------|
| `docs/ARCHITECTURE.md` | `docs/Content OS — Architecture.md` |
| `docs/PRODUCT_SPEC.md` | `docs/Content OS — Product Specification.md` |
| `docs/ROADMAP.md` | `docs/Content OS — Roadmap.md` |
| `docs/SKILL_SPEC.md` | `docs/Content OS — Skill Specification.md` |
| `docs/DEVELOPMENT.md` | `docs/Content OS — Development Guide.md` |

---

## Rule

1. **Canonical files** use short names without prefix: `ARCHITECTURE.md`, `ROADMAP.md`, etc.
2. **Duplicate files** with prefix `Content OS — xxx.md` are legacy duplicates.
3. **Duplicates are NOT deleted yet** — they remain for backward compatibility.
4. Future cleanup (in P0.3.7) will remove duplicates after confirming no external references exist.

---

## Status

- Canonical rule: **ESTABLISHED**
- Duplicate deletion: **DEFERRED** to P0.3.7 cleanup
