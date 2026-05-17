-- VOL-157: Re-seed default trigger rules to match PRD v0.2 verbatim.
-- Wipes existing rules (cascades to rule_evaluations) and inserts the new six.

delete from rules;

insert into rules (id, name, patterns, recommended_action, enabled, is_preset, updated_at) values
  ('pain', 'Pain', ARRAY['pain','hurting','ache','aching','sore','back hurts'], 'Call mum today to check the pain and whether she needs help.', true, true, now()),
  ('fall', 'Fall', ARRAY['fell','fall down','slipped','tripped'], 'Call immediately and confirm whether she is injured.', true, true, now()),
  ('dizzy', 'Dizzy', ARRAY['dizzy','lightheaded','faint','almost fainted'], 'Call immediately and check if she is safe sitting or lying down.', true, true, now()),
  ('did_not_eat', 'Didn''t eat', ARRAY['didn''t eat','did not eat','no appetite','skipped dinner','skipped breakfast'], 'Call mum today and check whether she has eaten.', true, true, now()),
  ('did_not_sleep', 'Didn''t sleep', ARRAY['didn''t sleep','did not sleep','couldn''t sleep','poor sleep','awake all night'], 'Call mum today to check how she is feeling.', true, true, now()),
  ('lonely', 'Lonely', ARRAY['lonely','no one to talk to','alone all day','very quiet at home'], 'Call mum today and arrange a family check-in.', true, true, now());
