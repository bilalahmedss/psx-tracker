-- PSX 2026 holiday calendar (PKT dates).
-- "to_confirm": lunar dates (moon sighting) and any date not yet checked against
-- the PSX holiday notice. Change status to 'confirmed' once verified.
INSERT INTO public.market_holidays (date, name, status, note) VALUES
  ('2026-02-05', 'Kashmir Day', 'confirmed', 'PSX notice reported in press'),
  ('2026-03-20', 'Eid-ul-Fitr', 'to_confirm', 'Lunar; approximate'),
  ('2026-03-23', 'Pakistan Day / Eid-ul-Fitr', 'to_confirm', 'Eid part is lunar; approximate')
ON CONFLICT (date) DO NOTHING;
--> statement-breakpoint
INSERT INTO public.market_holidays (date, name, status, note) VALUES
  ('2026-05-01', 'Labour Day', 'confirmed', 'PSX notice reported in press'),
  ('2026-05-27', 'Eid-ul-Azha', 'to_confirm', 'Lunar; approximate'),
  ('2026-05-28', 'Eid-ul-Azha / Youm-e-Takbeer', 'to_confirm', 'Lunar; approximate'),
  ('2026-05-29', 'Eid-ul-Azha', 'to_confirm', 'Lunar; approximate'),
  ('2026-06-25', 'Ashura', 'to_confirm', 'Lunar; PSX notice reported 25-26 Jun'),
  ('2026-06-26', 'Ashura', 'to_confirm', 'Lunar; PSX notice reported 25-26 Jun'),
  ('2026-08-14', 'Independence Day', 'confirmed', 'PSX notice reported in press'),
  ('2026-08-26', 'Eid Milad-un-Nabi', 'to_confirm', 'Lunar; approximate'),
  ('2026-11-09', 'Iqbal Day', 'to_confirm', NULL),
  ('2026-12-25', 'Quaid-e-Azam Day / Christmas', 'to_confirm', NULL)
ON CONFLICT (date) DO NOTHING;
