import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Guest tokens, host authorization, inbox updates and disabled invitations', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
      $$;
      grant usage on schema public,auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;`);
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/202610120001_wishbox.sql', import.meta.url),'utf8'));
    const owner = 'fbb4c750-b4db-444f-8e8f-98b36c230907';
    const stranger = '5952735d-ea69-4677-88e7-1f6877c4e989';
    await db.query('insert into auth.users(id) values($1),($2)',[owner,stranger]);
    await db.query('insert into wishbox_private.admins(user_id) values($1)',[owner]);
    async function identity(role,id='') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
      await db.exec(`set role ${role}`);
    }
    async function call(path,method='GET',value={}) {
      return (await db.query('select public.wishbox_request($1,$2,$3::jsonb) as result',[path,method,JSON.stringify(value)])).rows[0].result;
    }
    await identity('anon');
    await assert.rejects(call('/api/admin/state'),/Only the birthday host/);
    await assert.rejects(db.query('select * from wishbox_private.guests'),/permission denied/);
    await identity('authenticated',stranger);
    await assert.rejects(call('/api/admin/guests','POST',{name:'Fake guest'}),/Only the birthday host/);
    await identity('authenticated',owner);
    const alice = (await call('/api/admin/guests','POST',{name:'Alice'})).id;
    const bob = (await call('/api/admin/guests','POST',{name:'Bob'})).id;
    const state = await call('/api/admin/state');
    assert.equal(state.guests.length,2);
    await identity('anon');
    await assert.rejects(call('/api/invites/00000000-0000-4000-8000-000000000000'),/Invitation not found/);
    const invite = await call('/api/invites/'+alice);
    assert.equal(invite.guest.name,'Alice');
    assert.equal(invite.guests,undefined);
    assert.equal(invite.response,null);
    await assert.rejects(call('/api/invites/'+alice,'PUT',{attendance:'yes',partySize:7,wish:''}),/between 1 and 6/);
    await assert.rejects(call('/api/invites/'+alice,'PUT',{attendance:'yes',partySize:1,wish:'a'.repeat(1001)}),/1000/);
    await call('/api/invites/'+alice,'PUT',{attendance:'yes',partySize:2,wish:'Happy birthday!'});
    assert.equal((await call('/api/invites/'+alice)).response.wish,'Happy birthday!');
    assert.equal((await call('/api/invites/'+bob)).response,null);
    await identity('authenticated',owner);
    let inbox = await call('/api/admin/state');
    assert.equal(inbox.responses.length,1);
    const responseId = inbox.responses[0].id;
    await call('/api/admin/responses/'+responseId,'PATCH',{read:true});
    assert.equal((await call('/api/admin/state')).responses[0].read,true);
    await identity('anon');
    await call('/api/invites/'+alice,'PUT',{attendance:'no',partySize:5,wish:'Sending love!'});
    await identity('authenticated',owner);
    inbox = await call('/api/admin/state');
    assert.equal(inbox.responses.length,1);
    assert.equal(inbox.responses[0].read,false);
    assert.equal(inbox.responses[0].partySize,0);
    await call('/api/admin/guests/'+alice,'PATCH',{name:'Alicia'});
    await call('/api/admin/guests/'+alice,'PATCH',{enabled:false});
    await identity('anon');
    const disabled = await call('/api/invites/'+alice);
    assert.equal(disabled.guest.enabled,false);
    assert.equal(disabled.response,null);
    await assert.rejects(call('/api/invites/'+alice,'PUT',{attendance:'yes',partySize:1,wish:'test'}),/disabled/);
    await identity('authenticated',owner);
    assert.equal((await call('/api/admin/state')).responses[0].wish,'Sending love!');
    await assert.rejects(call('/api/admin/event','PATCH',{...state.event,date:'2026-02-30'}),/date/);
    await assert.rejects(call('/api/admin/event','PATCH',{...state.event,profileImage:'https://bad.example/image.svg'}),/details/);
    await assert.rejects(call('/api/admin/event','PATCH',{...state.event,timezone:null}),/details/);
    await call('/api/admin/event','PATCH',{...state.event,name:'Maya',date:'2027-01-14'});
    assert.equal((await call('/api/admin/state')).event.name,'Maya');
    await call('/api/admin/read-all','POST');
    assert.equal((await call('/api/admin/state')).responses[0].read,true);
  } finally { await db.close(); }
});
