-- Apply in a dedicated Supabase project. Private tables are never exposed via REST.
create schema if not exists wishbox_private;
revoke all on schema wishbox_private from public;
grant usage on schema wishbox_private to anon, authenticated;

create table wishbox_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table wishbox_private.settings (
  key text primary key,
  value jsonb not null
);
create table wishbox_private.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table wishbox_private.responses (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references wishbox_private.guests(id),
  attendance text not null check (attendance in ('yes','maybe','no')),
  party_size integer not null check (party_size between 0 and 6),
  wish text not null default '' check (length(wish) <= 1000),
  read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((attendance = 'no' and party_size = 0) or (attendance <> 'no' and party_size between 1 and 6))
);
alter table wishbox_private.admins enable row level security;
alter table wishbox_private.settings enable row level security;
alter table wishbox_private.guests enable row level security;
alter table wishbox_private.responses enable row level security;
revoke all on all tables in schema wishbox_private from public, anon, authenticated;

insert into wishbox_private.settings (key,value) values ('event',
  '{"name":"Sophia","birthYear":2000,"date":"2026-11-14","time":"18:30","timezone":"Bangkok (UTC+7)","location":"The Garden Terrace","address":"123 Celebration Lane, Bangkok","note":"Let''s make a wish, share some cake, and create memories worth keeping.","profileImage":""}'::jsonb);

create function wishbox_private.guest_json(g wishbox_private.guests)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object('id', g.id, 'name', g.name, 'enabled', g.enabled, 'createdAt', g.created_at);
$$;
create function wishbox_private.response_json(r wishbox_private.responses)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when r.id is null then null else jsonb_build_object(
    'id',r.id,'guestId',r.guest_id,'attendance',r.attendance,'partySize',r.party_size,
    'wish',r.wish,'read',r.read,'createdAt',r.created_at,'updatedAt',r.updated_at) end;
$$;

-- Privileged implementation has a pinned search_path and authorizes every admin path.
-- Guest access requires the random 128-bit invitation token; no roster query exists.
create function wishbox_private.request(p_path text, p_method text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g wishbox_private.guests;
  r wishbox_private.responses;
  event_value jsonb;
  token uuid;
  clean_name text;
  party integer;
  affected integer;
begin
  if p_path is null or p_method is null or p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'Invalid request.';
  end if;
  if octet_length(p_value::text) > 850000 then raise exception 'The photo or request is too large.'; end if;
  if p_path like '/api/admin/%' and not exists (
    select 1 from wishbox_private.admins where user_id = auth.uid()
  ) then raise exception 'Only the birthday host can access the admin panel.' using errcode = '42501'; end if;

  select value into event_value from wishbox_private.settings where key = 'event';
  if p_path = '/api/admin/state' and p_method = 'GET' then
    return jsonb_build_object('version',2,'event',event_value,
      'guests',(select coalesce(jsonb_agg(wishbox_private.guest_json(x) order by x.created_at,x.id),'[]'::jsonb) from wishbox_private.guests x),
      'responses',(select coalesce(jsonb_agg(wishbox_private.response_json(x) order by x.updated_at desc),'[]'::jsonb) from wishbox_private.responses x));
  elsif p_path = '/api/admin/guests' and p_method = 'POST' then
    clean_name := btrim(p_value->>'name');
    if jsonb_typeof(p_value->'name') <> 'string' or clean_name is null or length(clean_name) not between 1 and 80 then raise exception 'Check the guest name.'; end if;
    insert into wishbox_private.guests(name) values(clean_name) returning * into g;
    return jsonb_build_object('id',g.id);
  elsif p_path ~ '^/api/admin/guests/[0-9a-fA-F-]{36}$' and p_method = 'PATCH' then
    token := split_part(p_path,'/',5)::uuid;
    if p_value ? 'name' then
      clean_name := btrim(p_value->>'name');
      if jsonb_typeof(p_value->'name') <> 'string' or clean_name is null or length(clean_name) not between 1 and 80 then raise exception 'Check the guest name.'; end if;
      update wishbox_private.guests set name = clean_name where id = token;
    elsif jsonb_typeof(p_value->'enabled') = 'boolean' then
      update wishbox_private.guests set enabled = (p_value->>'enabled')::boolean where id = token;
    else raise exception 'Choose a name or invitation status.'; end if;
    get diagnostics affected = row_count;
    if affected = 0 then raise exception 'Guest not found.'; end if;
    return jsonb_build_object('saved',true);
  elsif p_path = '/api/admin/read-all' and p_method = 'POST' then
    update wishbox_private.responses set read = true;
    return jsonb_build_object('saved',true);
  elsif p_path ~ '^/api/admin/responses/[0-9a-fA-F-]{36}$' and p_method = 'PATCH' then
    if jsonb_typeof(p_value->'read') is distinct from 'boolean' then raise exception 'Choose a read status.'; end if;
    update wishbox_private.responses set read = (p_value->>'read')::boolean where id = split_part(p_path,'/',5)::uuid;
    get diagnostics affected = row_count;
    if affected = 0 then raise exception 'Response not found.'; end if;
    return jsonb_build_object('saved',true);
  elsif p_path = '/api/admin/event' and p_method = 'PATCH' then
    -- Whitelist every field; reject malformed or oversized values server-side.
    if jsonb_typeof(p_value->'name') is distinct from 'string' or length(btrim(p_value->>'name')) not between 1 and 80
      or jsonb_typeof(p_value->'location') is distinct from 'string' or length(btrim(p_value->>'location')) not between 1 and 120
      or jsonb_typeof(p_value->'address') is distinct from 'string' or length(btrim(p_value->>'address')) not between 1 and 240
      or jsonb_typeof(p_value->'timezone') is distinct from 'string' or length(btrim(p_value->>'timezone')) not between 1 and 60
      or jsonb_typeof(p_value->'note') is distinct from 'string' or length(p_value->>'note') > 400
      or jsonb_typeof(p_value->'date') is distinct from 'string' or (p_value->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(p_value->'time') is distinct from 'string' or (p_value->>'time') !~ '^([01]\d|2[0-3]):[0-5]\d$'
      or jsonb_typeof(p_value->'birthYear') is distinct from 'number' or (p_value->>'birthYear') !~ '^\d{4}$'
      or (p_value->>'birthYear')::integer not between 1900 and extract(year from now())::integer
      or jsonb_typeof(p_value->'profileImage') is distinct from 'string' or length(p_value->>'profileImage') > 820000
      or ((p_value->>'profileImage') <> '' and (p_value->>'profileImage') !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
    then raise exception 'Check the event details and photo.'; end if;
    if ((p_value->>'date')::date)::text <> p_value->>'date' then raise exception 'Check the event date.'; end if;
    event_value := jsonb_build_object('name',btrim(p_value->>'name'),'birthYear',(p_value->>'birthYear')::integer,
      'date',p_value->>'date','time',p_value->>'time','timezone',btrim(p_value->>'timezone'),
      'location',btrim(p_value->>'location'),'address',btrim(p_value->>'address'),'note',btrim(p_value->>'note'),
      'profileImage',p_value->>'profileImage');
    update wishbox_private.settings set value = event_value where key = 'event';
    return jsonb_build_object('saved',true);
  elsif p_path ~ '^/api/invites/[0-9a-fA-F-]{36}$' and p_method in ('GET','PUT') then
    token := split_part(p_path,'/',4)::uuid;
    -- Lock prevents an invitation being disabled concurrently with a submission.
    select * into g from wishbox_private.guests where id = token for share;
    if not found then raise exception 'Invitation not found. Please use the link from your host.'; end if;
    if p_method = 'GET' then
      if g.enabled then select * into r from wishbox_private.responses where guest_id = token; end if;
      return jsonb_build_object('event',event_value,'guest',wishbox_private.guest_json(g),'response',wishbox_private.response_json(r));
    end if;
    if not g.enabled then raise exception 'This invitation has been disabled. Please check with your host.'; end if;
    if coalesce(p_value->>'attendance','') not in ('yes','maybe','no') then raise exception 'Choose your RSVP status.'; end if;
    if jsonb_typeof(p_value->'wish') is distinct from 'string' or length(p_value->>'wish') > 1000 then raise exception 'Keep your wish under 1000 characters.'; end if;
    if p_value->>'attendance' = 'no' then party := 0;
    else
      if jsonb_typeof(p_value->'partySize') is distinct from 'number' or (p_value->>'partySize') !~ '^[1-6]$' then raise exception 'Choose between 1 and 6 people.'; end if;
      party := (p_value->>'partySize')::integer;
    end if;
    insert into wishbox_private.responses(guest_id,attendance,party_size,wish)
    values(token,p_value->>'attendance',party,btrim(p_value->>'wish'))
    on conflict(guest_id) do update set attendance = excluded.attendance,party_size = excluded.party_size,
      wish = excluded.wish,read = false,updated_at = clock_timestamp();
    return jsonb_build_object('saved',true);
  end if;
  raise exception 'This request could not be found.';
end;
$$;

-- Exposed wrapper runs as the caller. Only the protected private implementation
-- can access tables. Do not add wishbox_private to the API's exposed schemas.
create function public.wishbox_request(p_path text, p_method text default 'GET', p_value jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select wishbox_private.request(p_path,p_method,p_value);
$$;
revoke execute on all functions in schema wishbox_private from public, anon, authenticated;
grant execute on function wishbox_private.request(text,text,jsonb) to anon, authenticated;
revoke execute on function public.wishbox_request(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.wishbox_request(text,text,jsonb) to anon, authenticated;
