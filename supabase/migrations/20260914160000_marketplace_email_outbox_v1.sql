begin;
create table if not exists public.marketplace_email_outbox(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  kind text not null check(kind in ('receipt','refund','seller_release')),
  recipient text not null,
  payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  leased_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(order_id,kind)
);
alter table public.marketplace_email_outbox enable row level security;
revoke all on public.marketplace_email_outbox from anon,authenticated;
grant all on public.marketplace_email_outbox to service_role;
create index if not exists marketplace_email_outbox_due_idx on public.marketplace_email_outbox(next_attempt_at) where status in ('pending','sending');

create or replace function public.marketplace_enqueue_order_email_v1() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_kind text; v_recipient text;
begin
  if TG_OP='INSERT' then v_kind:='receipt';
  elsif new.payment_status='refunded' and old.payment_status<>'refunded' then v_kind:='refund';
  elsif new.funds_status='released' and old.funds_status<>'released' then v_kind:='seller_release';
  else return new; end if;
  select email into v_recipient from public.profiles where clerk_id=case when v_kind='seller_release' then new.seller_id else new.buyer_id end;
  insert into public.marketplace_email_outbox(order_id,kind,recipient,payload)
    values(new.id,v_kind,coalesce(v_recipient,''),jsonb_build_object('title',new.listing_snapshot->>'title','reference',new.order_reference,'amount',case when v_kind='seller_release' then new.seller_amount else new.amount end,'hold_expires_at',new.hold_expires_at))
    on conflict(order_id,kind) do nothing;
  return new;
end;
$$;
drop trigger if exists marketplace_order_email_v1 on public.marketplace_orders;
create trigger marketplace_order_email_v1 after insert or update of payment_status,funds_status on public.marketplace_orders for each row execute function public.marketplace_enqueue_order_email_v1();

create or replace function public.marketplace_claim_emails_v1(p_limit integer default 10) returns setof public.marketplace_email_outbox
language sql security definer set search_path=public,pg_catalog as $$
  with exhausted as (update public.marketplace_email_outbox set status='failed',last_error='EMAIL_LEASE_EXHAUSTED' where status='sending' and attempts>=8 and leased_at<now()-interval '5 minutes' returning id)
  update public.marketplace_email_outbox set status='sending',attempts=attempts+1,lease_token=gen_random_uuid(),leased_at=now()
  where id in(select id from public.marketplace_email_outbox where attempts<8 and
    ((status='pending' and next_attempt_at<=now()) or (status='sending' and leased_at<now()-interval '5 minutes'))
    order by next_attempt_at for update skip locked limit greatest(1,least(coalesce(p_limit,10),20))) returning *;
$$;
create or replace function public.marketplace_finish_email_v1(p_id uuid,p_lease uuid,p_message_id text,p_error text default null) returns boolean
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  update public.marketplace_email_outbox set status=case when p_message_id is not null then 'sent' when attempts>=8 then 'failed' else 'pending' end,
    provider_message_id=p_message_id,last_error=left(p_error,300),sent_at=case when p_message_id is not null then now() else null end,
    next_attempt_at=now()+interval '5 minutes',lease_token=null,leased_at=null where id=p_id and lease_token=p_lease and status='sending';
  return found;
end;
$$;
revoke all on function public.marketplace_enqueue_order_email_v1() from public,anon,authenticated;
revoke all on function public.marketplace_claim_emails_v1(integer) from public,anon,authenticated;
revoke all on function public.marketplace_finish_email_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_claim_emails_v1(integer) to service_role;
grant execute on function public.marketplace_finish_email_v1(uuid,uuid,text,text) to service_role;
commit;
