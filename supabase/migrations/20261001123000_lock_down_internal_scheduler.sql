-- scheduler_state is internal (only trigger_notification_scheduler uses it):
-- no client access. RLS with no policies on purpose.
ALTER TABLE public.scheduler_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduler_state FROM anon, authenticated;
ALTER FUNCTION public.cleanup_old_push_sent() SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_notification_scheduler() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_push_sent() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_notification_scheduler() FROM PUBLIC, anon, authenticated;
