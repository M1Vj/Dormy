-- Backfill legacy store contribution charge rows that were created with amount_pesos = 0.
DO $$
DECLARE
  updated_count integer := 0;
BEGIN
  WITH target_rows AS (
    SELECT
      le.id,
      le.metadata
    FROM ledger_entries le
    WHERE le.ledger = 'contributions'
      AND le.entry_type = 'charge'
      AND COALESCE(le.amount_pesos, 0) <= 0
      AND COALESCE((le.metadata->>'is_store')::boolean, false) = true
      AND jsonb_typeof(le.metadata->'store_items') = 'array'
      AND jsonb_array_length(le.metadata->'store_items') > 0
  ),
  computed_ranges AS (
    SELECT
      tr.id,
      MIN(
        GREATEST(
          0,
          COALESCE((item->>'price')::numeric, 0) +
          COALESCE(
            (
              SELECT SUM(
                COALESCE(
                  (
                    SELECT MIN(COALESCE((choice->>'price_adjustment')::numeric, 0))
                    FROM jsonb_array_elements(COALESCE(opt->'choices', '[]'::jsonb)) AS choice
                  ),
                  0
                )
              )
              FROM jsonb_array_elements(COALESCE(item->'options', '[]'::jsonb)) AS opt
            ),
            0
          )
        )
      ) AS min_price,
      MAX(
        GREATEST(
          0,
          COALESCE((item->>'price')::numeric, 0) +
          COALESCE(
            (
              SELECT SUM(
                COALESCE(
                  (
                    SELECT MAX(COALESCE((choice->>'price_adjustment')::numeric, 0))
                    FROM jsonb_array_elements(COALESCE(opt->'choices', '[]'::jsonb)) AS choice
                  ),
                  0
                )
              )
              FROM jsonb_array_elements(COALESCE(item->'options', '[]'::jsonb)) AS opt
            ),
            0
          )
        )
      ) AS max_price
    FROM target_rows tr
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tr.metadata->'store_items', '[]'::jsonb)) AS item
    GROUP BY tr.id
  ),
  updated AS (
    UPDATE ledger_entries le
    SET
      amount_pesos = cr.min_price,
      metadata = jsonb_set(
        jsonb_set(
          COALESCE(le.metadata, '{}'::jsonb),
          '{store_price_min_pesos}',
          to_jsonb(cr.min_price),
          true
        ),
        '{store_price_max_pesos}',
        to_jsonb(cr.max_price),
        true
      )
    FROM computed_ranges cr
    WHERE le.id = cr.id
      AND cr.min_price > 0
    RETURNING le.id
  )
  SELECT COUNT(*) INTO updated_count FROM updated;

  RAISE NOTICE 'Backfill complete. Updated store charge rows: %', updated_count;
END $$;
