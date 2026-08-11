# عملیات فعلی Lead و صف فروش

> Status: CURRENT
> Source of truth: این سند برای رفتار پیاده‌سازی‌شده Lead، Sales Queue، Assignment و Call Log است.
> Owner: Sales Domain Owner
> Last validated: 2026-08-11 against `agent/sales-backend-slice-1`
> Supersedes: backing مبتنی بر `localStorage` برای صفحه‌های صف فروش و تخصیص Lead
> Superseded by: none

## دامنه اجراشده

مسیر فعلی زیر server-backed است:

`Customer 360 → Lead → Assignment → Sales Queue → Call Log → Timeline/Audit`

UI فارسی/RTL قبلی حفظ شده، اما صفحه‌های «صف فروش من» و «تخصیص و انتقال Lead» اکنون از `/api/v1/sales/*` و PostgreSQL استفاده می‌کنند. فایل‌ها و داده‌های Prototype حذف یا خودکار migrate نشده‌اند؛ Campaign، Invoice، Commission و AI Sales همچنان خارج از این slice هستند.

## مرز داده

- `customer_identity_id` هویت مشترک Customer در Workspace است.
- `customer_id`، Lead، assignment، تماس، رابطه فروش و timeline عملیاتی همگی Company-scoped هستند.
- Company و Workspace از session فعال استخراج می‌شوند و client اجازه تعیین آن‌ها در payload را ندارد.
- هر Call Log زمان، Company، User، Lead، Customer identity/relationship، نتیجه، context و `campaign_reference` snapshot را حفظ می‌کند.

## Permission و صف

| Permission | اختیار |
|---|---|
| `sales.queue.read` | مشاهده فقط Leadهای تخصیص‌یافته به membership فعال |
| `sales.call.create` | ثبت تماس فقط برای Lead موجود در صف همان membership |
| `sales.lead.create` | ایجاد Lead برای Customer قابل‌مشاهده در Company فعال |
| `sales.lead.read_all` | مشاهده همه Leadهای Company فعال |
| `sales.lead.assign` | تخصیص Lead بدون مالک به membership فروش فعال |
| `sales.lead.reassign` | بازتخصیص Lead دارای مالک، فقط با دلیل |

فروشنده عادی permission تخصیص ندارد و endpoint self-claim نیز وجود ندارد. بازتخصیص manager در `sales_lead_assignments`، Lead timeline و `audit_entries` ثبت می‌شود. اگر رابطه Customer lock فعال داشته باشد، همان transaction مالک lock را نیز منتقل و history آن را append می‌کند.

## تماس، رابطه و policy

رفتار مالکیت از `sales_policies` خوانده می‌شود و در service hard-code نشده است. policy شامل outcomeهای مؤثر، `relationship_lock_mode`، مدت lock اختیاری، رفتار تماس ناموفق و رفتار پایان شیفت است.

مقدار فعلی seed/default:

- outcome مؤثر: `real_conversation`, `interested`, `ready_for_invoice`؛
- lock: `until_reassigned`؛
- تماس ناموفق assignment را خودکار آزاد نمی‌کند، اما هیچ Customer relationship یا lock دائمی ایجاد نمی‌کند؛
- پایان شیفت هیچ open work را خودکار منتقل نمی‌کند.

Outcome مؤثر، relationship شرکتی را ایجاد/به‌روزرسانی و طبق policy lock می‌کند. `no_answer`, `could_not_connect`, `switched_off` و سایر تلاش‌های غیرمؤثر فقط Call Log و timeline می‌سازند. callback زمان آینده را ثبت می‌کند و نتیجه‌های مذاکره، فاکتور، شماره اشتباه، انصراف و شکایت status Lead را مطابق رفتار معتبر Prototype تغییر می‌دهند.

## تاریخچه و قابلیت بازیابی

- assignment/reassignment append-only است و previous/new owner، actor، time و reason را نگه می‌دارد.
- Lead timeline رویدادهای create، assignment و call را نگه می‌دارد.
- Customer timeline رویدادهای `sales_lead_created` و `sales_call_logged` را در همان Company ثبت می‌کند.
- Audit شامل previous/new state و `correlationId` است.
- migration داده Lead/Call قدیمی از `localStorage` در این slice انجام نشده و به pipeline صریح import/reconciliation آینده نیاز دارد.

## شواهد پیاده‌سازی

- `server/migrations/0009_sales_lead_queue.sql`
- `server/src/modules/sales/`
- `server/tests/sales.integration.test.ts`
- `src/foundation/sales/`

طراحی کامل Sales در [approved design](approved-design.md) و جزئیات حل‌نشده موتور assignment در [open questions](open-questions.md) باقی می‌مانند.
