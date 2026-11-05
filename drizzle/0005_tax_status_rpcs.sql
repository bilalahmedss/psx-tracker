-- Filer status history: backfill, and keep it in step through the portfolio RPCs.
-- "1900-01-01" means "from the start" (before any trade).

INSERT INTO public.portfolio_tax_status (portfolio_id, status, effective_from)
SELECT id, tax_status, DATE '1900-01-01' FROM public.portfolios
ON CONFLICT (portfolio_id, effective_from) DO NOTHING;
--> statement-breakpoint

-- Today's status mirrored onto portfolios.tax_status (PKT calendar date).
CREATE OR REPLACE FUNCTION public.sync_current_tax_status(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.portfolios p
  SET tax_status = s.status
  FROM (
    SELECT status FROM public.portfolio_tax_status
    WHERE portfolio_id = p_id AND effective_from <= (now() AT TIME ZONE 'Asia/Karachi')::date
    ORDER BY effective_from DESC LIMIT 1
  ) s
  WHERE p.id = p_id AND p.tax_status IS DISTINCT FROM s.status;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.sync_current_tax_status(uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.sync_current_tax_status(uuid) TO authenticated;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.create_portfolio(
  p_name text,
  p_broker_id uuid,
  p_tax_status public.tax_status,
  p_filer_rate numeric,
  p_non_filer_rate numeric,
  p_threshold numeric,
  p_pct_above numeric,
  p_per_share_below numeric,
  p_fed_pct numeric,
  p_min_fee numeric,
  p_is_default boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fee uuid;
  v_cgt uuid;
  v_id uuid;
  v_default boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.fee_profiles (user_id, name, threshold, pct_above, per_share_below, fed_pct, min_fee)
  VALUES (v_uid, 'Portfolio fees', p_threshold, p_pct_above, p_per_share_below, p_fed_pct, p_min_fee)
  RETURNING id INTO v_fee;

  INSERT INTO public.cgt_rules (user_id, name, filer_rate, non_filer_rate)
  VALUES (v_uid, 'Portfolio CGT', p_filer_rate, p_non_filer_rate)
  RETURNING id INTO v_cgt;

  v_default := p_is_default OR NOT EXISTS (SELECT 1 FROM public.portfolios WHERE user_id = v_uid);
  IF v_default THEN
    UPDATE public.portfolios SET is_default = false WHERE user_id = v_uid AND is_default;
  END IF;

  INSERT INTO public.portfolios (user_id, name, broker_id, tax_status, cgt_rule_id, fee_profile_id, is_default)
  VALUES (v_uid, btrim(p_name), p_broker_id, p_tax_status, v_cgt, v_fee, v_default)
  RETURNING id INTO v_id;

  INSERT INTO public.portfolio_tax_status (portfolio_id, status, effective_from)
  VALUES (v_id, p_tax_status, DATE '1900-01-01');

  RETURN v_id;
END;
$$;
--> statement-breakpoint

DROP FUNCTION public.update_portfolio(uuid, text, uuid, public.tax_status, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean);
--> statement-breakpoint
CREATE FUNCTION public.update_portfolio(
  p_id uuid,
  p_name text,
  p_broker_id uuid,
  p_tax_status public.tax_status,
  p_status_effective_from date,
  p_filer_rate numeric,
  p_non_filer_rate numeric,
  p_threshold numeric,
  p_pct_above numeric,
  p_per_share_below numeric,
  p_fed_pct numeric,
  p_min_fee numeric,
  p_is_default boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fee uuid;
  v_cgt uuid;
  v_eff date := coalesce(p_status_effective_from, (now() AT TIME ZONE 'Asia/Karachi')::date);
  v_status_then public.tax_status;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT fee_profile_id, cgt_rule_id INTO v_fee, v_cgt
  FROM public.portfolios WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portfolio not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_fee IS NULL THEN
    INSERT INTO public.fee_profiles (user_id, name, threshold, pct_above, per_share_below, fed_pct, min_fee)
    VALUES (v_uid, 'Portfolio fees', p_threshold, p_pct_above, p_per_share_below, p_fed_pct, p_min_fee)
    RETURNING id INTO v_fee;
  ELSE
    UPDATE public.fee_profiles
    SET threshold = p_threshold, pct_above = p_pct_above, per_share_below = p_per_share_below,
        fed_pct = p_fed_pct, min_fee = p_min_fee
    WHERE id = v_fee;
  END IF;

  IF v_cgt IS NULL THEN
    INSERT INTO public.cgt_rules (user_id, name, filer_rate, non_filer_rate)
    VALUES (v_uid, 'Portfolio CGT', p_filer_rate, p_non_filer_rate)
    RETURNING id INTO v_cgt;
  ELSE
    UPDATE public.cgt_rules SET filer_rate = p_filer_rate, non_filer_rate = p_non_filer_rate WHERE id = v_cgt;
  END IF;

  -- Record a status change only if it differs from the status in force on that date.
  SELECT status INTO v_status_then FROM public.portfolio_tax_status
  WHERE portfolio_id = p_id AND effective_from <= v_eff
  ORDER BY effective_from DESC LIMIT 1;
  IF v_status_then IS DISTINCT FROM p_tax_status THEN
    INSERT INTO public.portfolio_tax_status (portfolio_id, status, effective_from)
    VALUES (p_id, p_tax_status, v_eff)
    ON CONFLICT (portfolio_id, effective_from) DO UPDATE SET status = excluded.status;
  END IF;

  IF p_is_default THEN
    UPDATE public.portfolios SET is_default = false WHERE user_id = v_uid AND is_default AND id <> p_id;
  END IF;

  UPDATE public.portfolios
  SET name = btrim(p_name), broker_id = p_broker_id,
      fee_profile_id = v_fee, cgt_rule_id = v_cgt, is_default = p_is_default
  WHERE id = p_id;

  PERFORM public.sync_current_tax_status(p_id);
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.update_portfolio(uuid, text, uuid, public.tax_status, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.update_portfolio(uuid, text, uuid, public.tax_status, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean) TO authenticated;
--> statement-breakpoint

-- Remove one status change (never the initial "from the start" row).
CREATE OR REPLACE FUNCTION public.delete_tax_status_change(p_change_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_portfolio uuid;
  v_from date;
BEGIN
  SELECT portfolio_id, effective_from INTO v_portfolio, v_from
  FROM public.portfolio_tax_status WHERE id = p_change_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Status change not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_from = DATE '1900-01-01' THEN
    RAISE EXCEPTION 'The starting status cannot be removed' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.portfolio_tax_status WHERE id = p_change_id;
  PERFORM public.sync_current_tax_status(v_portfolio);
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.delete_tax_status_change(uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_tax_status_change(uuid) TO authenticated;
