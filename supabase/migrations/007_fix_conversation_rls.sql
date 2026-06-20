-- Fix infinite recursion in conversation_participants RLS policies.
-- Safe to re-run.

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
  );
$$;

drop policy if exists "Users view own conversations" on public.conversations;
create policy "Users view own conversations"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

drop policy if exists "Users view participants in their conversations" on public.conversation_participants;
create policy "Users view participants in their conversations"
  on public.conversation_participants for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Users view messages in their conversations" on public.messages;
create policy "Users view messages in their conversations"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Users send messages in their conversations" on public.messages;
create policy "Users send messages in their conversations"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

grant execute on function public.is_conversation_member(uuid) to authenticated;
