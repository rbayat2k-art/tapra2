# Pre-migration documentation snapshot

> Status: HISTORICAL
> Immutable: Yes — do not edit after creation

## Snapshot metadata

- Repository: `rbayat2k-art/tapra2`
- Source branch: `stable`
- Full commit SHA: `f271cca7eb23e375209a7b575b960d8bdd52ac22`
- Short commit SHA: `f271cca7`
- Creation date: `2026-08-10`
- Timezone: `Asia/Tehran`
- Purpose: حفظ کامل وضعیت مستندات پیش از Phase 3 و فراهم‌کردن امکان بازیابی و rollback.
- Copied documentation files: `13`

## Preservation rules

- تمام فایل‌های کپی‌شده باید بدون تغییر محتوایی نگهداری شوند.
- این snapshot منبع تاریخی است و نباید به‌عنوان مستندات فعال یا CURRENT استفاده شود.
- وضعیت‌های MIXED فقط توصیف وضعیت پیش از مهاجرت هستند و در معماری نهایی مجاز نیستند.
- `DECISION_LOG.md` و `SALES_ARCHITECTURE_DRAFT.md` باید به‌صورت verbatim قابل بازیابی بمانند.

## Copied files

| Source file | Snapshot file | Purpose | Observed status | Lines | Source blob SHA |
|---|---|---|---|---:|---|
| `README.md` | `root/README.md` | راهنمای عمومی و اجرای محلی پروژه | CURRENT — ناقص و نیازمند بازنویسی | 21 | `b688d9c7ed9d1f25d3357ded111a81051ebb4903` |
| `AGENTS.md` | `root/AGENTS.md` | قواعد عامل هوش مصنوعی، محدودیت‌های پیاده‌سازی و قواعد دامنه | MIXED — CURRENT + یادداشت‌های تاریخی پیاده‌سازی | 101 | `7ff5091e861ed8739d43b21df7dfe0d7698a4180` |
| `DECISION_LOG.md` | `root/DECISION_LOG.md` | تاریخچه تصمیمات معماری، فنی و تجاری | HISTORICAL | 263 | `50f47e491a9f2a64100ee3047aca645c5e5ed3b9` |
| `docs/AI_CONTEXT.md` | `docs/AI_CONTEXT.md` | زمینه و راهنمای دستیاران هوش مصنوعی | MIXED — CURRENT + FUTURE | 42 | `66d86fb085b6238da6bbab90b98dac0a382702fd` |
| `docs/API_DOCUMENTATION.md` | `docs/API_DOCUMENTATION.md` | طرح مفهومی API و backend آینده | APPROVED-FUTURE / DRAFT | 67 | `a59375f8e9a0c730afe4f873a4b3ce81804d502a` |
| `docs/BUSINESS_RULES.md` | `docs/BUSINESS_RULES.md` | قواعد کسب‌وکار، گردش کار، دسترسی و اعتبارسنجی | MIXED — CURRENT + FUTURE | 92 | `8512f5b22fd2ca5388e1046222a6dfc377d66177` |
| `docs/CODE_STRUCTURE.md` | `docs/CODE_STRUCTURE.md` | ساختار کد و مسئولیت فایل‌ها | CURRENT — نیازمند اعتبارسنجی | 76 | `77346b4a1f6f3cd4125849f17abb47dd6d8a8ead` |
| `docs/DATABASE_DOCUMENTATION.md` | `docs/DATABASE_DOCUMENTATION.md` | مدل داده و توضیح persistence مبتنی بر localStorage | CURRENT — واژگان نیازمند اصلاح | 181 | `5f4f8e0aa6a5bf494140828697299fc8583d27cc` |
| `docs/DEVELOPMENT_GUIDE.md` | `docs/DEVELOPMENT_GUIDE.md` | راهنمای نصب، توسعه، build و type checking | CURRENT | 52 | `1b54686818a620d635be64653897dbd74e8e7cff` |
| `docs/MODULES_DOCUMENTATION.md` | `docs/MODULES_DOCUMENTATION.md` | فهرست و مسئولیت ماژول‌های سیستم | CURRENT — نیازمند اعتبارسنجی | 125 | `5c55391c209f6fa26f97094dc022083ff6d5130c` |
| `docs/PROJECT_OVERVIEW.md` | `docs/PROJECT_OVERVIEW.md` | هدف، دامنه، کاربران و وضعیت پروژه | CURRENT — دارای ادعاهای قدیمی | 36 | `2dcd191465d08afc1c5ad9976ae5e1ee46f8a6b3` |
| `docs/SALES_ARCHITECTURE_DRAFT.md` | `docs/SALES_ARCHITECTURE_DRAFT.md` | طراحی ماژول فروش، تصمیم‌های آینده و پرسش‌های باز | MIXED — APPROVED-FUTURE + DRAFT | 280 | `db1327853ac819d5b5565fa146fb7a0728830174` |
| `docs/SYSTEM_ARCHITECTURE.md` | `docs/SYSTEM_ARCHITECTURE.md` | معماری فعلی SPA و اجزای اصلی | CURRENT — نیازمند اعتبارسنجی | 41 | `58d6acf8755782957d0d3ef5074a2a7baa5fc4f0` |

## Integrity

- SHA-256 فایل‌های کپی‌شده و این manifest در `checksums.sha256` ثبت شده است.
- فایل `checksums.sha256` خودش را hash نمی‌کند تا وابستگی دوری ایجاد نشود.
