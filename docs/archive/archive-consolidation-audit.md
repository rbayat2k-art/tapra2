# ممیزی تجمیع آرشیو و Cleanup Gate

> Status: HISTORICAL
> Source of truth: این سند شاهد ممیزی read-only مسیرهای legacy پیش از cleanup است؛ authority رفتار محصول نیست.
> Owner: Documentation Architecture
> Last validated: 2026-08-11 against `stable@6d8414e0`
> Supersedes: none
> Superseded by: none

## مبنا و روش

مبنای مقایسه فقط `origin/stable@6d8414e0e6d10e4660ec9fc39124f67628f30497` و checkout رسمی `C:\Users\iLia\Documents\Tapra2\canonical` بود. هیچ source legacy به runtime برگردانده نشد.

برای هر مسیر، commitها، branchها، stash، index، worktree، untracked file، اسناد، تصمیم‌های کسب‌وکار و code بررسی شدند. شواهد با code فعلی، اسناد authoritative، [Legacy Product Preservation Matrix](legacy-product-preservation-matrix.md)، [Sales archive](sales/README.md) و [PR #1 archive](pr-1/README.md) تطبیق داده شدند.

## نتیجه مسیرها

| مسیر | شواهد یکتا یا محلی | محل حفظ | نتیجه پس از merge این audit |
|---|---|---|---|
| `C:\Users\iLia\tapra2` | HEAD `4eefb5c1`، stash `684c3a67`، ۷۱ commit روی lineage قدیمی، conflict در `docs/README.md`، snapshotهای staged و `.claude/settings.local.json` | ZIP کامل، forensic extraction، preservation matrix و authorityهای فعلی | `SAFE_TO_REMOVE_AFTER_APPROVAL` فقط با حفظ ZIP و forensic extraction |
| `C:\Users\iLia\Documents\Codex\2026-08-05\referenced-chatgpt-conversation-this-is-an\work\tapra2-docs-profile` | PR #1 head `1cc0e9d1` و دسترسی به همان stash legacy | دو سند یکتا در `docs/archive/pr-1/` و code معتبر در canonical | `SAFE_TO_REMOVE_AFTER_APPROVAL` پس از بسته‌شدن PR #1 به‌عنوان superseded |
| `C:\Users\iLia\Documents\Codex\2026-08-05\referenced-chatgpt-conversation-this-is-an\work\tapra2-docs-sales-flow` | commitهای محلی `f5fb6f22` و `8d31ad30`؛ فقط سند `LEGACY_CRM_ANALYSIS_AND_END_TO_END_SALES_FLOW.md` | متن normalize‌شده دقیقاً در `docs/archive/pr-1/LEGACY_CRM_ANALYSIS_AND_END_TO_END_SALES_FLOW.md` وجود دارد | `SAFE_TO_REMOVE_AFTER_APPROVAL` |
| `C:\Users\iLia\Documents\Codex\2026-08-05\referenced-chatgpt-conversation-this-is-an\work\tapra2-readonly` | ۲۴ خط ثبت‌نشده در `SALES_ARCHITECTURE_DRAFT.md` درباره سلسله‌مراتب فروش، ۱۰۲ میلیون رکورد، MIS و تطبیق شماره تماس | همان متن در `docs/archive/sales/SALES_ARCHITECTURE_DRAFT.md` و قواعد معتبر در `docs/domains/sales/approved-design.md` حفظ شده است | `SAFE_TO_REMOVE_AFTER_APPROVAL` |
| `C:\Users\iLia\Downloads\tapra_preview.jsx` | demo مستقل درون‌حافظه‌ای؛ در Git objectهای legacy یا ZIPهای بررسی‌شده وجود نداشت | `docs/archive/legacy-product/tapra_preview.raw.jsx` و README هشداردهنده | `SAFE_TO_REMOVE_AFTER_APPROVAL` |

## اثبات حفظ checkout اصلی legacy

نسخه `C:\Users\iLia\tapra2` با forensic extraction مقایسه شد:

- HEAD یکسان: `4eefb5c1bf29cb0b9ed451b8e4a066a5d85f70fc`
- stash یکسان: `684c3a67d9687bf7bef383bf7cbe5a3e514cbcdf`
- porcelain status، worktree patch، index patch، فهرست untracked و hash فایل‌های untracked یکسان
- تنها تفاوت ref، branch محلی `main` بود؛ ref فعلی `a50816bd` جد مستقیم ref بایگانی‌شده `559a509a` است، پس forensic extraction تاریخچه کامل‌تری دارد

آرشیو کامل `C:\Users\iLia\tapra2.zip` با SHA-256 زیر باید باقی بماند:

`0B8A6C51938C90AE88C5FA37F76F1D73B132EE48923A9DE01CAE1C9903A1D207`

## تصمیم‌های بازیابی‌شده از stash

### سخت‌سازی مالی عودت

stash تصمیم کرده بود که تأیید ردیف فقط پیش از ساخت درخواست خزانه قابل لغو و نیازمند دلیل باشد؛ پس از اتصال ردیف به هر درخواست پرداخت، reset و ساخت درخواست دوم ممنوع است؛ ارسال به خزانه پرونده را نمی‌بندد و بستن فقط وقتی مجاز است که همه ردیف‌ها `paid` یا `financial_rejected` باشند.

این تصمیم با `src/utils/supportRefundWorkflow.ts`، تست‌های همان فایل، handlerهای `src/App.tsx` و `SupportCaseDetailModal.tsx` در `stable` اثبات شد و در authority پشتیبانی ثبت شده است.

### پروتکل تحلیل مرحله‌ای و حفاظت stable

stash الزام کرده بود تغییر مهم روی branch جدا، بدون تغییر مستقیم `stable`، و پس از روشن‌شدن scope و معیار پذیرش انجام شود. این تصمیم اکنون توسط `AGENTS.md`، `docs/engineering/source-of-truth.md`، Pull Request اجباری و check اجباری `quality` پوشش داده می‌شود و سند legacy authority مستقل نیست.

## کد legacy

کدهای committed و stash مربوط به Catalog، Sales، Finance، Support، RBAC و UI به‌صورت capability-by-capability در preservation matrix بررسی شده‌اند. موارد معتبر یا در canonical وجود دارند، یا به‌عنوان `Prototype-backed`/future ثبت شده‌اند. هیچ code قدیمی در این task وارد runtime، package configuration، migration یا PostgreSQL نشد.

## PR #1

PR #1 `PARTIALLY_SUPERSEDED` بود. code معتبر آن در canonical حفظ یا توسعه یافته و دو سند یکتای آن در `docs/archive/pr-1/` نگهداری شده‌اند. پس از merge و موفقیت CI این audit، PR می‌تواند بدون merge با توضیح superseded بسته شود؛ branch آن در این task حذف نمی‌شود.

## شرط cleanup

این سند مجوز حذف نیست. هر مسیر `SAFE_TO_REMOVE_AFTER_APPROVAL` فقط پس از تأیید صریح کاربر قابل حذف است. `C:\Users\iLia\tapra2.zip`، forensic extraction، canonical checkout و PostgreSQL data در گروه نگهداری/عدم‌دست‌زدن باقی می‌مانند.
