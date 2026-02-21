-- حذف عناصر الجلسات المكررة أولاً
DELETE FROM public.accounting_session_items 
WHERE session_id IN ('8a548da9-3199-4586-bf44-beab36099a82', '6052a65b-a4d0-468e-bf2b-a882c3cf267e');

-- ثم حذف الجلسات المكررة (إبقاء الأحدث فقط)
DELETE FROM public.accounting_sessions 
WHERE id IN ('8a548da9-3199-4586-bf44-beab36099a82', '6052a65b-a4d0-468e-bf2b-a882c3cf267e');