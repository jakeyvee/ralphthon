-- Seed Call-Check-Loop default trigger rules (PRD presets).
-- Idempotent: existing rule IDs are preserved.

insert into public.rules (id, name, patterns, recommended_action, enabled, is_preset)
values
  (
    'did_not_sleep',
    'Did not sleep',
    array['didn''t sleep','did not sleep','no sleep','couldn''t sleep','trouble sleeping'],
    'Ask about sleep tonight; check medication and routine.',
    true,
    true
  ),
  (
    'pain',
    'Pain',
    array['back was hurting','back hurts','in pain','my chest hurts','headache','stomach hurts','hurting'],
    'Check pain location and severity; consider clinic visit.',
    true,
    true
  ),
  (
    'fall_or_dizzy',
    'Fall or dizziness',
    array['fell down','i fell','dizzy','lightheaded','lost my balance'],
    'Check for injury; consider GP/clinic if recent fall.',
    true,
    true
  ),
  (
    'not_eating',
    'Not eating',
    array['haven''t eaten','no appetite','didn''t eat','skipping meals'],
    'Encourage hydration and a light meal; check fridge during next visit.',
    true,
    true
  ),
  (
    'loneliness',
    'Loneliness',
    array['feel lonely','feeling alone','no one to talk to','miss everyone'],
    'Plan a visit or call this week; consider community programs.',
    true,
    true
  ),
  (
    'medication_issue',
    'Medication issue',
    array['ran out of','forgot to take','missed my pills','out of medicine'],
    'Refill check; review medication list.',
    true,
    true
  )
on conflict (id) do nothing;
