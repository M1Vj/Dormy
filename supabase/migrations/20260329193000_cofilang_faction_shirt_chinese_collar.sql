update ledger_entries
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{store_items}',
  '[
    {
      "id": "cf568c98-c8ac-42a2-b0ad-293373e8a9e4",
      "name": "ATHELETE Shirt",
      "price": 200,
      "options": [
        {
          "name": "Size",
          "choices": [
            { "label": "Submitted elsewhere", "priceAdjustment": 0 },
            { "label": "X-Small", "priceAdjustment": 0 },
            { "label": "Small", "priceAdjustment": 0 },
            { "label": "Medium", "priceAdjustment": 0 },
            { "label": "Large", "priceAdjustment": 0 },
            { "label": "X-Large", "priceAdjustment": 0 },
            { "label": "2X-Large", "priceAdjustment": 0 }
          ]
        }
      ]
    },
    {
      "id": "d2dd7324-f4da-460d-92dd-f1a6dd58af30",
      "name": "ATHELETE Shirt Chinese Collar",
      "price": 410,
      "options": [
        {
          "name": "Size",
          "choices": [
            { "label": "Submitted elsewhere", "priceAdjustment": 0 },
            { "label": "X-Small", "priceAdjustment": 0 },
            { "label": "Small", "priceAdjustment": 0 },
            { "label": "Medium", "priceAdjustment": 0 },
            { "label": "Large", "priceAdjustment": 0 },
            { "label": "X-Large", "priceAdjustment": 0 },
            { "label": "2X-Large", "priceAdjustment": 0 }
          ]
        }
      ]
    },
    {
      "id": "02ba9884-4733-4dee-8367-dc0be7ee09ff",
      "name": "GENERAL Shirt",
      "price": 250,
      "options": [
        {
          "name": "Size",
          "choices": [
            { "label": "Submitted elsewhere", "priceAdjustment": 0 },
            { "label": "X-Small", "priceAdjustment": 0 },
            { "label": "Small", "priceAdjustment": 0 },
            { "label": "Medium", "priceAdjustment": 0 },
            { "label": "Large", "priceAdjustment": 0 },
            { "label": "X-Large", "priceAdjustment": 0 },
            { "label": "2X-Large", "priceAdjustment": 0 }
          ]
        },
        {
          "name": "Variation",
          "choices": [
            { "label": "With_Sleeves", "priceAdjustment": 0 },
            { "label": "Without_Sleeves", "priceAdjustment": 0 }
          ]
        }
      ]
    }
  ]'::jsonb,
  true
)
where ledger = 'contributions'
  and coalesce(metadata->>'contribution_id', metadata->>'payable_batch_id') = '93f5eda4-67a8-422f-905d-dddba88ec75c'
  and coalesce(metadata->>'contribution_title', metadata->>'payable_label', note) = 'COFILANG Faction Shirt';
