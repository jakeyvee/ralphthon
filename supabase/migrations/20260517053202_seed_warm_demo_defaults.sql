-- seed_warm_demo_defaults.sql
insert into elder_config (
  elder_name, elder_phone, family_name,
  telegram_bot_token, telegram_chat_id, sms_recipients,
  daily_call_time_sgt, consent_acknowledged
)
select 'Auntie', '', 'Marcus', null, null, '{}', '08:30', false
where not exists (select 1 from elder_config);
