do $$
declare
  canonical_store_items jsonb := '[
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
  ]'::jsonb;
  athlete_cart jsonb := '[
    {
      "item_id": "cf568c98-c8ac-42a2-b0ad-293373e8a9e4",
      "quantity": 1,
      "options": [
        { "name": "Size", "value": "Submitted elsewhere", "price_adjustment": 0 }
      ],
      "subtotal": 200
    }
  ]'::jsonb;
  chinese_collar_cart jsonb := '[
    {
      "item_id": "d2dd7324-f4da-460d-92dd-f1a6dd58af30",
      "quantity": 1,
      "options": [
        { "name": "Size", "value": "Submitted elsewhere", "price_adjustment": 0 }
      ],
      "subtotal": 410
    }
  ]'::jsonb;
  general_sleeves_cart jsonb := '[
    {
      "item_id": "02ba9884-4733-4dee-8367-dc0be7ee09ff",
      "quantity": 1,
      "options": [
        { "name": "Size", "value": "Submitted elsewhere", "price_adjustment": 0 },
        { "name": "Variation", "value": "With_Sleeves", "price_adjustment": 0 }
      ],
      "subtotal": 250
    }
  ]'::jsonb;
begin
  update ledger_entries
  set
    voided_at = coalesce(voided_at, now()),
    void_reason = coalesce(void_reason, 'Superseded duplicate COFILANG Faction Shirt payment without cart details'),
    updated_at = now()
  where id in (
    '6e9ad2ad-25b1-462a-84db-24545d97da1f',
    '1d18aac1-3f51-4eff-bb85-62bf3bd3862d',
    '4d5c6507-d0ee-4ed3-96c3-cd6bc1461e59',
    '4be6ea50-024c-420a-b8df-0dd2e964f0e6',
    '9a7ba5f6-125e-4d20-80f7-9615c66a3abb',
    'f5d96474-3c55-4cb4-aa43-1a1984556840'
  );

  update ledger_entries
  set metadata = jsonb_set(
    jsonb_set(coalesce(metadata, '{}'::jsonb), '{store_items}', canonical_store_items, true),
    '{cart_items}',
    athlete_cart,
    true
  )
  where id in (
    '85141537-3606-4193-ae81-f7764794b912',
    '43509329-f5d6-430d-9204-1e0ce914c1cf',
    '96dc0284-db64-47f7-8ccd-da7ffc550883',
    '99312d82-8a3c-4ca3-ac88-5851f621e253',
    '09b2f108-eeb1-4549-950a-837df8339dc7',
    '79e2e8fd-c67a-4fe4-8ab4-31fa42597c57',
    '3bf103f6-16d6-4578-9fb6-0d83e3ab1665',
    '299d8a2b-14ce-4afb-9ce3-3400adef1ed8',
    '454068a8-d7b4-48d9-9c13-794b2b637d0f',
    '9bc563ef-1489-45ad-8a37-58d98ae1e31f',
    'd1f0b286-7bf7-45e2-8b44-a5f16c8f8632',
    'f7009dcd-0ee2-4a68-bd6a-881e4e705279',
    'e2d2909d-4dee-492d-bcfb-1c7ade198398',
    'ee2727cf-d771-446b-be2a-a099f3d37056'
  );

  update ledger_entries
  set metadata = jsonb_set(
    jsonb_set(coalesce(metadata, '{}'::jsonb), '{store_items}', canonical_store_items, true),
    '{cart_items}',
    chinese_collar_cart,
    true
  )
  where id in (
    '53e67afc-2dff-4b47-87b6-a31162b1ff5b',
    'a4f10c64-2117-4105-b608-b8765ca66875',
    '9c1d814d-45c8-4907-8d58-b4f285778463',
    '571567c7-0162-40cd-82b3-956e6125d50c',
    '370ccde0-ae10-4d32-a868-088b0d283a3b',
    '76137c74-269d-4e5e-acd0-380ea88825ed'
  );

  update ledger_entries
  set metadata = jsonb_set(
    jsonb_set(coalesce(metadata, '{}'::jsonb), '{store_items}', canonical_store_items, true),
    '{cart_items}',
    general_sleeves_cart,
    true
  )
  where id in (
    '19ea5455-00fc-4dce-9081-8f770d303a9f',
    'f17f1807-a050-4759-8e9c-496b87ecb7b6'
  );
end $$;
