CREATE OR REPLACE FUNCTION public.set_user_data_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS user_data_set_updated_at ON public.user_data;
CREATE TRIGGER user_data_set_updated_at BEFORE UPDATE ON public.user_data FOR EACH ROW EXECUTE FUNCTION public.set_user_data_updated_at();