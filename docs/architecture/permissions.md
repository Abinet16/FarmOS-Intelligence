# Permission matrix

Roles are assigned per **membership**, so the same person can hold different roles in
different organizations. Code checks **permissions**, never role names. The matrix is defined
once in [`packages/shared-types/src/roles.ts`](../../packages/shared-types/src/roles.ts).

| Permission                      | Owner | Manager | Supervisor | Field worker | Veterinarian | Auditor |
| ------------------------------- | :---: | :-----: | :--------: | :----------: | :----------: | :-----: |
| `organization:manage`           |  ✅   |         |            |              |              |         |
| `access:manage`                 |  ✅   |         |            |              |              |         |
| `farm:configure`                |  ✅   |   ✅    |            |              |              |         |
| `production:record`             |  ✅   |   ✅    |     ✅     |      ✅      |              |         |
| `production:approve-correction` |  ✅   |   ✅    |     ✅     |              |              |         |
| `health:record`                 |  ✅   |   ✅    |     ✅     |              |      ✅      |         |
| `reports:view`                  |  ✅   |   ✅    |     ✅     |              |      ✅      |   ✅    |
| `reports:view-limited`          |       |         |            |      ✅      |              |         |
| `audit:view`                    |  ✅   |   ✅    |            |              |              |   ✅    |
| `ai:query`                      |  ✅   |   ✅    |     ✅     |              |      ✅      |         |

## Rules

- Every permission is evaluated **inside one organization**. An auditor in org A has no
  access to org B.
- `access:manage` is owner-only for the MVP. Delegation to managers is a post-MVP option.
- `reports:view-limited` means a field worker sees their own recent entries and their
  assigned batches only; the exact scope is defined with the reports module (week 8).
- Frontend role-based rendering is for usability only. The API is the security boundary.
