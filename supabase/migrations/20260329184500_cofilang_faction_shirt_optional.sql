update ledger_entries
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{is_optional}',
  'true'::jsonb,
  true
)
where dorm_id is not null
  and ledger = 'contributions'
  and coalesce(metadata->>'contribution_id', metadata->>'payable_batch_id') = '93f5eda4-67a8-422f-905d-dddba88ec75c';
