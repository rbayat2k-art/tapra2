# بایگانی شواهد محصول legacy

> Status: HISTORICAL
> Source of truth: این پوشه فقط برای حفظ artifactهای تاریخی یکتا است و authority رفتار `CURRENT` یا طراحی آینده نیست.
> Owner: Documentation Architecture
> Last validated: 2026-08-11 against `stable@6d8414e0` and the read-only legacy evidence
> Supersedes: none
> Superseded by: اسناد authoritative در `docs/README.md`

## محتوای این پوشه

| Artifact | منشأ | روش حفظ | کاربرد مجاز |
|---|---|---|---|
| `tapra_preview.raw.jsx` | `C:\Users\iLia\Downloads\tapra_preview.jsx` | متن UTF-8 با LF حفظ شده است؛ تنها تفاوت بایتی، newline پایانی repository است | شاهد تاریخی UI درون‌حافظه‌ای پنج رفتار خزانه‌داری؛ هرگز runtime source نیست |

SHA-256 فایل اصلی `tapra_preview.jsx` برابر است با:

`0F7A81959A39C0CC42957A68585D8DD41FDD656CD8EE9234CFB58F7181CDECCF`

متن normalize‌شده فایل اصلی و artifact این پوشه یکسان است. بررسی الگوهای secret، password، API key، token و connection string هیچ مقدار credential پیدا نکرد.

## Master کامل legacy

آخرین نسخه کامل `ERP_CRM_MASTER_SPEC.md` از stash با نسخه موجود در forensic extraction به‌صورت normalize‌شده یکسان است:

- SHA-256: `A26E515F758D1EED79E42475F4040773A68BDF7BDAAAE7AB9FB1783D9312DC34`
- Legacy stash: `684c3a67d9687bf7bef383bf7cbe5a3e514cbcdf`
- Forensic evidence: `C:\Users\iLia\Documents\Codex\2026-08-10\github-plugin-github-openai-curated-remote\legacy-audit\tapra2-0b8a6c51938c\latest-product-evidence\docs\ERP_CRM_MASTER_SPEC.md`

این فایل بزرگ عمداً دوباره داخل درخت مستندات فعال کپی نشده است؛ [Legacy Product Preservation Matrix](../legacy-product-preservation-matrix.md) تمام capabilityها و تصمیم‌های substantive آن را طبقه‌بندی می‌کند و ZIP/forensic extraction نسخه خام کامل را نگه می‌دارند. این سیاست از authority موازی و بارگذاری بی‌دلیل context توسط AI جلوگیری می‌کند.

## محدودیت استفاده

- هیچ کد این پوشه نباید import، build یا اجرا شود.
- برای رفتار فعلی از code و authorityهای `CURRENT` استفاده شود.
- برای طراحی آینده فقط اسناد `APPROVED-FUTURE` و `DRAFT` فهرست‌شده در `docs/README.md` معتبرند.
- حذف ZIP یا forensic extraction بخشی از این migration نیست و نیازمند تصمیم جداگانه است.
