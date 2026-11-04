-- Custom migration: triggers, portfolio RPC functions, and PSX seed data.
-- RPC functions are SECURITY INVOKER: they run as the calling user, so RLS still applies.

-- ---------- updated_at ----------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER fee_profiles_set_updated_at BEFORE UPDATE ON public.fee_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER cgt_rules_set_updated_at BEFORE UPDATE ON public.cgt_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER securities_set_updated_at BEFORE UPDATE ON public.securities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER portfolios_set_updated_at BEFORE UPDATE ON public.portfolios FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER import_jobs_set_updated_at BEFORE UPDATE ON public.import_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER transactions_set_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER zakat_settings_set_updated_at BEFORE UPDATE ON public.zakat_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER dashboard_layouts_set_updated_at BEFORE UPDATE ON public.dashboard_layouts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint

-- ---------- profile row on sign-up ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, auth_provider)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_app_meta_data ->> 'provider'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint

-- ---------- portfolio RPCs (atomic, RLS applies) ----------
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

  -- The first portfolio is always the default.
  v_default := p_is_default OR NOT EXISTS (SELECT 1 FROM public.portfolios WHERE user_id = v_uid);
  IF v_default THEN
    UPDATE public.portfolios SET is_default = false WHERE user_id = v_uid AND is_default;
  END IF;

  INSERT INTO public.portfolios (user_id, name, broker_id, tax_status, cgt_rule_id, fee_profile_id, is_default)
  VALUES (v_uid, btrim(p_name), p_broker_id, p_tax_status, v_cgt, v_fee, v_default)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.update_portfolio(
  p_id uuid,
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
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fee uuid;
  v_cgt uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  -- RLS hides other users' portfolios, so "not found" also covers "not yours".
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

  IF p_is_default THEN
    UPDATE public.portfolios SET is_default = false WHERE user_id = v_uid AND is_default AND id <> p_id;
  END IF;

  UPDATE public.portfolios
  SET name = btrim(p_name), broker_id = p_broker_id, tax_status = p_tax_status,
      fee_profile_id = v_fee, cgt_rule_id = v_cgt, is_default = p_is_default
  WHERE id = p_id;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.delete_portfolio(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fee uuid;
  v_cgt uuid;
  v_was_default boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT fee_profile_id, cgt_rule_id, is_default INTO v_fee, v_cgt, v_was_default
  FROM public.portfolios WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portfolio not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.portfolios WHERE id = p_id;
  DELETE FROM public.fee_profiles WHERE id = v_fee AND user_id = v_uid;
  DELETE FROM public.cgt_rules WHERE id = v_cgt AND user_id = v_uid;

  -- Promote the oldest remaining portfolio to default.
  IF v_was_default THEN
    UPDATE public.portfolios SET is_default = true
    WHERE id = (SELECT id FROM public.portfolios WHERE user_id = v_uid ORDER BY created_at LIMIT 1);
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.create_portfolio(text, uuid, public.tax_status, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.update_portfolio(uuid, text, uuid, public.tax_status, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.delete_portfolio(uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_portfolio(text, uuid, public.tax_status, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.update_portfolio(uuid, text, uuid, public.tax_status, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_portfolio(uuid) TO authenticated;
--> statement-breakpoint

-- ---------- seed: PSX defaults ----------
-- Commission: 0.15% of value at or above Rs 20/share, Rs 0.03/share below (equal at Rs 20).
-- Sales tax on commission: 15% (Sindh). Confirm against a broker contract note.
INSERT INTO public.fee_profiles (id, user_id, name, threshold, pct_above, per_share_below, fed_pct, min_fee)
VALUES ('00000000-0000-4000-8000-0000000000f1', NULL, 'PSX default', 20, 0.0015, 0.03, 0.15, 0)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- CGT on listed shares acquired on or after 1 Jul 2024. Estimates only.
INSERT INTO public.cgt_rules (id, user_id, name, filer_rate, non_filer_rate, effective_from, notes)
VALUES ('00000000-0000-4000-8000-0000000000c1', NULL, 'PSX default (acquired on or after 1 Jul 2024)', 0.15, 0.30, '2024-07-01',
        'Estimate only. Confirm current rates with a tax adviser.')
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO public.brokers (name, default_fee_profile_id, sort_order) VALUES
  ('AKD Securities', '00000000-0000-4000-8000-0000000000f1', 10),
  ('Alfalah CLSA Securities', '00000000-0000-4000-8000-0000000000f1', 10),
  ('Arif Habib Limited', '00000000-0000-4000-8000-0000000000f1', 10),
  ('BMA Capital Management', '00000000-0000-4000-8000-0000000000f1', 10),
  ('Foundation Securities', '00000000-0000-4000-8000-0000000000f1', 10),
  ('Insight Securities', '00000000-0000-4000-8000-0000000000f1', 10),
  ('Intermarket Securities', '00000000-0000-4000-8000-0000000000f1', 10),
  ('JS Global Capital', '00000000-0000-4000-8000-0000000000f1', 10),
  ('Next Capital', '00000000-0000-4000-8000-0000000000f1', 10),
  ('Optimus Capital Management', '00000000-0000-4000-8000-0000000000f1', 10),
  ('Topline Securities', '00000000-0000-4000-8000-0000000000f1', 10),
  ('Other', '00000000-0000-4000-8000-0000000000f1', 999)
ON CONFLICT (name) DO NOTHING;
