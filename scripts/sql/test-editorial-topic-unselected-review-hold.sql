DO $probe$
DECLARE s text; rejected boolean;
BEGIN
  CREATE TEMP TABLE editorial_topic_hold_probe (LIKE public.editorial_topic_proposals INCLUDING CONSTRAINTS INCLUDING DEFAULTS) ON COMMIT DROP;
  INSERT INTO editorial_topic_hold_probe(id,target_date,status,options,notification_kind,notification_status)
  VALUES ('TP-20990101','2099-01-01','TOPIC_SELECTION_WAITING','[{}, {}, {}]'::jsonb,'TOPICS','PENDING');
  UPDATE editorial_topic_hold_probe SET status='REVIEW_REQUIRED',notification_kind='BLOCKED',last_error='FRESH_DAILY_POOL_INSUFFICIENT_NO_OLD_RESEND' WHERE id='TP-20990101';
  IF NOT EXISTS(SELECT 1 FROM editorial_topic_hold_probe WHERE status='REVIEW_REQUIRED' AND selected_candidate_id IS NULL) THEN RAISE EXCEPTION 'unselected safe hold missing'; END IF;
  FOREACH s IN ARRAY ARRAY['INTERVIEW_WAITING','APPROVED','QUEUE_CREATED'] LOOP
    rejected := false;
    BEGIN
      UPDATE editorial_topic_hold_probe SET status=s WHERE id='TP-20990101';
    EXCEPTION WHEN check_violation THEN rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'missing selection accepted for %',s; END IF;
  END LOOP;
  UPDATE editorial_topic_hold_probe SET selected_candidate_id='EXPLICIT-OWNER-SELECTION' WHERE id='TP-20990101';
  FOREACH s IN ARRAY ARRAY['INTERVIEW_WAITING','APPROVED','QUEUE_CREATED'] LOOP
    UPDATE editorial_topic_hold_probe SET status=s WHERE id='TP-20990101';
  END LOOP;
  rejected := false;
  BEGIN UPDATE editorial_topic_hold_probe SET options='[{}]'::jsonb WHERE id='TP-20990101'; EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'three-option constraint weakened'; END IF;
END $probe$;
