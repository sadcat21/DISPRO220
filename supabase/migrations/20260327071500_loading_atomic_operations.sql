CREATE OR REPLACE FUNCTION public.start_loading_session_atomic(
  p_worker_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_worker_id uuid;
  v_branch_id uuid;
  v_existing_session public.loading_sessions%ROWTYPE;
  v_new_session public.loading_sessions%ROWTYPE;
BEGIN
  v_actor_worker_id := public.get_worker_id();

  IF v_actor_worker_id IS NULL THEN
    RAISE EXCEPTION 'No active worker session';
  END IF;

  IF NOT (
    public.is_admin()
    OR public.is_branch_admin()
    OR public.get_user_role() IN ('warehouse_manager'::public.app_role, 'supervisor'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'You are not allowed to start loading sessions';
  END IF;

  SELECT branch_id
  INTO v_branch_id
  FROM public.workers
  WHERE id = p_worker_id;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Target worker branch is missing';
  END IF;

  SELECT *
  INTO v_existing_session
  FROM public.loading_sessions
  WHERE worker_id = p_worker_id
    AND status = 'open'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_exists', true,
      'session', row_to_json(v_existing_session)
    );
  END IF;

  INSERT INTO public.loading_sessions (
    worker_id,
    manager_id,
    branch_id,
    status,
    notes
  )
  VALUES (
    p_worker_id,
    v_actor_worker_id,
    v_branch_id,
    'open',
    p_notes
  )
  RETURNING *
  INTO v_new_session;

  RETURN jsonb_build_object(
    'ok', true,
    'already_exists', false,
    'session', row_to_json(v_new_session)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.quick_load_to_worker_atomic(
  p_target_worker_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_worker_id uuid;
  v_branch_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_notes text;
  v_pieces_per_box numeric;
  v_qty_rounded numeric;
  v_boxes numeric;
  v_piece_part numeric;
  v_total_load_pieces numeric;
  v_warehouse_row RECORD;
  v_worker_row RECORD;
  v_new_warehouse_pieces numeric;
  v_new_worker_pieces numeric;
BEGIN
  v_actor_worker_id := public.get_worker_id();

  IF v_actor_worker_id IS NULL THEN
    RAISE EXCEPTION 'No active worker session';
  END IF;

  IF NOT (
    public.is_admin()
    OR public.is_branch_admin()
    OR public.get_user_role() IN ('warehouse_manager'::public.app_role, 'supervisor'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'You are not allowed to load worker stock';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Load items are required';
  END IF;

  SELECT branch_id
  INTO v_branch_id
  FROM public.workers
  WHERE id = p_target_worker_id;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Target worker branch is missing';
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := COALESCE((v_item->>'quantity')::numeric, 0);
    v_notes := NULLIF(v_item->>'notes', '');

    IF v_product_id IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quick load item payload';
    END IF;

    SELECT COALESCE(p.pieces_per_box, 20), p.name
    INTO v_pieces_per_box, v_notes
    FROM public.products p
    WHERE p.id = v_product_id;

    v_qty_rounded := ROUND(v_quantity, 2);
    v_boxes := FLOOR(v_qty_rounded);
    v_piece_part := ROUND((v_qty_rounded - v_boxes) * 100);
    v_total_load_pieces := (v_boxes * v_pieces_per_box) + v_piece_part;

    SELECT
      ws.id,
      (
        FLOOR(ROUND(COALESCE(ws.quantity, 0)::numeric, 2)) * v_pieces_per_box +
        ROUND((ROUND(COALESCE(ws.quantity, 0)::numeric, 2) - FLOOR(ROUND(COALESCE(ws.quantity, 0)::numeric, 2))) * 100)
      ) AS total_pieces
    INTO v_warehouse_row
    FROM public.warehouse_stock ws
    WHERE ws.branch_id = v_branch_id
      AND ws.product_id = v_product_id
    FOR UPDATE;

    IF NOT FOUND OR v_warehouse_row.total_pieces < v_total_load_pieces THEN
      RAISE EXCEPTION 'Insufficient warehouse stock';
    END IF;

    v_new_warehouse_pieces := v_warehouse_row.total_pieces - v_total_load_pieces;

    UPDATE public.warehouse_stock
    SET
      quantity = FLOOR(v_new_warehouse_pieces / v_pieces_per_box) + MOD(v_new_warehouse_pieces, v_pieces_per_box) / 100.0,
      updated_at = now()
    WHERE id = v_warehouse_row.id;

    SELECT
      ws.id,
      (
        FLOOR(ROUND(COALESCE(ws.quantity, 0)::numeric, 2)) * v_pieces_per_box +
        ROUND((ROUND(COALESCE(ws.quantity, 0)::numeric, 2) - FLOOR(ROUND(COALESCE(ws.quantity, 0)::numeric, 2))) * 100)
      ) AS total_pieces
    INTO v_worker_row
    FROM public.worker_stock ws
    WHERE ws.worker_id = p_target_worker_id
      AND ws.product_id = v_product_id
    FOR UPDATE;

    IF FOUND THEN
      v_new_worker_pieces := v_worker_row.total_pieces + v_total_load_pieces;

      UPDATE public.worker_stock
      SET
        quantity = FLOOR(v_new_worker_pieces / v_pieces_per_box) + MOD(v_new_worker_pieces, v_pieces_per_box) / 100.0,
        updated_at = now()
      WHERE id = v_worker_row.id;
    ELSE
      INSERT INTO public.worker_stock (
        worker_id,
        product_id,
        branch_id,
        quantity,
        updated_at
      )
      VALUES (
        p_target_worker_id,
        v_product_id,
        v_branch_id,
        FLOOR(v_total_load_pieces / v_pieces_per_box) + MOD(v_total_load_pieces, v_pieces_per_box) / 100.0,
        now()
      );
    END IF;

    INSERT INTO public.stock_movements (
      product_id,
      branch_id,
      quantity,
      movement_type,
      status,
      created_by,
      worker_id,
      notes
    )
    VALUES (
      v_product_id,
      v_branch_id,
      FLOOR(v_total_load_pieces / v_pieces_per_box) + MOD(v_total_load_pieces, v_pieces_per_box) / 100.0,
      'load',
      'approved',
      v_actor_worker_id,
      p_target_worker_id,
      COALESCE(NULLIF(v_item->>'notes', ''), 'شحن سريع')
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.unload_worker_stock_atomic(
  p_worker_id uuid,
  p_unloading_details jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_worker_id uuid;
  v_branch_id uuid;
  v_detail jsonb;
  v_product_id uuid;
  v_system_qty numeric;
  v_return_qty numeric;
  v_remaining_qty numeric;
  v_pieces_per_box numeric;
  v_return_pieces numeric;
  v_worker_row RECORD;
  v_warehouse_row RECORD;
  v_new_worker_pieces numeric;
  v_new_warehouse_pieces numeric;
  v_unload_session_id uuid;
  v_is_full_unload boolean := true;
BEGIN
  v_actor_worker_id := public.get_worker_id();

  IF v_actor_worker_id IS NULL THEN
    RAISE EXCEPTION 'No active worker session';
  END IF;

  IF NOT (
    public.is_admin()
    OR public.is_branch_admin()
    OR public.get_user_role() IN ('warehouse_manager'::public.app_role, 'supervisor'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'You are not allowed to unload worker stock';
  END IF;

  IF p_unloading_details IS NULL OR jsonb_typeof(p_unloading_details) <> 'array' OR jsonb_array_length(p_unloading_details) = 0 THEN
    RAISE EXCEPTION 'Unloading details are required';
  END IF;

  SELECT branch_id
  INTO v_branch_id
  FROM public.workers
  WHERE id = p_worker_id;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Target worker branch is missing';
  END IF;

  FOR v_detail IN
    SELECT value
    FROM jsonb_array_elements(p_unloading_details)
  LOOP
    IF COALESCE((v_detail->>'return_qty')::numeric, 0) <= 0 THEN
      CONTINUE;
    END IF;

    IF COALESCE((v_detail->>'remaining_qty')::numeric, 0) > 0 THEN
      v_is_full_unload := false;
    END IF;
  END LOOP;

  INSERT INTO public.loading_sessions (
    worker_id,
    manager_id,
    branch_id,
    status,
    notes,
    completed_at,
    unloading_details
  )
  VALUES (
    p_worker_id,
    v_actor_worker_id,
    v_branch_id,
    'unloaded',
    CASE WHEN v_is_full_unload THEN 'تفريغ كلي للشاحنة' ELSE 'تفريغ جزئي للشاحنة' END,
    now(),
    p_unloading_details
  )
  RETURNING id INTO v_unload_session_id;

  FOR v_detail IN
    SELECT value
    FROM jsonb_array_elements(p_unloading_details)
  LOOP
    v_product_id := (v_detail->>'product_id')::uuid;
    v_system_qty := COALESCE((v_detail->>'system_qty')::numeric, 0);
    v_return_qty := COALESCE((v_detail->>'return_qty')::numeric, 0);
    v_remaining_qty := COALESCE((v_detail->>'remaining_qty')::numeric, 0);

    IF v_product_id IS NULL OR v_return_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(p.pieces_per_box, 20)
    INTO v_pieces_per_box
    FROM public.products p
    WHERE p.id = v_product_id;

    v_return_pieces :=
      (FLOOR(ROUND(v_return_qty, 2)) * v_pieces_per_box) +
      ROUND((ROUND(v_return_qty, 2) - FLOOR(ROUND(v_return_qty, 2))) * 100);

    SELECT
      ws.id,
      (
        FLOOR(ROUND(COALESCE(ws.quantity, 0)::numeric, 2)) * v_pieces_per_box +
        ROUND((ROUND(COALESCE(ws.quantity, 0)::numeric, 2) - FLOOR(ROUND(COALESCE(ws.quantity, 0)::numeric, 2))) * 100)
      ) AS total_pieces
    INTO v_worker_row
    FROM public.worker_stock ws
    WHERE ws.worker_id = p_worker_id
      AND ws.product_id = v_product_id
    FOR UPDATE;

    IF NOT FOUND OR v_worker_row.total_pieces < v_return_pieces THEN
      RAISE EXCEPTION 'Worker stock is insufficient for unload';
    END IF;

    v_new_worker_pieces := v_worker_row.total_pieces - v_return_pieces;

    UPDATE public.worker_stock
    SET
      quantity = FLOOR(v_new_worker_pieces / v_pieces_per_box) + MOD(v_new_worker_pieces, v_pieces_per_box) / 100.0,
      updated_at = now()
    WHERE id = v_worker_row.id;

    SELECT
      ws.id,
      (
        FLOOR(ROUND(COALESCE(ws.quantity, 0)::numeric, 2)) * v_pieces_per_box +
        ROUND((ROUND(COALESCE(ws.quantity, 0)::numeric, 2) - FLOOR(ROUND(COALESCE(ws.quantity, 0)::numeric, 2))) * 100)
      ) AS total_pieces
    INTO v_warehouse_row
    FROM public.warehouse_stock ws
    WHERE ws.branch_id = v_branch_id
      AND ws.product_id = v_product_id
    FOR UPDATE;

    IF FOUND THEN
      v_new_warehouse_pieces := v_warehouse_row.total_pieces + v_return_pieces;

      UPDATE public.warehouse_stock
      SET
        quantity = FLOOR(v_new_warehouse_pieces / v_pieces_per_box) + MOD(v_new_warehouse_pieces, v_pieces_per_box) / 100.0,
        updated_at = now()
      WHERE id = v_warehouse_row.id;
    ELSE
      INSERT INTO public.warehouse_stock (
        branch_id,
        product_id,
        quantity,
        updated_at
      )
      VALUES (
        v_branch_id,
        v_product_id,
        FLOOR(v_return_pieces / v_pieces_per_box) + MOD(v_return_pieces, v_pieces_per_box) / 100.0,
        now()
      );
    END IF;

    INSERT INTO public.loading_session_items (
      session_id,
      product_id,
      quantity,
      gift_quantity,
      surplus_quantity,
      previous_quantity,
      notes
    )
    VALUES (
      v_unload_session_id,
      v_product_id,
      v_return_qty,
      0,
      0,
      v_system_qty,
      'تفريغ'
    );

    INSERT INTO public.stock_movements (
      product_id,
      branch_id,
      quantity,
      movement_type,
      status,
      created_by,
      worker_id,
      notes
    )
    VALUES (
      v_product_id,
      v_branch_id,
      v_return_qty,
      'return',
      'approved',
      v_actor_worker_id,
      p_worker_id,
      'تفريغ من الشاحنة'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_unload_session_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.start_loading_session_atomic(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quick_load_to_worker_atomic(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unload_worker_stock_atomic(uuid, jsonb) TO authenticated;
