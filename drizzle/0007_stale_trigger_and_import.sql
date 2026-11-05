-- Mark a portfolio's snapshots stale whenever anything that feeds them changes.
-- SECURITY DEFINER so it only flips the flag (no updated_at bump, no RLS round trip);
-- it can't be called directly.
CREATE OR REPLACE FUNCTION public.mark_snapshots_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := coalesce(NEW.portfolio_id, OLD.portfolio_id);
BEGIN
  UPDATE public.portfolios SET snapshots_stale = true WHERE id = v_id AND NOT snapshots_stale;
  IF TG_OP = 'UPDATE' AND NEW.portfolio_id IS DISTINCT FROM OLD.portfolio_id THEN
    UPDATE public.portfolios SET snapshots_stale = true WHERE id = OLD.portfolio_id AND NOT snapshots_stale;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.mark_snapshots_stale() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER transactions_mark_snapshots_stale AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.mark_snapshots_stale();
--> statement-breakpoint
CREATE TRIGGER dividend_receipts_mark_snapshots_stale AFTER INSERT OR UPDATE OR DELETE ON public.dividend_receipts
  FOR EACH ROW EXECUTE FUNCTION public.mark_snapshots_stale();
--> statement-breakpoint
CREATE TRIGGER cash_entries_mark_snapshots_stale AFTER INSERT OR UPDATE OR DELETE ON public.cash_entries
  FOR EACH ROW EXECUTE FUNCTION public.mark_snapshots_stale();
--> statement-breakpoint

-- The portfolios updated_at trigger shouldn't fire for the stale flag alone.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'portfolios'
     AND (to_jsonb(NEW) - 'snapshots_stale' - 'updated_at') = (to_jsonb(OLD) - 'snapshots_stale' - 'updated_at') THEN
    RETURN NEW;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- CSV import: all rows or none. SECURITY INVOKER, so RLS checks every insert.
CREATE OR REPLACE FUNCTION public.import_portfolio_rows(
  p_portfolio_id uuid,
  p_trades jsonb,
  p_dividends jsonb,
  p_cash jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_trades int := 0;
  v_dividends int := 0;
  v_cash int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.portfolios WHERE id = p_portfolio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portfolio not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.transactions (portfolio_id, symbol, type, qty, price, fee, tax, other_charges, trade_date, affects_cash, note, source)
  SELECT p_portfolio_id, r.symbol, r.type::public.txn_type, r.qty, r.price, r.fee, r.tax, r.other_charges, r.trade_date, r.affects_cash, r.note, 'csv'
  FROM jsonb_to_recordset(coalesce(p_trades, '[]'::jsonb)) AS r(
    symbol text, type text, qty numeric, price numeric, fee numeric, tax numeric, other_charges numeric,
    trade_date date, affects_cash boolean, note text
  );
  GET DIAGNOSTICS v_trades = ROW_COUNT;

  INSERT INTO public.dividend_receipts (portfolio_id, symbol, shares, dps, gross, wht, zakat_deducted, net, paid_on, affects_cash, note, source)
  SELECT p_portfolio_id, r.symbol, r.shares, r.dps, r.gross, r.wht, r.zakat, r.net, r.paid_on, r.affects_cash, r.note, 'csv'
  FROM jsonb_to_recordset(coalesce(p_dividends, '[]'::jsonb)) AS r(
    symbol text, shares numeric, dps numeric, gross numeric, wht numeric, zakat numeric, net numeric,
    paid_on date, affects_cash boolean, note text
  );
  GET DIAGNOSTICS v_dividends = ROW_COUNT;

  INSERT INTO public.cash_entries (portfolio_id, type, amount, date, note)
  SELECT p_portfolio_id, r.type::public.cash_entry_type, r.amount, r.date, r.note
  FROM jsonb_to_recordset(coalesce(p_cash, '[]'::jsonb)) AS r(type text, amount numeric, date date, note text);
  GET DIAGNOSTICS v_cash = ROW_COUNT;

  RETURN jsonb_build_object('trades', v_trades, 'dividends', v_dividends, 'cash', v_cash);
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.import_portfolio_rows(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.import_portfolio_rows(uuid, jsonb, jsonb, jsonb) TO authenticated;
