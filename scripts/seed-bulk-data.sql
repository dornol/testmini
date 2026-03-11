-- ============================================================
-- Bulk Test Data Seed Script for testmini
-- Generates ~2500 test cases + proportional related data
-- Run: psql $DATABASE_URL -f scripts/seed-bulk-data.sql
-- ============================================================

BEGIN;

-- ── Ensure base users exist ──────────────────────────────

INSERT INTO "user" (id, name, email, email_verified, role, approved, created_at, updated_at)
VALUES
  ('user_alice',   'Alice Kim',    'alice@example.com',   true, 'admin', true, NOW() - INTERVAL '180 days', NOW()),
  ('user_bob',     'Bob Park',     'bob@example.com',     true, 'user',  true, NOW() - INTERVAL '170 days', NOW()),
  ('user_carol',   'Carol Lee',    'carol@example.com',   true, 'user',  true, NOW() - INTERVAL '160 days', NOW()),
  ('user_dave',    'Dave Choi',    'dave@example.com',    true, 'user',  true, NOW() - INTERVAL '150 days', NOW()),
  ('user_eve',     'Eve Jung',     'eve@example.com',     true, 'user',  true, NOW() - INTERVAL '140 days', NOW()),
  ('user_frank',   'Frank Yoon',   'frank@example.com',   true, 'user',  true, NOW() - INTERVAL '130 days', NOW()),
  ('user_grace',   'Grace Han',    'grace@example.com',   true, 'user',  true, NOW() - INTERVAL '120 days', NOW()),
  ('user_henry',   'Henry Shin',   'henry@example.com',   true, 'user',  true, NOW() - INTERVAL '110 days', NOW()),
  ('user_iris',    'Iris Moon',    'iris@example.com',    true, 'user',  true, NOW() - INTERVAL '100 days', NOW()),
  ('user_jake',    'Jake Lim',     'jake@example.com',    true, 'user',  true, NOW() - INTERVAL '90 days',  NOW())
ON CONFLICT (email) DO NOTHING;

INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
VALUES
  ('acc_alice', 'user_alice', 'credential', 'user_alice', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_bob',   'user_bob',   'credential', 'user_bob',   '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_carol', 'user_carol', 'credential', 'user_carol', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_dave',  'user_dave',  'credential', 'user_dave',  '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_eve',   'user_eve',   'credential', 'user_eve',   '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_frank', 'user_frank', 'credential', 'user_frank', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_grace', 'user_grace', 'credential', 'user_grace', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_henry', 'user_henry', 'credential', 'user_henry', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_iris',  'user_iris',  'credential', 'user_iris',  '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_jake',  'user_jake',  'credential', 'user_jake',  '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ── Helper arrays ────────────────────────────────────────

DO $$
DECLARE
  v_users text[] := ARRAY['user_alice','user_bob','user_carol','user_dave','user_eve','user_frank','user_grace','user_henry','user_iris','user_jake'];
  v_qa_users text[] := ARRAY['user_bob','user_carol','user_dave','user_frank','user_grace','user_iris'];
  v_priorities text[] := ARRAY['LOW','MEDIUM','MEDIUM','MEDIUM','HIGH','HIGH','CRITICAL'];
  v_approval text[] := ARRAY['DRAFT','DRAFT','APPROVED','APPROVED','APPROVED','APPROVED','APPROVED'];
  v_tag_colors text[] := ARRAY['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#6366f1'];
  v_group_colors text[] := ARRAY['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#6366f1','#84cc16','#a855f7'];
  v_exec_statuses text[] := ARRAY['PASS','PASS','PASS','PASS','PASS','PASS','PASS','FAIL','FAIL','BLOCKED','SKIPPED','PENDING'];
  v_envs text[][] := ARRAY[
    ARRAY['Development','Staging','Production','QA'],
    ARRAY['Sandbox','Staging','Production','_none_'],
    ARRAY['Dev','QA','Staging','Production'],
    ARRAY['Local','Dev','Staging','Production'],
    ARRAY['Dev','QA','UAT','Production']
  ];

  -- Project definitions
  v_project_names text[] := ARRAY[
    'E-Commerce Platform',
    'Payment Gateway',
    'Mobile App API',
    'Admin Dashboard',
    'Notification Service',
    'Analytics Engine',
    'User Management',
    'Content Management System'
  ];
  v_project_descs text[] := ARRAY[
    'Online shopping platform QA - covers product catalog, cart, checkout, and order management',
    'Payment processing service tests - card payments, refunds, 3DS, recurring billing',
    'REST API for mobile applications - auth, products, orders, push notifications',
    'Internal admin dashboard testing - user management, reports, system config',
    'Push/Email/SMS notification service - delivery, templates, scheduling, preferences',
    'Data analytics and reporting engine - dashboards, exports, real-time metrics',
    'User authentication and authorization - SSO, RBAC, profile management, audit',
    'Headless CMS for web and mobile - content CRUD, media, versioning, publishing'
  ];

  -- Module/group definitions per project type (all 8 elements)
  v_modules text[][] := ARRAY[
    ARRAY['User Authentication','Product Catalog','Shopping Cart','Checkout','Order Management','Wishlist','Reviews & Ratings','Search'],
    ARRAY['Card Payments','Bank Transfer','Digital Wallets','Refunds','Recurring Billing','Fraud Detection','Settlement','Webhooks'],
    ARRAY['Auth Endpoints','Product Endpoints','Order Endpoints','User Profile','Push Notifications','File Upload','Pagination & Filtering','Rate Limiting'],
    ARRAY['User Management','Role & Permissions','Dashboard Widgets','System Config','Audit Logs','Reports','Bulk Operations','Import/Export'],
    ARRAY['Email Notifications','Push Notifications','SMS Notifications','Templates','Scheduling','Delivery Status','Preferences','Unsubscribe'],
    ARRAY['Dashboard','Charts & Graphs','Data Export','Filters','Real-time Updates','Scheduled Reports','Custom Metrics','Data Retention'],
    ARRAY['Login & Registration','SSO Integration','Role Based Access','Profile Management','Password Policy','Session Management','Two-Factor Auth','User Directory'],
    ARRAY['Content CRUD','Media Library','Content Versioning','Publishing Workflow','SEO Settings','Localization','API Access','Content Search']
  ];

  -- Tag names per project (all 8 elements)
  v_tags text[][] := ARRAY[
    ARRAY['Smoke','Regression','UI','API','Performance','Security','Mobile','Accessibility'],
    ARRAY['Smoke','Regression','Security','Integration','PCI','Load','API','Webhook'],
    ARRAY['Smoke','Regression','API','Auth','Performance','Contract','E2E','Mobile'],
    ARRAY['Smoke','Regression','UI','RBAC','Performance','Accessibility','Integration','E2E'],
    ARRAY['Smoke','Regression','Integration','Email','Push','SMS','Template','Scheduling'],
    ARRAY['Smoke','Regression','UI','API','Performance','Export','Real-time','Dashboard'],
    ARRAY['Smoke','Regression','Security','SSO','RBAC','2FA','API','Integration'],
    ARRAY['Smoke','Regression','API','UI','SEO','Media','Localization','Publishing']
  ];

  -- Test case title templates
  v_tc_verbs text[] := ARRAY['Verify','Validate','Check','Test','Ensure','Confirm'];
  v_tc_actions text[] := ARRAY[
    'creation with valid data',
    'creation with invalid data',
    'update with partial fields',
    'deletion and cascade',
    'list with pagination',
    'list with sorting',
    'list with filtering',
    'search by keyword',
    'search with special characters',
    'access with valid permissions',
    'access denied without permissions',
    'concurrent modification handling',
    'duplicate detection',
    'empty state display',
    'error message display',
    'loading state behavior',
    'cache invalidation',
    'timeout handling',
    'retry on failure',
    'bulk operation processing',
    'export to CSV',
    'import from file',
    'validation error messages',
    'field length limits',
    'special character handling',
    'unicode support',
    'date range filtering',
    'status transition rules',
    'notification trigger',
    'audit log generation',
    'API response format',
    'API error codes',
    'rate limit enforcement',
    'session expiry handling',
    'browser back button behavior',
    'responsive layout on tablet',
    'responsive layout on mobile',
    'keyboard navigation',
    'screen reader compatibility',
    'performance under load'
  ];

  v_step_actions text[] := ARRAY[
    'Navigate to the target page',
    'Click the action button',
    'Enter data in the form fields',
    'Submit the form',
    'Verify the success message',
    'Check the updated list',
    'Verify the database state',
    'Check API response',
    'Validate error handling',
    'Confirm notification sent',
    'Verify audit log entry',
    'Check permissions enforcement',
    'Test with boundary values',
    'Verify loading indicator',
    'Check empty state message',
    'Validate field constraints',
    'Test concurrent access',
    'Verify cache behavior',
    'Check redirect behavior',
    'Validate sorting order'
  ];

  v_step_expected text[] := ARRAY[
    'Page loads within 2 seconds',
    'Action completes successfully',
    'Form accepts valid input',
    'Data saved to database',
    'Success message displayed',
    'List reflects changes',
    'Records match expected state',
    'Response returns 200 OK',
    'Error message is user-friendly',
    'Notification delivered',
    'Audit log contains entry',
    'Unauthorized access blocked',
    'Boundary values handled correctly',
    'Loading spinner shown/hidden',
    'Empty state message displayed',
    'Invalid input rejected with message',
    'No data corruption',
    'Cache updated properly',
    'User redirected to correct page',
    'Items sorted correctly'
  ];

  v_project_id int;
  v_team_id int;
  v_group_id int;
  v_tc_id int;
  v_version_id int;
  v_run_id int;
  v_exec_id int;
  v_tag_id int;
  v_plan_id int;
  v_release_id int;
  v_req_id int;
  v_suite_id int;
  v_session_id int;

  v_tc_count int := 0;
  v_total_tc int;
  v_tcs_per_group int;
  v_key_prefix text;
  v_creator text;
  v_priority text;
  v_title text;
  v_steps jsonb;
  v_step_count int;
  v_steps_arr jsonb;
  v_created_at timestamp;
  v_run_name text;
  v_run_status text;
  v_run_env text;
  v_exec_status text;
  v_num_runs int;
  v_run_tcs int;
  v_tc_ids_for_project int[];
  v_random_tc int;

  i int;
  j int;
  k int;
  m int;
BEGIN
  -- ── Create Teams ─────────────────────────────────────
  INSERT INTO team (name, description, created_by, created_at, updated_at)
  VALUES
    ('QA Team Alpha',   'Primary QA team',           'user_alice', NOW() - INTERVAL '180 days', NOW()),
    ('QA Team Beta',    'Secondary QA team',         'user_alice', NOW() - INTERVAL '170 days', NOW()),
    ('Backend QA',      'Backend testing team',      'user_alice', NOW() - INTERVAL '160 days', NOW()),
    ('Platform Team',   'Platform infrastructure',   'user_alice', NOW() - INTERVAL '150 days', NOW())
  ON CONFLICT DO NOTHING;

  -- Team members
  FOR i IN 1..4 LOOP
    BEGIN
      INSERT INTO team_member (team_id, user_id, role, joined_at)
      SELECT
        (SELECT id FROM team ORDER BY id LIMIT 1 OFFSET i-1),
        unnest(v_users[1 + ((i-1)*2) : i*2 + 1]),
        CASE WHEN generate_series = 1 THEN 'OWNER'::team_role WHEN generate_series = 2 THEN 'ADMIN'::team_role ELSE 'MEMBER'::team_role END,
        NOW() - INTERVAL '150 days'
      FROM generate_series(1, 3);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  -- ── Create 8 Projects ───────────────────────────────
  FOR i IN 1..8 LOOP
    INSERT INTO project (name, description, active, require_signoff, team_id, created_by, created_at, updated_at)
    VALUES (
      v_project_names[i],
      v_project_descs[i],
      true,
      (i % 3 = 0),
      (SELECT id FROM team ORDER BY id LIMIT 1 OFFSET (i-1) % 4),
      'user_alice',
      NOW() - INTERVAL '180 days' + (i * INTERVAL '5 days'),
      NOW()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── Project Members ─────────────────────────────────
  FOR v_project_id IN (SELECT id FROM project ORDER BY id) LOOP
    FOR i IN 1..array_length(v_users, 1) LOOP
      BEGIN
        INSERT INTO project_member (project_id, user_id, role, created_at)
        VALUES (
          v_project_id,
          v_users[i],
          CASE
            WHEN i = 1 THEN 'PROJECT_ADMIN'
            WHEN i <= 4 THEN 'QA'
            WHEN i <= 7 THEN 'DEV'
            ELSE 'VIEWER'
          END::project_role,
          NOW() - INTERVAL '150 days'
        );
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;
  END LOOP;

  -- ── Priority & Environment Config ──────────────────
  FOR v_project_id IN (SELECT id FROM project ORDER BY id) LOOP
    BEGIN
      INSERT INTO priority_config (project_id, name, color, position, is_default, created_by)
      VALUES
        (v_project_id, 'Low',      '#22c55e', 0, false, 'user_alice'),
        (v_project_id, 'Medium',   '#f59e0b', 1, true,  'user_alice'),
        (v_project_id, 'High',     '#f97316', 2, false, 'user_alice'),
        (v_project_id, 'Critical', '#ef4444', 3, false, 'user_alice');
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    -- Environments
    DECLARE
      v_env_idx int := ((v_project_id - 1) % 5) + 1;
      v_env_colors text[] := ARRAY['#6366f1','#22c55e','#f59e0b','#ef4444'];
    BEGIN
      FOR j IN 1..4 LOOP
        IF v_envs[v_env_idx][j] IS NOT NULL AND v_envs[v_env_idx][j] != '_none_' THEN
          BEGIN
            INSERT INTO environment_config (project_id, name, color, position, is_default, created_by)
            VALUES (v_project_id, v_envs[v_env_idx][j], v_env_colors[j], j-1, (j=1), 'user_alice');
          EXCEPTION WHEN unique_violation THEN NULL;
          END;
        END IF;
      END LOOP;
    END;
  END LOOP;

  -- ── Tags per project ───────────────────────────────
  FOR v_project_id IN (SELECT id FROM project ORDER BY id) LOOP
    DECLARE
      v_proj_idx int := ((v_project_id - 1) % 8) + 1;
    BEGIN
      FOR j IN 1..8 LOOP
        BEGIN
          INSERT INTO tag (project_id, name, color, created_by)
          VALUES (v_project_id, v_tags[v_proj_idx][j], v_tag_colors[j], 'user_alice');
        EXCEPTION WHEN unique_violation THEN NULL;
        END;
      END LOOP;
    END;
  END LOOP;

  -- ── Groups & Test Cases per project ─────────────────
  -- Target: ~2500 total test cases
  -- Projects 1-2: 500 each, 3-4: 350 each, 5-8: 200 each = 2500

  FOR v_project_id IN (SELECT id FROM project ORDER BY id) LOOP
    DECLARE
      v_proj_offset int := v_project_id - (SELECT MIN(id) FROM project);
      v_proj_idx int := (v_proj_offset % 8) + 1;
      v_module_count int := 8;
    BEGIN
      -- Determine TC count for this project
      IF v_proj_offset < 2 THEN
        v_total_tc := 500;
      ELSIF v_proj_offset < 4 THEN
        v_total_tc := 350;
      ELSE
        v_total_tc := 200;
      END IF;

      v_tcs_per_group := v_total_tc / v_module_count;
      v_key_prefix := CASE v_proj_offset
        WHEN 0 THEN 'EC'
        WHEN 1 THEN 'PAY'
        WHEN 2 THEN 'API'
        WHEN 3 THEN 'ADM'
        WHEN 4 THEN 'NTF'
        WHEN 5 THEN 'ANL'
        WHEN 6 THEN 'USR'
        WHEN 7 THEN 'CMS'
        ELSE 'TC'
      END;

      v_tc_ids_for_project := ARRAY[]::int[];

      -- Create groups and test cases
      FOR j IN 1..v_module_count LOOP
        -- Create group
        BEGIN
          INSERT INTO test_case_group (project_id, name, sort_order, color, created_by)
          VALUES (v_project_id, v_modules[v_proj_idx][j], j-1, v_group_colors[j], 'user_alice')
          RETURNING id INTO v_group_id;
        EXCEPTION WHEN unique_violation THEN
          SELECT id INTO v_group_id FROM test_case_group
          WHERE project_id = v_project_id AND name = v_modules[v_proj_idx][j];
        END;

        -- Create test cases in this group
        FOR k IN 1..v_tcs_per_group LOOP
          v_tc_count := v_tc_count + 1;
          v_creator := v_qa_users[1 + ((v_tc_count - 1) % array_length(v_qa_users, 1))];
          v_priority := v_priorities[1 + ((v_tc_count * 7) % array_length(v_priorities, 1))];
          v_created_at := NOW() - (random() * INTERVAL '120 days');

          -- Generate title
          v_title := v_tc_verbs[1 + (v_tc_count % array_length(v_tc_verbs, 1))] || ' ' ||
                     lower(v_modules[v_proj_idx][j]) || ' ' ||
                     v_tc_actions[1 + ((v_tc_count * 3 + k) % array_length(v_tc_actions, 1))];

          -- Generate steps (2-5 steps)
          v_step_count := 2 + (v_tc_count % 4);
          v_steps_arr := '[]'::jsonb;
          FOR m IN 1..v_step_count LOOP
            v_steps_arr := v_steps_arr || jsonb_build_array(jsonb_build_object(
              'order', m,
              'action', v_step_actions[1 + ((v_tc_count + m) % array_length(v_step_actions, 1))],
              'expected', v_step_expected[1 + ((v_tc_count + m * 3) % array_length(v_step_expected, 1))]
            ));
          END LOOP;

          -- Insert test case
          INSERT INTO test_case (project_id, key, automation_key, group_id, sort_order, approval_status, retest_needed, created_by, created_at)
          VALUES (
            v_project_id,
            v_key_prefix || '-' || lpad(((j-1) * v_tcs_per_group + k)::text, 4, '0'),
            CASE WHEN random() > 0.3 THEN 'test_' || lower(replace(v_modules[v_proj_idx][j], ' ', '_')) || '_' || k ELSE NULL END,
            v_group_id,
            k - 1,
            v_approval[1 + (v_tc_count % array_length(v_approval, 1))],
            (random() < 0.08),
            v_creator,
            v_created_at
          )
          RETURNING id INTO v_tc_id;

          -- Insert version
          INSERT INTO test_case_version (test_case_id, version_no, title, precondition, steps, step_format, expected_result, priority, updated_by, created_at)
          VALUES (
            v_tc_id,
            1,
            v_title,
            CASE WHEN random() > 0.4 THEN 'User is authenticated and has appropriate permissions' ELSE NULL END,
            v_steps_arr,
            CASE WHEN v_proj_idx = 3 AND random() > 0.5 THEN 'GHERKIN' ELSE 'STEPS' END,
            'Expected behavior is observed and verified',
            v_priority,
            v_creator,
            v_created_at
          )
          RETURNING id INTO v_version_id;

          -- Update latest_version_id
          UPDATE test_case SET latest_version_id = v_version_id WHERE id = v_tc_id;

          -- Store for later use
          v_tc_ids_for_project := array_append(v_tc_ids_for_project, v_tc_id);

          -- Add some second versions (~15% of cases)
          IF random() < 0.15 THEN
            INSERT INTO test_case_version (test_case_id, version_no, title, precondition, steps, step_format, expected_result, priority, updated_by, created_at)
            VALUES (
              v_tc_id, 2,
              v_title || ' (updated)',
              'Updated preconditions: User is authenticated',
              v_steps_arr,
              'STEPS',
              'Updated expected result verified',
              v_priority,
              v_qa_users[1 + (v_tc_count % 3)],
              v_created_at + INTERVAL '10 days'
            )
            RETURNING id INTO v_version_id;

            UPDATE test_case SET latest_version_id = v_version_id WHERE id = v_tc_id;
          END IF;

          -- Assign tags (~60% of cases get 1-3 tags)
          IF random() < 0.6 THEN
            FOR m IN 1..(1 + floor(random() * 2.5))::int LOOP
              BEGIN
                INSERT INTO test_case_tag (test_case_id, tag_id, assigned_at)
                SELECT v_tc_id, id, NOW()
                FROM tag WHERE project_id = v_project_id
                ORDER BY random() LIMIT 1;
              EXCEPTION WHEN unique_violation THEN NULL;
              END;
            END LOOP;
          END IF;

          -- Assign users (~40% of cases)
          IF random() < 0.4 THEN
            BEGIN
              INSERT INTO test_case_assignee (test_case_id, user_id, assigned_at)
              VALUES (v_tc_id, v_qa_users[1 + floor(random() * array_length(v_qa_users, 1))::int], NOW());
            EXCEPTION WHEN unique_violation THEN NULL;
            END;
          END IF;

        END LOOP; -- test cases per group
      END LOOP; -- groups

      -- ── Releases per project (2-3) ───────────────────
      FOR j IN 1..2 + (v_proj_offset % 2) LOOP
        INSERT INTO release (project_id, name, version, description, status, target_date, release_date, created_by, created_at, updated_at)
        VALUES (
          v_project_id,
          'v' || j || '.0.0',
          j || '.0.0',
          'Release ' || j || ' for ' || v_project_names[v_proj_idx],
          CASE j WHEN 1 THEN 'RELEASED' WHEN 2 THEN 'IN_PROGRESS' ELSE 'PLANNING' END::release_status,
          NOW() - INTERVAL '30 days' + (j * INTERVAL '30 days'),
          CASE WHEN j = 1 THEN NOW() - INTERVAL '20 days' ELSE NULL END,
          'user_alice',
          NOW() - INTERVAL '60 days' + (j * INTERVAL '15 days'),
          NOW()
        )
        RETURNING id INTO v_release_id;

        -- Test plan per release
        INSERT INTO test_plan (project_id, name, description, status, milestone, start_date, end_date, release_id, created_by, created_at, updated_at)
        VALUES (
          v_project_id,
          'v' || j || '.0 Test Plan',
          'Test plan for release v' || j || '.0',
          CASE j WHEN 1 THEN 'COMPLETED' WHEN 2 THEN 'ACTIVE' ELSE 'DRAFT' END::test_plan_status,
          'v' || j || '.0',
          NOW() - INTERVAL '40 days' + (j * INTERVAL '20 days'),
          NOW() - INTERVAL '10 days' + (j * INTERVAL '20 days'),
          v_release_id,
          'user_alice',
          NOW() - INTERVAL '50 days' + (j * INTERVAL '15 days'),
          NOW()
        )
        RETURNING id INTO v_plan_id;

        -- Add ~20-40 test cases to each plan
        INSERT INTO test_plan_test_case (test_plan_id, test_case_id, position, added_at)
        SELECT v_plan_id, unnest, row_number() OVER () - 1, NOW()
        FROM (
          SELECT unnest(v_tc_ids_for_project[1 + ((j-1)*30) : j*40])
        ) sub
        ON CONFLICT DO NOTHING;

        -- Signoff for completed plans
        IF j = 1 THEN
          INSERT INTO test_plan_signoff (test_plan_id, user_id, decision, comment, created_at)
          VALUES
            (v_plan_id, 'user_alice', 'APPROVED', 'All critical tests passed. Approved for release.', NOW() - INTERVAL '15 days'),
            (v_plan_id, 'user_bob',   'APPROVED', 'QA verification complete.', NOW() - INTERVAL '15 days');
        END IF;
      END LOOP;

      -- ── Test Runs (4-8 per project) ─────────────────
      v_num_runs := 4 + (v_proj_offset % 5);

      FOR j IN 1..v_num_runs LOOP
        v_run_status := CASE
          WHEN j <= v_num_runs - 2 THEN 'COMPLETED'
          WHEN j = v_num_runs - 1 THEN 'IN_PROGRESS'
          ELSE 'CREATED'
        END;

        v_run_env := (SELECT name FROM environment_config WHERE project_id = v_project_id ORDER BY random() LIMIT 1);
        IF v_run_env IS NULL THEN v_run_env := 'Staging'; END IF;

        v_run_name := CASE
          WHEN j <= 2 THEN 'Smoke Test Run #' || j
          WHEN j <= 4 THEN 'Regression Cycle #' || (j-2)
          WHEN j <= 6 THEN 'Sprint ' || (j-2) || ' Testing'
          ELSE 'Ad-hoc Test Run #' || (j-6)
        END;

        INSERT INTO test_run (project_id, name, environment, status, started_at, finished_at, created_by, created_at, updated_at,
                              release_id)
        VALUES (
          v_project_id,
          v_run_name,
          v_run_env,
          v_run_status::run_status,
          CASE WHEN v_run_status != 'CREATED' THEN NOW() - ((v_num_runs - j + 1) * INTERVAL '7 days') ELSE NULL END,
          CASE WHEN v_run_status = 'COMPLETED' THEN NOW() - ((v_num_runs - j) * INTERVAL '7 days') ELSE NULL END,
          v_qa_users[1 + (j % array_length(v_qa_users, 1))],
          NOW() - ((v_num_runs - j + 2) * INTERVAL '7 days'),
          NOW(),
          (SELECT id FROM release WHERE project_id = v_project_id ORDER BY id LIMIT 1)
        )
        RETURNING id INTO v_run_id;

        -- Executions: 20-60 per run
        v_run_tcs := 20 + floor(random() * 40)::int;

        FOR k IN 1..least(v_run_tcs, array_length(v_tc_ids_for_project, 1)) LOOP
          -- Pick a test case (sequential with some randomness)
          v_random_tc := v_tc_ids_for_project[1 + ((j * 50 + k - 1) % array_length(v_tc_ids_for_project, 1))];

          v_exec_status := CASE
            WHEN v_run_status = 'CREATED' THEN 'PENDING'
            WHEN v_run_status = 'IN_PROGRESS' AND k > v_run_tcs / 2 THEN 'PENDING'
            ELSE v_exec_statuses[1 + floor(random() * array_length(v_exec_statuses, 1))::int]
          END;
          IF v_exec_status IS NULL THEN v_exec_status := 'PASS'; END IF;

          BEGIN
            INSERT INTO test_execution (test_run_id, test_case_version_id, status, comment, executed_by, executed_at, started_at, completed_at)
            VALUES (
              v_run_id,
              (SELECT latest_version_id FROM test_case WHERE id = v_random_tc),
              v_exec_status::execution_status,
              CASE WHEN v_exec_status = 'FAIL' THEN 'Test failed - see failure details'
                   WHEN v_exec_status = 'BLOCKED' THEN 'Blocked by dependency'
                   WHEN v_exec_status = 'SKIPPED' THEN 'Skipped - not applicable in this environment'
                   WHEN random() < 0.2 THEN 'Executed successfully'
                   ELSE NULL END,
              CASE WHEN v_exec_status NOT IN ('PENDING') THEN v_qa_users[1 + (k % array_length(v_qa_users, 1))] ELSE NULL END,
              CASE WHEN v_exec_status NOT IN ('PENDING') THEN NOW() - ((v_num_runs - j + 1) * INTERVAL '7 days') + (k * INTERVAL '10 min') ELSE NULL END,
              CASE WHEN v_exec_status NOT IN ('PENDING','SKIPPED') THEN NOW() - ((v_num_runs - j + 1) * INTERVAL '7 days') + (k * INTERVAL '10 min') - INTERVAL '5 min' ELSE NULL END,
              CASE WHEN v_exec_status IN ('PASS','FAIL','BLOCKED') THEN NOW() - ((v_num_runs - j + 1) * INTERVAL '7 days') + (k * INTERVAL '10 min') ELSE NULL END
            )
            RETURNING id INTO v_exec_id;

            -- Failure details for FAIL executions
            IF v_exec_status = 'FAIL' THEN
              INSERT INTO test_failure_detail (test_execution_id, failure_environment, test_method, error_message, stack_trace, comment, created_by, created_at)
              VALUES (
                v_exec_id,
                v_run_env,
                'test_' || v_key_prefix || '_' || k,
                CASE floor(random() * 5)::int
                  WHEN 0 THEN 'AssertionError: Expected element to be visible'
                  WHEN 1 THEN 'TimeoutError: Operation timed out after 30000ms'
                  WHEN 2 THEN 'TypeError: Cannot read property of undefined'
                  WHEN 3 THEN 'NetworkError: Request failed with status 500'
                  ELSE 'ValidationError: Required field is empty'
                END,
                'at TestRunner.execute (runner.ts:' || (100 + floor(random() * 200)::int) || ')' || E'\n' ||
                '  at async Context.runTest (context.ts:' || (50 + floor(random() * 100)::int) || ')',
                'Needs investigation',
                v_qa_users[1 + (k % array_length(v_qa_users, 1))],
                NOW() - ((v_num_runs - j + 1) * INTERVAL '7 days') + (k * INTERVAL '10 min')
              );

              -- Issue link for some failures (~40%)
              IF random() < 0.4 THEN
                INSERT INTO issue_link (project_id, test_execution_id, external_url, external_key, title, status, provider, created_by, created_at)
                VALUES (
                  v_project_id,
                  v_exec_id,
                  'https://jira.example.com/browse/' || v_key_prefix || '-' || (1000 + v_exec_id),
                  v_key_prefix || '-' || (1000 + v_exec_id),
                  'Bug from test execution #' || v_exec_id,
                  CASE WHEN random() > 0.5 THEN 'OPEN' ELSE 'IN_PROGRESS' END,
                  'jira',
                  v_qa_users[1 + (k % array_length(v_qa_users, 1))],
                  NOW() - ((v_num_runs - j) * INTERVAL '7 days')
                );
              END IF;
            END IF;

          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END LOOP; -- executions
      END LOOP; -- test runs

      -- ── Comments on test cases (~10% get comments) ──
      FOR j IN 1..greatest(1, array_length(v_tc_ids_for_project, 1) / 10) LOOP
        v_random_tc := v_tc_ids_for_project[1 + floor(random() * array_length(v_tc_ids_for_project, 1))::int];
        BEGIN
          INSERT INTO test_case_comment (test_case_id, user_id, content, parent_id, created_at, updated_at)
          VALUES (
            v_random_tc,
            v_users[1 + floor(random() * array_length(v_users, 1))::int],
            CASE floor(random() * 8)::int
              WHEN 0 THEN 'This test case needs to be updated for the new UI changes.'
              WHEN 1 THEN 'Can we add more edge cases to cover boundary conditions?'
              WHEN 2 THEN 'Verified this works correctly in the latest build.'
              WHEN 3 THEN 'The precondition should include database setup steps.'
              WHEN 4 THEN 'Consider splitting this into smaller test cases.'
              WHEN 5 THEN 'This is a critical path test - marking for smoke suite.'
              WHEN 6 THEN 'Updated steps based on latest requirements change.'
              ELSE 'Reviewed and approved. Good coverage.'
            END,
            NULL,
            NOW() - (random() * INTERVAL '60 days'),
            NOW()
          );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END LOOP;

      -- ── Requirements per project (5-10) ──────────────
      FOR j IN 1..5 + (v_proj_offset % 6) LOOP
        INSERT INTO requirement (project_id, external_id, title, description, source, created_by, created_at)
        VALUES (
          v_project_id,
          'REQ-' || v_key_prefix || '-' || lpad(j::text, 3, '0'),
          v_modules[v_proj_idx][1 + ((j-1) % v_module_count)] || ' requirement',
          'Requirement for ' || v_modules[v_proj_idx][1 + ((j-1) % v_module_count)],
          'Product Spec v1.0',
          'user_alice',
          NOW() - INTERVAL '120 days'
        )
        RETURNING id INTO v_req_id;

        -- Link 3-8 test cases to each requirement
        INSERT INTO requirement_test_case (requirement_id, test_case_id, created_at)
        SELECT v_req_id, unnest, NOW()
        FROM (
          SELECT unnest(v_tc_ids_for_project[(j-1)*5 + 1 : j*5 + 3])
        ) sub
        WHERE unnest IS NOT NULL
        ON CONFLICT DO NOTHING;
      END LOOP;

      -- ── Test Suites (2-3 per project) ────────────────
      FOR j IN 1..2 + (v_proj_offset % 2) LOOP
        INSERT INTO test_suite (project_id, name, description, created_by, created_at)
        VALUES (
          v_project_id,
          CASE j WHEN 1 THEN 'Smoke Suite' WHEN 2 THEN 'Regression Suite' ELSE 'Full Suite' END,
          CASE j WHEN 1 THEN 'Quick smoke tests' WHEN 2 THEN 'Full regression coverage' ELSE 'Complete test suite' END,
          'user_alice',
          NOW() - INTERVAL '90 days'
        )
        RETURNING id INTO v_suite_id;

        -- Add test cases to suite
        INSERT INTO test_suite_item (suite_id, test_case_id, added_at)
        SELECT v_suite_id, unnest, NOW()
        FROM (
          SELECT unnest(
            CASE j
              WHEN 1 THEN v_tc_ids_for_project[1:least(15, array_length(v_tc_ids_for_project, 1))]
              WHEN 2 THEN v_tc_ids_for_project[1:least(50, array_length(v_tc_ids_for_project, 1))]
              ELSE v_tc_ids_for_project
            END
          )
        ) sub
        ON CONFLICT DO NOTHING;
      END LOOP;

      -- ── Exploratory Sessions (1-3 per project) ──────
      FOR j IN 1..1 + (v_proj_offset % 3) LOOP
        INSERT INTO exploratory_session (project_id, title, charter, status, started_at, paused_duration, completed_at, summary, created_by, environment, tags)
        VALUES (
          v_project_id,
          CASE j
            WHEN 1 THEN 'Edge Case Exploration'
            WHEN 2 THEN 'New Feature Testing'
            ELSE 'Usability Review'
          END,
          'Explore ' || lower(v_modules[v_proj_idx][j]) || ' for edge cases and unexpected behavior',
          CASE WHEN j = 1 THEN 'COMPLETED' ELSE 'ACTIVE' END,
          NOW() - (j * INTERVAL '10 days'),
          CASE WHEN j = 1 THEN 300 ELSE 0 END,
          CASE WHEN j = 1 THEN NOW() - (j * INTERVAL '10 days') + INTERVAL '2 hours' ELSE NULL END,
          CASE WHEN j = 1 THEN 'Found ' || (1 + j) || ' issues during exploration session' ELSE NULL END,
          v_qa_users[1 + (j % array_length(v_qa_users, 1))],
          v_run_env,
          ('["exploratory","' || lower(replace(v_modules[v_proj_idx][j], ' ', '-')) || '"]')::jsonb
        )
        RETURNING id INTO v_session_id;

        -- Session notes
        FOR k IN 1..3 + floor(random() * 4)::int LOOP
          INSERT INTO session_note (session_id, content, note_type, timestamp, created_at)
          VALUES (
            v_session_id,
            CASE floor(random() * 5)::int
              WHEN 0 THEN 'Found UI inconsistency in the ' || lower(v_modules[v_proj_idx][j]) || ' module'
              WHEN 1 THEN 'Edge case: empty input causes unexpected behavior'
              WHEN 2 THEN 'Performance issue noticed under concurrent usage'
              WHEN 3 THEN 'All basic flows working as expected'
              ELSE 'Accessibility issue: missing ARIA labels on buttons'
            END,
            CASE WHEN random() < 0.4 THEN 'BUG' WHEN random() < 0.7 THEN 'NOTE' ELSE 'IDEA' END,
            k * 600,
            NOW() - (j * INTERVAL '10 days') + (k * INTERVAL '10 min')
          );
        END LOOP;
      END LOOP;

      -- ── Saved Filters (2-3 per project for active users) ──
      BEGIN
        INSERT INTO saved_filter (project_id, user_id, name, filter_type, filters, sort_order, created_at, updated_at)
        VALUES
          (v_project_id, 'user_bob', 'My Assigned', 'test_cases', '{"assignee":["user_bob"]}', 0, NOW(), NOW()),
          (v_project_id, 'user_bob', 'High Priority', 'test_cases', '{"priority":["HIGH","CRITICAL"]}', 1, NOW(), NOW()),
          (v_project_id, 'user_carol', 'Failed Runs', 'test_runs', '{"status":["FAIL"]}', 0, NOW(), NOW());
      EXCEPTION WHEN unique_violation THEN NULL;
      END;

      -- ── Custom Fields (2-3 per project) ──────────────
      BEGIN
        INSERT INTO custom_field (project_id, name, field_type, options, required, sort_order, created_by)
        VALUES
          (v_project_id, 'Test Type', 'SELECT', '["Manual","Automated","Hybrid"]', true, 0, 'user_alice'),
          (v_project_id, 'Estimated Duration', 'TEXT', NULL, false, 1, 'user_alice'),
          (v_project_id, 'Component', 'SELECT', '["Frontend","Backend","Database","Infrastructure"]', false, 2, 'user_alice');
      EXCEPTION WHEN unique_violation THEN NULL;
      END;

      -- ── Notifications ────────────────────────────────
      FOR j IN 1..5 LOOP
        INSERT INTO notification (user_id, type, title, message, link, project_id, is_read, created_at)
        VALUES (
          v_qa_users[1 + (j % array_length(v_qa_users, 1))],
          CASE j % 4
            WHEN 0 THEN 'TEST_RUN_COMPLETED'
            WHEN 1 THEN 'TEST_FAILURE'
            WHEN 2 THEN 'ASSIGNED'
            ELSE 'COMMENT'
          END,
          CASE j % 4
            WHEN 0 THEN 'Test Run Completed'
            WHEN 1 THEN 'Test Failure Detected'
            WHEN 2 THEN 'New Assignment'
            ELSE 'New Comment'
          END,
          'Notification for ' || v_project_names[v_proj_idx] || ' project',
          '/projects/' || v_project_id || '/test-cases',
          v_project_id,
          (random() > 0.4),
          NOW() - (random() * INTERVAL '30 days')
        );
      END LOOP;

      RAISE NOTICE 'Project % (%) complete: % test cases', v_project_id, v_project_names[v_proj_idx], array_length(v_tc_ids_for_project, 1);

    END; -- project block
  END LOOP; -- projects

  -- ── User Preferences ──────────────────────────────
  INSERT INTO user_preference (user_id, locale, theme, notification_settings, updated_at)
  VALUES
    ('user_alice', 'en', 'light', '{"enableInApp":true,"mutedTypes":[]}', NOW()),
    ('user_bob',   'ko', 'dark',  '{"enableInApp":true,"mutedTypes":[]}', NOW()),
    ('user_carol', 'en', 'light', '{"enableInApp":true,"mutedTypes":["COMMENT"]}', NOW()),
    ('user_dave',  'en', 'dark',  '{"enableInApp":true,"mutedTypes":[]}', NOW()),
    ('user_eve',   'ko', 'light', '{"enableInApp":false,"mutedTypes":[]}', NOW()),
    ('user_frank', 'en', 'dark',  '{"enableInApp":true,"mutedTypes":[]}', NOW()),
    ('user_grace', 'ko', 'light', '{"enableInApp":true,"mutedTypes":["ASSIGNED"]}', NOW()),
    ('user_henry', 'en', 'dark',  '{"enableInApp":true,"mutedTypes":[]}', NOW()),
    ('user_iris',  'en', 'light', '{"enableInApp":true,"mutedTypes":[]}', NOW()),
    ('user_jake',  'ko', 'dark',  '{"enableInApp":true,"mutedTypes":[]}', NOW())
  ON CONFLICT DO NOTHING;

  -- ── Audit Log (sample entries) ────────────────────
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, project_id, metadata, ip_address, created_at)
  SELECT
    v_users[1 + (g % array_length(v_users, 1))],
    CASE g % 5 WHEN 0 THEN 'CREATE' WHEN 1 THEN 'UPDATE' WHEN 2 THEN 'DELETE' WHEN 3 THEN 'LOGIN' ELSE 'EXPORT' END,
    CASE g % 4 WHEN 0 THEN 'test_case' WHEN 1 THEN 'test_run' WHEN 2 THEN 'project' ELSE 'user' END,
    g::text,
    CASE WHEN g % 4 != 3 THEN (SELECT id FROM project ORDER BY random() LIMIT 1) ELSE NULL END,
    jsonb_build_object('action_detail', 'Bulk seed audit entry #' || g),
    '127.0.0.' || (1 + g % 254),
    NOW() - (random() * INTERVAL '90 days')
  FROM generate_series(1, 100) g;

  RAISE NOTICE 'Total test cases created: %', v_tc_count;
END;
$$;

COMMIT;

-- ── Summary ──────────────────────────────────────────────
SELECT '=== Seed Summary ===' AS info;
SELECT 'Users:              ' || COUNT(*) FROM "user";
SELECT 'Teams:              ' || COUNT(*) FROM team;
SELECT 'Projects:           ' || COUNT(*) FROM project;
SELECT 'Project Members:    ' || COUNT(*) FROM project_member;
SELECT 'Test Case Groups:   ' || COUNT(*) FROM test_case_group;
SELECT 'Test Cases:         ' || COUNT(*) FROM test_case;
SELECT 'Test Case Versions: ' || COUNT(*) FROM test_case_version;
SELECT 'Tags:               ' || COUNT(*) FROM tag;
SELECT 'Test Case Tags:     ' || COUNT(*) FROM test_case_tag;
SELECT 'Assignees:          ' || COUNT(*) FROM test_case_assignee;
SELECT 'Test Runs:          ' || COUNT(*) FROM test_run;
SELECT 'Test Executions:    ' || COUNT(*) FROM test_execution;
SELECT 'Failure Details:    ' || COUNT(*) FROM test_failure_detail;
SELECT 'Releases:           ' || COUNT(*) FROM release;
SELECT 'Test Plans:         ' || COUNT(*) FROM test_plan;
SELECT 'Test Suites:        ' || COUNT(*) FROM test_suite;
SELECT 'Requirements:       ' || COUNT(*) FROM requirement;
SELECT 'Issue Links:        ' || COUNT(*) FROM issue_link;
SELECT 'Comments:           ' || COUNT(*) FROM test_case_comment;
SELECT 'Exploratory:        ' || COUNT(*) FROM exploratory_session;
SELECT 'Notifications:      ' || COUNT(*) FROM notification;
SELECT 'Audit Logs:         ' || COUNT(*) FROM audit_log;
