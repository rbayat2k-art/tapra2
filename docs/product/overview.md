# نمای کلی فعلی محصول

> Status: CURRENT
> Source of truth: This document for current product purpose and scope
> Owner: Product Owner
> Last validated: 2026-08-10 against `stable@e5874572`
> Supersedes: none
> Superseded by: none

Tapra2 یک برنامه تحت وب برای مدیریت فرایندهای مالی و اداری سازمان است. این سند فقط دامنه‌ای را توضیح می‌دهد که در `stable` پیاده‌سازی و در source code مشاهده شده است.

## دامنه فعلی

قابلیت‌های موجود شامل این حوزه‌ها هستند:

- درخواست‌های مالی، گردش تایید، کارتابل‌ها، آرشیو و خروجی پرداخت گروهی؛
- شرکت‌ها، مراکز هزینه، کاربران، نقش‌ها و permissions؛
- ذی‌نفعان و دسته‌بندی آن‌ها؛
- نامه‌ها، ارتباطات، اعلان‌ها، پیام‌ها و کارهای ارجاع‌شده؛
- پرونده‌های support و شکایت؛
- موجودیت Customer و نمای فعلی مشتریان؛
- ناوبری چندتبی و تنظیمات ظاهری کاربر.

این فهرست معرفی سطح بالا است. مرجع جزئیات هر دامنه پس از ایجاد، سند authoritative همان دامنه خواهد بود.

## مرز اجرایی فعلی

- برنامه یک client-side SPA است.
- داده‌ها در مرورگر و عمدتاً در `localStorage` نگهداری می‌شوند.
- backend و API اجرایی در commit اعتبارسنجی‌شده مشاهده نشد.
- این سند ادعای `Production-Ready` بودن، امنیت enterprise یا persistence سروری ندارد.
- طراحی‌های آینده sales، backend و API جزو رفتار فعلی محسوب نمی‌شوند.

## مخاطبان فعلی

ساختار برنامه برای کاربران درخواست‌کننده، تاییدکننده، خزانه‌داری، مدیران سازمانی، کارشناسان support و نقش‌های مدیریتی طراحی شده است. دسترسی واقعی هر کاربر توسط مدل roles و permissions برنامه تعیین می‌شود.

## مراجع مرتبط

- [معماری فعلی](../architecture/current-system.md)
- [وضعیت فعلی API](../architecture/api-status.md)
- [مدل داده فعلی](../data/current-data-model.md)
- [Persistence فعلی](../data/persistence.md)
- [راهنمای توسعه](../engineering/development.md)
- [وضعیت کیفیت](../engineering/quality.md)
- [فهرست مستندات](../README.md)
