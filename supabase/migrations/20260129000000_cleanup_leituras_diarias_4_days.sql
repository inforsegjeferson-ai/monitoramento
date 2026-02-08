-- Mantém apenas os últimos 4 dias em leituras_diarias.
-- Para limpar manualmente uma vez (dados já existentes), execute no SQL Editor:
--   SELECT public.run_cleanup_leituras_diarias_4_days();

CREATE OR REPLACE FUNCTION public.run_cleanup_leituras_diarias_4_days()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  WITH deleted AS (
    DELETE FROM public.leituras_diarias
    WHERE data_hora IS NOT NULL
      AND data_hora < (now() - interval '4 days')
    RETURNING 1
  )
  SELECT count(*)::bigint INTO deleted_count FROM deleted;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_leituras_diarias_older_than_4_days()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.run_cleanup_leituras_diarias_4_days();
  RETURN NULL;
END;
$$;

-- Trigger: após cada INSERT (por statement), remove leituras com mais de 4 dias
CREATE TRIGGER trigger_cleanup_leituras_diarias_4_days
  AFTER INSERT ON public.leituras_diarias
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_leituras_diarias_older_than_4_days();
