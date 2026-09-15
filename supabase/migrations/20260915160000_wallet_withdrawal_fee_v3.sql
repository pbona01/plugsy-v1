-- Apply after wallet_transfers_withdrawals_v2. This changes only the
-- ₦1,000–₦9,999 withdrawal band from ₦25 to ₦50.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.reserve_wallet_withdrawal_v2(text,text,numeric,text)'::regprocedure)
    into definition;
  if definition is null then
    raise exception 'reserve_wallet_withdrawal_v2 is missing; apply the wallet v2 migration first';
  end if;
  if position('when p_amount < 10000 then 25' in definition) = 0 then
    raise exception 'unexpected withdrawal-fee definition; no fee change was made';
  end if;
  execute replace(definition, 'when p_amount < 10000 then 25', 'when p_amount < 10000 then 50');
end
$migration$;
