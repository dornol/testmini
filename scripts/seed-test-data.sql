-- ============================================================
-- Test Data Seed Script for testmini
-- Run: psql $DATABASE_URL -f scripts/seed-test-data.sql
-- ============================================================

BEGIN;

-- ── Users ────────────────────────────────────────────────
-- Password: test1234 (bcrypt hash)
-- Note: admin user is created by app seed, so we only add extra users here

INSERT INTO "user" (id, name, email, email_verified, role, approved, created_at, updated_at)
VALUES
  ('user_alice',   'Alice Kim',    'alice@example.com',   true, 'admin', true, NOW() - INTERVAL '90 days', NOW()),
  ('user_bob',     'Bob Park',     'bob@example.com',     true, 'user',  true, NOW() - INTERVAL '85 days', NOW()),
  ('user_carol',   'Carol Lee',    'carol@example.com',   true, 'user',  true, NOW() - INTERVAL '80 days', NOW()),
  ('user_dave',    'Dave Choi',    'dave@example.com',    true, 'user',  true, NOW() - INTERVAL '75 days', NOW()),
  ('user_eve',     'Eve Jung',     'eve@example.com',     true, 'user',  true, NOW() - INTERVAL '70 days', NOW())
ON CONFLICT (email) DO NOTHING;

-- Credential accounts (password: test1234)
INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
VALUES
  ('acc_alice', 'user_alice', 'credential', 'user_alice', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_bob',   'user_bob',   'credential', 'user_bob',   '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_carol', 'user_carol', 'credential', 'user_carol', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_dave',  'user_dave',  'credential', 'user_dave',  '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW()),
  ('acc_eve',   'user_eve',   'credential', 'user_eve',   '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ── Team ─────────────────────────────────────────────────

INSERT INTO team (id, name, description, created_by, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'QA Team Alpha', 'Main QA team for web products', 'user_alice', NOW() - INTERVAL '60 days', NOW()),
  (2, 'Backend Team',  'Backend service testing', 'user_alice', NOW() - INTERVAL '55 days', NOW())
ON CONFLICT DO NOTHING;

SELECT setval('team_id_seq', (SELECT COALESCE(MAX(id), 0) FROM team));

INSERT INTO team_member (id, team_id, user_id, role, joined_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'user_alice', 'OWNER',  NOW() - INTERVAL '60 days'),
  (2, 1, 'user_bob',   'ADMIN',  NOW() - INTERVAL '58 days'),
  (3, 1, 'user_carol', 'MEMBER', NOW() - INTERVAL '55 days'),
  (4, 2, 'user_alice', 'OWNER',  NOW() - INTERVAL '55 days'),
  (5, 2, 'user_dave',  'MEMBER', NOW() - INTERVAL '50 days')
ON CONFLICT DO NOTHING;

SELECT setval('team_member_id_seq', (SELECT COALESCE(MAX(id), 0) FROM team_member));

-- ── Projects ─────────────────────────────────────────────

INSERT INTO project (id, name, description, active, require_signoff, team_id, created_by, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'E-Commerce Platform', 'Online shopping platform QA', true, false, 1, 'user_alice', NOW() - INTERVAL '60 days', NOW()),
  (2, 'Payment Gateway',     'Payment processing tests',    true, true,  1, 'user_alice', NOW() - INTERVAL '50 days', NOW()),
  (3, 'Mobile App API',      'REST API for mobile app',     true, false, 2, 'user_alice', NOW() - INTERVAL '40 days', NOW())
ON CONFLICT DO NOTHING;

SELECT setval('project_id_seq', (SELECT COALESCE(MAX(id), 0) FROM project));

-- ── Project Members ──────────────────────────────────────

INSERT INTO project_member (id, project_id, user_id, role, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  1, 'user_alice', 'PROJECT_ADMIN', NOW() - INTERVAL '60 days'),
  (2,  1, 'user_bob',   'QA',            NOW() - INTERVAL '58 days'),
  (3,  1, 'user_carol', 'QA',            NOW() - INTERVAL '55 days'),
  (4,  1, 'user_dave',  'DEV',           NOW() - INTERVAL '50 days'),
  (5,  1, 'user_eve',   'VIEWER',        NOW() - INTERVAL '45 days'),
  (6,  2, 'user_alice', 'PROJECT_ADMIN', NOW() - INTERVAL '50 days'),
  (7,  2, 'user_bob',   'QA',            NOW() - INTERVAL '48 days'),
  (8,  2, 'user_carol', 'DEV',           NOW() - INTERVAL '45 days'),
  (9,  3, 'user_alice', 'PROJECT_ADMIN', NOW() - INTERVAL '40 days'),
  (10, 3, 'user_dave',  'QA',            NOW() - INTERVAL '38 days')
ON CONFLICT DO NOTHING;

SELECT setval('project_member_id_seq', (SELECT COALESCE(MAX(id), 0) FROM project_member));

-- ── Priority Config ──────────────────────────────────────

INSERT INTO priority_config (id, project_id, name, color, position, is_default, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  1, 'Low',      '#22c55e', 0, false, 'user_alice', NOW()),
  (2,  1, 'Medium',   '#f59e0b', 1, true,  'user_alice', NOW()),
  (3,  1, 'High',     '#f97316', 2, false, 'user_alice', NOW()),
  (4,  1, 'Critical', '#ef4444', 3, false, 'user_alice', NOW()),
  (5,  2, 'Low',      '#22c55e', 0, false, 'user_alice', NOW()),
  (6,  2, 'Medium',   '#f59e0b', 1, true,  'user_alice', NOW()),
  (7,  2, 'High',     '#f97316', 2, false, 'user_alice', NOW()),
  (8,  2, 'Critical', '#ef4444', 3, false, 'user_alice', NOW()),
  (9,  3, 'Low',      '#22c55e', 0, false, 'user_alice', NOW()),
  (10, 3, 'Medium',   '#f59e0b', 1, true,  'user_alice', NOW()),
  (11, 3, 'High',     '#f97316', 2, false, 'user_alice', NOW()),
  (12, 3, 'Critical', '#ef4444', 3, false, 'user_alice', NOW())
ON CONFLICT DO NOTHING;

SELECT setval('priority_config_id_seq', (SELECT COALESCE(MAX(id), 0) FROM priority_config));

-- ── Environment Config ───────────────────────────────────

INSERT INTO environment_config (id, project_id, name, color, position, is_default, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  1, 'Development', '#6366f1', 0, false, 'user_alice', NOW()),
  (2,  1, 'Staging',     '#f59e0b', 1, false, 'user_alice', NOW()),
  (3,  1, 'Production',  '#ef4444', 2, true,  'user_alice', NOW()),
  (4,  2, 'Sandbox',     '#6366f1', 0, false, 'user_alice', NOW()),
  (5,  2, 'Staging',     '#f59e0b', 1, true,  'user_alice', NOW()),
  (6,  2, 'Production',  '#ef4444', 2, false, 'user_alice', NOW()),
  (7,  3, 'Dev',         '#6366f1', 0, true,  'user_alice', NOW()),
  (8,  3, 'QA',          '#22c55e', 1, false, 'user_alice', NOW()),
  (9,  3, 'Staging',     '#f59e0b', 2, false, 'user_alice', NOW()),
  (10, 3, 'Production',  '#ef4444', 3, false, 'user_alice', NOW())
ON CONFLICT DO NOTHING;

SELECT setval('environment_config_id_seq', (SELECT COALESCE(MAX(id), 0) FROM environment_config));

-- ── Tags ─────────────────────────────────────────────────

INSERT INTO tag (id, project_id, name, color, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  1, 'Smoke',       '#ef4444', 'user_alice', NOW()),
  (2,  1, 'Regression',  '#3b82f6', 'user_alice', NOW()),
  (3,  1, 'UI',          '#8b5cf6', 'user_alice', NOW()),
  (4,  1, 'API',         '#06b6d4', 'user_alice', NOW()),
  (5,  1, 'Performance', '#f59e0b', 'user_alice', NOW()),
  (6,  2, 'Smoke',       '#ef4444', 'user_alice', NOW()),
  (7,  2, 'Security',    '#dc2626', 'user_alice', NOW()),
  (8,  2, 'Integration', '#10b981', 'user_alice', NOW()),
  (9,  3, 'Smoke',       '#ef4444', 'user_alice', NOW()),
  (10, 3, 'API',         '#06b6d4', 'user_alice', NOW()),
  (11, 3, 'Auth',        '#f97316', 'user_alice', NOW())
ON CONFLICT DO NOTHING;

SELECT setval('tag_id_seq', (SELECT COALESCE(MAX(id), 0) FROM tag));

-- ── Test Case Groups ─────────────────────────────────────

INSERT INTO test_case_group (id, project_id, name, sort_order, color, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'User Authentication', 0, '#3b82f6', 'user_alice', NOW()),
  (2, 1, 'Product Catalog',     1, '#22c55e', 'user_alice', NOW()),
  (3, 1, 'Shopping Cart',       2, '#f59e0b', 'user_alice', NOW()),
  (4, 1, 'Checkout',            3, '#ef4444', 'user_alice', NOW()),
  (5, 1, 'Order Management',    4, '#8b5cf6', 'user_alice', NOW()),
  (6, 2, 'Card Payments',       0, '#3b82f6', 'user_alice', NOW()),
  (7, 2, 'Refunds',             1, '#f59e0b', 'user_alice', NOW()),
  (8, 3, 'Auth Endpoints',      0, '#3b82f6', 'user_alice', NOW()),
  (9, 3, 'Product Endpoints',   1, '#22c55e', 'user_alice', NOW())
ON CONFLICT DO NOTHING;

SELECT setval('test_case_group_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_case_group));

-- ── Test Cases (Project 1: E-Commerce) ───────────────────

INSERT INTO test_case (id, project_id, key, automation_key, group_id, sort_order, approval_status, retest_needed, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  -- Auth group
  (1,  1, 'TC-001', 'test_login_valid',         1, 0, 'APPROVED', false, 'user_bob',   NOW() - INTERVAL '55 days'),
  (2,  1, 'TC-002', 'test_login_invalid',       1, 1, 'APPROVED', false, 'user_bob',   NOW() - INTERVAL '55 days'),
  (3,  1, 'TC-003', 'test_register',            1, 2, 'APPROVED', false, 'user_bob',   NOW() - INTERVAL '54 days'),
  (4,  1, 'TC-004', 'test_password_reset',      1, 3, 'DRAFT',   false, 'user_carol', NOW() - INTERVAL '53 days'),
  (5,  1, 'TC-005', NULL,                       1, 4, 'APPROVED', false, 'user_carol', NOW() - INTERVAL '52 days'),
  -- Product group
  (6,  1, 'TC-006', 'test_product_list',        2, 0, 'APPROVED', false, 'user_bob',   NOW() - INTERVAL '50 days'),
  (7,  1, 'TC-007', 'test_product_search',      2, 1, 'APPROVED', false, 'user_bob',   NOW() - INTERVAL '50 days'),
  (8,  1, 'TC-008', 'test_product_filter',      2, 2, 'APPROVED', true,  'user_bob',   NOW() - INTERVAL '49 days'),
  (9,  1, 'TC-009', NULL,                       2, 3, 'DRAFT',   false, 'user_carol', NOW() - INTERVAL '48 days'),
  (10, 1, 'TC-010', NULL,                       2, 4, 'APPROVED', false, 'user_carol', NOW() - INTERVAL '47 days'),
  -- Cart group
  (11, 1, 'TC-011', 'test_add_to_cart',         3, 0, 'APPROVED', false, 'user_bob',   NOW() - INTERVAL '45 days'),
  (12, 1, 'TC-012', 'test_remove_from_cart',    3, 1, 'APPROVED', false, 'user_bob',   NOW() - INTERVAL '45 days'),
  (13, 1, 'TC-013', 'test_update_quantity',     3, 2, 'APPROVED', false, 'user_carol', NOW() - INTERVAL '44 days'),
  (14, 1, 'TC-014', NULL,                       3, 3, 'DRAFT',   false, 'user_carol', NOW() - INTERVAL '43 days'),
  -- Checkout group
  (15, 1, 'TC-015', 'test_checkout_guest',      4, 0, 'APPROVED', false, 'user_bob',   NOW() - INTERVAL '40 days'),
  (16, 1, 'TC-016', 'test_checkout_registered', 4, 1, 'APPROVED', true,  'user_bob',   NOW() - INTERVAL '40 days'),
  (17, 1, 'TC-017', NULL,                       4, 2, 'DRAFT',   false, 'user_carol', NOW() - INTERVAL '39 days'),
  -- Order group
  (18, 1, 'TC-018', 'test_order_history',       5, 0, 'APPROVED', false, 'user_bob',   NOW() - INTERVAL '35 days'),
  (19, 1, 'TC-019', 'test_order_cancel',        5, 1, 'APPROVED', false, 'user_carol', NOW() - INTERVAL '34 days'),
  (20, 1, 'TC-020', NULL,                       5, 2, 'DRAFT',   false, 'user_carol', NOW() - INTERVAL '33 days')
ON CONFLICT DO NOTHING;

-- Test Cases (Project 2: Payment)
INSERT INTO test_case (id, project_id, key, automation_key, group_id, sort_order, approval_status, retest_needed, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (21, 2, 'PAY-001', 'test_card_visa',           6, 0, 'APPROVED', false, 'user_bob', NOW() - INTERVAL '45 days'),
  (22, 2, 'PAY-002', 'test_card_mastercard',     6, 1, 'APPROVED', false, 'user_bob', NOW() - INTERVAL '44 days'),
  (23, 2, 'PAY-003', 'test_card_declined',       6, 2, 'APPROVED', false, 'user_bob', NOW() - INTERVAL '43 days'),
  (24, 2, 'PAY-004', 'test_3ds_auth',            6, 3, 'APPROVED', false, 'user_bob', NOW() - INTERVAL '42 days'),
  (25, 2, 'PAY-005', 'test_refund_full',         7, 0, 'APPROVED', false, 'user_bob', NOW() - INTERVAL '40 days'),
  (26, 2, 'PAY-006', 'test_refund_partial',      7, 1, 'DRAFT',   false, 'user_bob', NOW() - INTERVAL '39 days')
ON CONFLICT DO NOTHING;

-- Test Cases (Project 3: Mobile API)
INSERT INTO test_case (id, project_id, key, automation_key, group_id, sort_order, approval_status, retest_needed, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (27, 3, 'API-001', 'test_api_login',           8, 0, 'APPROVED', false, 'user_dave', NOW() - INTERVAL '35 days'),
  (28, 3, 'API-002', 'test_api_token_refresh',   8, 1, 'APPROVED', false, 'user_dave', NOW() - INTERVAL '34 days'),
  (29, 3, 'API-003', 'test_api_products_list',   9, 0, 'APPROVED', false, 'user_dave', NOW() - INTERVAL '33 days'),
  (30, 3, 'API-004', 'test_api_products_detail', 9, 1, 'DRAFT',   false, 'user_dave', NOW() - INTERVAL '32 days')
ON CONFLICT DO NOTHING;

SELECT setval('test_case_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_case));

-- ── Test Case Versions ───────────────────────────────────

INSERT INTO test_case_version (id, test_case_id, version_no, title, precondition, steps, step_format, expected_result, priority, updated_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  -- Project 1 versions
  (1,  1,  1, 'Login with valid credentials',     'User account exists', '[{"order":1,"action":"Navigate to login page","expected":"Login form displayed"},{"order":2,"action":"Enter valid email and password","expected":"Fields populated"},{"order":3,"action":"Click Login button","expected":"Redirected to dashboard"}]', 'STEPS', 'User is logged in and sees dashboard', 'HIGH',     'user_bob',   NOW() - INTERVAL '55 days'),
  (2,  2,  1, 'Login with invalid credentials',   'User account exists', '[{"order":1,"action":"Navigate to login page","expected":"Login form displayed"},{"order":2,"action":"Enter invalid password","expected":"Fields populated"},{"order":3,"action":"Click Login button","expected":"Error message shown"}]', 'STEPS', 'Error message displayed, user stays on login page', 'HIGH', 'user_bob', NOW() - INTERVAL '55 days'),
  (3,  3,  1, 'Register new user account',        NULL, '[{"order":1,"action":"Navigate to registration page","expected":"Registration form shown"},{"order":2,"action":"Fill in all required fields","expected":"Form validated"},{"order":3,"action":"Submit registration","expected":"Account created, verification email sent"}]', 'STEPS', 'User account created successfully', 'MEDIUM', 'user_bob', NOW() - INTERVAL '54 days'),
  (4,  4,  1, 'Password reset flow',              'User has registered email', '[{"order":1,"action":"Click Forgot Password link","expected":"Reset form shown"},{"order":2,"action":"Enter registered email","expected":"Email field accepted"},{"order":3,"action":"Check email and click reset link","expected":"Password reset page opens"},{"order":4,"action":"Enter new password","expected":"Password updated"}]', 'STEPS', 'Password successfully changed', 'MEDIUM', 'user_carol', NOW() - INTERVAL '53 days'),
  (5,  5,  1, 'Logout from application',          'User is logged in', '[{"order":1,"action":"Click user menu","expected":"Dropdown shown"},{"order":2,"action":"Click Logout","expected":"Redirected to login page"}]', 'STEPS', 'User is logged out, session destroyed', 'LOW', 'user_carol', NOW() - INTERVAL '52 days'),

  (6,  6,  1, 'View product listing page',        NULL, '[{"order":1,"action":"Navigate to products page","expected":"Product grid displayed"},{"order":2,"action":"Verify product cards","expected":"Each card shows image, name, price"}]', 'STEPS', 'All products displayed with correct info', 'MEDIUM', 'user_bob', NOW() - INTERVAL '50 days'),
  (7,  7,  1, 'Search products by keyword',        NULL, '[{"order":1,"action":"Enter keyword in search bar","expected":"Autocomplete suggestions shown"},{"order":2,"action":"Press Enter or click search","expected":"Filtered results displayed"}]', 'STEPS', 'Only matching products shown', 'MEDIUM', 'user_bob', NOW() - INTERVAL '50 days'),
  (8,  8,  1, 'Filter products by category',       NULL, '[{"order":1,"action":"Click category filter","expected":"Category options shown"},{"order":2,"action":"Select a category","expected":"Products filtered by category"}]', 'STEPS', 'Only products in selected category shown', 'MEDIUM', 'user_bob', NOW() - INTERVAL '49 days'),
  (9,  9,  1, 'Sort products by price',            NULL, '[{"order":1,"action":"Click sort dropdown","expected":"Sort options shown"},{"order":2,"action":"Select price low to high","expected":"Products reordered"}]', 'STEPS', 'Products sorted by ascending price', 'LOW', 'user_carol', NOW() - INTERVAL '48 days'),
  (10, 10, 1, 'View product detail page',          NULL, '[{"order":1,"action":"Click on a product card","expected":"Product detail page opened"},{"order":2,"action":"Verify product info","expected":"Name, description, price, images displayed"}]', 'STEPS', 'Full product details shown correctly', 'MEDIUM', 'user_carol', NOW() - INTERVAL '47 days'),

  (11, 11, 1, 'Add product to shopping cart',      'User is on product page', '[{"order":1,"action":"Select quantity","expected":"Quantity updated"},{"order":2,"action":"Click Add to Cart","expected":"Item added, cart count updated"}]', 'STEPS', 'Product added to cart with correct quantity', 'HIGH', 'user_bob', NOW() - INTERVAL '45 days'),
  (12, 12, 1, 'Remove product from cart',           'Cart has at least 1 item', '[{"order":1,"action":"Open cart page","expected":"Cart items listed"},{"order":2,"action":"Click Remove on an item","expected":"Item removed, total updated"}]', 'STEPS', 'Item removed, cart total recalculated', 'HIGH', 'user_bob', NOW() - INTERVAL '45 days'),
  (13, 13, 1, 'Update cart item quantity',          'Cart has at least 1 item', '[{"order":1,"action":"Open cart page","expected":"Cart items shown"},{"order":2,"action":"Change quantity","expected":"Subtotal recalculated"}]', 'STEPS', 'Quantity and total updated correctly', 'MEDIUM', 'user_carol', NOW() - INTERVAL '44 days'),
  (14, 14, 1, 'Apply discount coupon',              'Valid coupon code exists', '[{"order":1,"action":"Enter coupon code in field","expected":"Code accepted"},{"order":2,"action":"Click Apply","expected":"Discount applied to total"}]', 'STEPS', 'Discount reflected in order total', 'MEDIUM', 'user_carol', NOW() - INTERVAL '43 days'),

  (15, 15, 1, 'Guest checkout flow',                'Cart has items, user not logged in', '[{"order":1,"action":"Click Checkout","expected":"Guest checkout form shown"},{"order":2,"action":"Enter shipping info","expected":"Address validated"},{"order":3,"action":"Enter payment info","expected":"Payment validated"},{"order":4,"action":"Place order","expected":"Order confirmation shown"}]', 'STEPS', 'Order placed successfully as guest', 'CRITICAL', 'user_bob', NOW() - INTERVAL '40 days'),
  (16, 16, 1, 'Registered user checkout',           'User logged in with items in cart', '[{"order":1,"action":"Click Checkout","expected":"Saved addresses shown"},{"order":2,"action":"Select shipping address","expected":"Address selected"},{"order":3,"action":"Select payment method","expected":"Payment method selected"},{"order":4,"action":"Place order","expected":"Order confirmation shown"}]', 'STEPS', 'Order placed with saved info', 'CRITICAL', 'user_bob', NOW() - INTERVAL '40 days'),
  (17, 17, 1, 'Checkout with multiple shipping methods', 'Cart has items', '[{"order":1,"action":"Proceed to checkout","expected":"Shipping options displayed"},{"order":2,"action":"Select express shipping","expected":"Shipping cost updated"}]', 'STEPS', 'Shipping method applied to order', 'MEDIUM', 'user_carol', NOW() - INTERVAL '39 days'),

  (18, 18, 1, 'View order history',                 'User has past orders', '[{"order":1,"action":"Navigate to order history","expected":"List of orders shown"},{"order":2,"action":"Click on an order","expected":"Order details displayed"}]', 'STEPS', 'Order details match original purchase', 'MEDIUM', 'user_bob', NOW() - INTERVAL '35 days'),
  (19, 19, 1, 'Cancel pending order',               'User has a pending order', '[{"order":1,"action":"Open order details","expected":"Order info shown"},{"order":2,"action":"Click Cancel Order","expected":"Confirmation dialog"},{"order":3,"action":"Confirm cancellation","expected":"Order status changed to Cancelled"}]', 'STEPS', 'Order cancelled, refund initiated', 'HIGH', 'user_carol', NOW() - INTERVAL '34 days'),
  (20, 20, 1, 'Track order status',                 'User has a shipped order', '[{"order":1,"action":"Open order details","expected":"Tracking info displayed"},{"order":2,"action":"Click tracking link","expected":"Carrier tracking page opens"}]', 'STEPS', 'Tracking information is accurate', 'LOW', 'user_carol', NOW() - INTERVAL '33 days'),

  -- Project 2 versions
  (21, 21, 1, 'Process Visa card payment',          'Valid Visa test card available', '[{"order":1,"action":"Enter Visa card details","expected":"Card validated"},{"order":2,"action":"Submit payment","expected":"Payment processed"}]', 'STEPS', 'Payment successful, transaction ID generated', 'CRITICAL', 'user_bob', NOW() - INTERVAL '45 days'),
  (22, 22, 1, 'Process Mastercard payment',         'Valid MC test card available', '[{"order":1,"action":"Enter Mastercard details","expected":"Card validated"},{"order":2,"action":"Submit payment","expected":"Payment processed"}]', 'STEPS', 'Payment successful', 'CRITICAL', 'user_bob', NOW() - INTERVAL '44 days'),
  (23, 23, 1, 'Handle declined card',               'Declined test card available', '[{"order":1,"action":"Enter declined card details","expected":"Card accepted for processing"},{"order":2,"action":"Submit payment","expected":"Decline message shown"}]', 'STEPS', 'Appropriate error message displayed', 'HIGH', 'user_bob', NOW() - INTERVAL '43 days'),
  (24, 24, 1, '3D Secure authentication flow',     NULL, '[{"order":1,"action":"Submit payment requiring 3DS","expected":"3DS challenge shown"},{"order":2,"action":"Complete 3DS verification","expected":"Payment processed after auth"}]', 'STEPS', '3DS verified, payment completed', 'HIGH', 'user_bob', NOW() - INTERVAL '42 days'),
  (25, 25, 1, 'Full refund processing',             'Completed transaction exists', '[{"order":1,"action":"Initiate full refund","expected":"Refund form shown"},{"order":2,"action":"Submit refund request","expected":"Refund processed"}]', 'STEPS', 'Full amount refunded to customer', 'HIGH', 'user_bob', NOW() - INTERVAL '40 days'),
  (26, 26, 1, 'Partial refund processing',          'Completed transaction exists', '[{"order":1,"action":"Initiate partial refund","expected":"Amount input shown"},{"order":2,"action":"Enter partial amount and submit","expected":"Partial refund processed"}]', 'STEPS', 'Partial amount refunded', 'MEDIUM', 'user_bob', NOW() - INTERVAL '39 days'),

  -- Project 3 versions (Gherkin format)
  (27, 27, 1, 'API Login endpoint',                 NULL, '[{"keyword":"Given","text":"a registered user exists","expected":""},{"keyword":"When","text":"POST /api/auth/login with valid credentials","expected":""},{"keyword":"Then","text":"response status is 200 with JWT token","expected":"Token is valid JWT"}]', 'GHERKIN', NULL, 'HIGH', 'user_dave', NOW() - INTERVAL '35 days'),
  (28, 28, 1, 'Token refresh endpoint',             NULL, '[{"keyword":"Given","text":"a valid refresh token exists","expected":""},{"keyword":"When","text":"POST /api/auth/refresh with refresh token","expected":""},{"keyword":"Then","text":"new access token is returned","expected":"New token has extended expiry"}]', 'GHERKIN', NULL, 'HIGH', 'user_dave', NOW() - INTERVAL '34 days'),
  (29, 29, 1, 'List products API',                  NULL, '[{"keyword":"Given","text":"products exist in database","expected":""},{"keyword":"When","text":"GET /api/products","expected":""},{"keyword":"Then","text":"response contains paginated product list","expected":"Products include id, name, price"},{"keyword":"And","text":"pagination metadata is included","expected":""}]', 'GHERKIN', NULL, 'MEDIUM', 'user_dave', NOW() - INTERVAL '33 days'),
  (30, 30, 1, 'Product detail API',                 NULL, '[{"keyword":"Given","text":"product with ID 1 exists","expected":""},{"keyword":"When","text":"GET /api/products/1","expected":""},{"keyword":"Then","text":"response contains full product details","expected":"Includes images, description, variants"}]', 'GHERKIN', NULL, 'MEDIUM', 'user_dave', NOW() - INTERVAL '32 days')
ON CONFLICT DO NOTHING;

SELECT setval('test_case_version_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_case_version));

-- ── Update latest_version_id on test_case ────────────────

UPDATE test_case SET latest_version_id = id;  -- version IDs match test case IDs in this seed

-- ── Test Case Tags ───────────────────────────────────────

INSERT INTO test_case_tag (id, test_case_id, tag_id, assigned_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  1,  1, NOW()),  -- TC-001: Smoke
  (2,  1,  2, NOW()),  -- TC-001: Regression
  (3,  2,  2, NOW()),  -- TC-002: Regression
  (4,  3,  3, NOW()),  -- TC-003: UI
  (5,  6,  3, NOW()),  -- TC-006: UI
  (6,  7,  3, NOW()),  -- TC-007: UI
  (7,  11, 1, NOW()),  -- TC-011: Smoke
  (8,  11, 2, NOW()),  -- TC-011: Regression
  (9,  15, 1, NOW()),  -- TC-015: Smoke
  (10, 15, 2, NOW()),  -- TC-015: Regression
  (11, 16, 2, NOW()),  -- TC-016: Regression
  (12, 21, 6, NOW()),  -- PAY-001: Smoke
  (13, 21, 8, NOW()),  -- PAY-001: Integration
  (14, 23, 7, NOW()),  -- PAY-003: Security
  (15, 27, 9, NOW()),  -- API-001: Smoke
  (16, 27, 10, NOW()), -- API-001: API
  (17, 28, 11, NOW()), -- API-002: Auth
  (18, 29, 10, NOW()), -- API-003: API
  (19, 30, 10, NOW())  -- API-004: API
ON CONFLICT DO NOTHING;

SELECT setval('test_case_tag_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_case_tag));

-- ── Test Case Assignees ──────────────────────────────────

INSERT INTO test_case_assignee (id, test_case_id, user_id, assigned_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  1,  'user_bob',   NOW()),
  (2,  2,  'user_bob',   NOW()),
  (3,  3,  'user_carol', NOW()),
  (4,  6,  'user_bob',   NOW()),
  (5,  11, 'user_bob',   NOW()),
  (6,  11, 'user_carol', NOW()),
  (7,  15, 'user_bob',   NOW()),
  (8,  16, 'user_bob',   NOW()),
  (9,  21, 'user_bob',   NOW()),
  (10, 27, 'user_dave',  NOW())
ON CONFLICT DO NOTHING;

SELECT setval('test_case_assignee_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_case_assignee));

-- ── Releases ─────────────────────────────────────────────

INSERT INTO release (id, project_id, name, version, description, status, target_date, release_date, created_by, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'v1.0.0 Launch',     '1.0.0', 'Initial platform launch',          'RELEASED',    NOW() - INTERVAL '30 days', NOW() - INTERVAL '25 days', 'user_alice', NOW() - INTERVAL '50 days', NOW()),
  (2, 1, 'v1.1.0 Improvements', '1.1.0', 'Performance and UX improvements', 'IN_PROGRESS', NOW() + INTERVAL '14 days', NULL,                       'user_alice', NOW() - INTERVAL '20 days', NOW()),
  (3, 2, 'v2.0.0 Payment v2', '2.0.0', 'New payment processor integration', 'PLANNING',    NOW() + INTERVAL '30 days', NULL,                       'user_alice', NOW() - INTERVAL '10 days', NOW())
ON CONFLICT DO NOTHING;

SELECT setval('release_id_seq', (SELECT COALESCE(MAX(id), 0) FROM release));

-- ── Test Plans ───────────────────────────────────────────

INSERT INTO test_plan (id, project_id, name, description, status, milestone, start_date, end_date, release_id, created_by, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'v1.0 Launch Test Plan',     'Complete test coverage for initial launch',     'COMPLETED', 'v1.0',  NOW() - INTERVAL '40 days', NOW() - INTERVAL '26 days', 1, 'user_alice', NOW() - INTERVAL '45 days', NOW()),
  (2, 1, 'v1.1 Regression Test Plan', 'Regression testing for v1.1 improvements',      'ACTIVE',    'v1.1',  NOW() - INTERVAL '5 days',  NOW() + INTERVAL '10 days', 2, 'user_alice', NOW() - INTERVAL '15 days', NOW()),
  (3, 2, 'Payment Smoke Tests',       'Smoke tests for payment processing',             'DRAFT',     NULL,    NULL,                        NULL,                        NULL, 'user_alice', NOW() - INTERVAL '10 days', NOW())
ON CONFLICT DO NOTHING;

SELECT setval('test_plan_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_plan));

-- Test plan items
INSERT INTO test_plan_test_case (id, test_plan_id, test_case_id, position, added_at)
OVERRIDING SYSTEM VALUE
VALUES
  -- Plan 1: v1.0 launch (key test cases)
  (1,  1, 1,  0, NOW()),
  (2,  1, 2,  1, NOW()),
  (3,  1, 3,  2, NOW()),
  (4,  1, 6,  3, NOW()),
  (5,  1, 11, 4, NOW()),
  (6,  1, 15, 5, NOW()),
  (7,  1, 16, 6, NOW()),
  (8,  1, 18, 7, NOW()),
  -- Plan 2: v1.1 regression
  (9,  2, 1,  0, NOW()),
  (10, 2, 6,  1, NOW()),
  (11, 2, 7,  2, NOW()),
  (12, 2, 8,  3, NOW()),
  (13, 2, 11, 4, NOW()),
  (14, 2, 15, 5, NOW()),
  -- Plan 3: Payment smoke
  (15, 3, 21, 0, NOW()),
  (16, 3, 22, 1, NOW()),
  (17, 3, 23, 2, NOW())
ON CONFLICT DO NOTHING;

SELECT setval('test_plan_test_case_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_plan_test_case));

-- ── Test Plan Signoffs ───────────────────────────────────

INSERT INTO test_plan_signoff (id, test_plan_id, user_id, decision, comment, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'user_alice', 'APPROVED', 'All critical paths verified. Ready to ship.', NOW() - INTERVAL '26 days'),
  (2, 1, 'user_bob',   'APPROVED', 'QA team sign-off complete.', NOW() - INTERVAL '26 days')
ON CONFLICT DO NOTHING;

SELECT setval('test_plan_signoff_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_plan_signoff));

-- ── Test Runs ────────────────────────────────────────────

INSERT INTO test_run (id, project_id, name, environment, status, started_at, finished_at, created_by, created_at, updated_at, test_plan_id, release_id)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'v1.0 Launch Smoke Test',       'Production',  'COMPLETED',   NOW() - INTERVAL '28 days', NOW() - INTERVAL '27 days', 'user_bob',  NOW() - INTERVAL '28 days', NOW(), 1, 1),
  (2, 1, 'v1.0 Full Regression',          'Staging',     'COMPLETED',   NOW() - INTERVAL '30 days', NOW() - INTERVAL '28 days', 'user_bob',  NOW() - INTERVAL '30 days', NOW(), 1, 1),
  (3, 1, 'v1.1 Sprint 1 Testing',         'Staging',     'IN_PROGRESS', NOW() - INTERVAL '3 days',  NULL,                        'user_bob',  NOW() - INTERVAL '5 days',  NOW(), 2, 2),
  (4, 1, 'v1.1 Performance Check',        'Staging',     'CREATED',     NULL,                        NULL,                        'user_carol', NOW() - INTERVAL '2 days', NOW(), 2, 2),
  (5, 2, 'Payment Integration Test',      'Sandbox',     'COMPLETED',   NOW() - INTERVAL '15 days', NOW() - INTERVAL '14 days', 'user_bob',  NOW() - INTERVAL '15 days', NOW(), NULL, NULL),
  (6, 3, 'API v1.0 Verification',         'QA',          'COMPLETED',   NOW() - INTERVAL '20 days', NOW() - INTERVAL '19 days', 'user_dave', NOW() - INTERVAL '20 days', NOW(), NULL, NULL)
ON CONFLICT DO NOTHING;

SELECT setval('test_run_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_run));

-- ── Test Executions ──────────────────────────────────────

INSERT INTO test_execution (id, test_run_id, test_case_version_id, status, comment, executed_by, executed_at, started_at, completed_at)
OVERRIDING SYSTEM VALUE
VALUES
  -- Run 1: v1.0 Launch Smoke (6 test cases, all passed)
  (1,  1, 1,  'PASS', 'Login working correctly', 'user_bob', NOW() - INTERVAL '27 days', NOW() - INTERVAL '27 days' - INTERVAL '30 min', NOW() - INTERVAL '27 days'),
  (2,  1, 6,  'PASS', NULL, 'user_bob', NOW() - INTERVAL '27 days', NOW() - INTERVAL '27 days' - INTERVAL '25 min', NOW() - INTERVAL '27 days'),
  (3,  1, 11, 'PASS', NULL, 'user_bob', NOW() - INTERVAL '27 days', NOW() - INTERVAL '27 days' - INTERVAL '20 min', NOW() - INTERVAL '27 days'),
  (4,  1, 15, 'PASS', 'Guest checkout verified', 'user_carol', NOW() - INTERVAL '27 days', NOW() - INTERVAL '27 days' - INTERVAL '15 min', NOW() - INTERVAL '27 days'),
  (5,  1, 16, 'PASS', NULL, 'user_carol', NOW() - INTERVAL '27 days', NOW() - INTERVAL '27 days' - INTERVAL '10 min', NOW() - INTERVAL '27 days'),
  (6,  1, 18, 'PASS', NULL, 'user_bob', NOW() - INTERVAL '27 days', NOW() - INTERVAL '27 days' - INTERVAL '5 min', NOW() - INTERVAL '27 days'),

  -- Run 2: v1.0 Full Regression (8 cases, mix of results)
  (7,  2, 1,  'PASS',    NULL, 'user_bob',   NOW() - INTERVAL '29 days', NOW() - INTERVAL '29 days' - INTERVAL '2 hours', NOW() - INTERVAL '29 days'),
  (8,  2, 2,  'PASS',    NULL, 'user_bob',   NOW() - INTERVAL '29 days', NOW() - INTERVAL '29 days' - INTERVAL '110 min', NOW() - INTERVAL '29 days'),
  (9,  2, 3,  'PASS',    NULL, 'user_bob',   NOW() - INTERVAL '29 days', NOW() - INTERVAL '29 days' - INTERVAL '100 min', NOW() - INTERVAL '29 days'),
  (10, 2, 6,  'PASS',    NULL, 'user_carol', NOW() - INTERVAL '29 days', NOW() - INTERVAL '29 days' - INTERVAL '90 min',  NOW() - INTERVAL '29 days'),
  (11, 2, 11, 'FAIL',    'Cart count not updating on mobile viewport', 'user_carol', NOW() - INTERVAL '29 days', NOW() - INTERVAL '29 days' - INTERVAL '80 min', NOW() - INTERVAL '29 days'),
  (12, 2, 15, 'PASS',    NULL, 'user_bob',   NOW() - INTERVAL '28 days', NOW() - INTERVAL '28 days' - INTERVAL '60 min',  NOW() - INTERVAL '28 days'),
  (13, 2, 16, 'BLOCKED', 'Payment gateway down during test', 'user_bob', NOW() - INTERVAL '28 days', NOW() - INTERVAL '28 days' - INTERVAL '50 min', NOW() - INTERVAL '28 days'),
  (14, 2, 18, 'PASS',    NULL, 'user_carol', NOW() - INTERVAL '28 days', NOW() - INTERVAL '28 days' - INTERVAL '40 min',  NOW() - INTERVAL '28 days'),

  -- Run 3: v1.1 Sprint 1 (in progress)
  (15, 3, 1,  'PASS',    'Still working', 'user_bob', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' - INTERVAL '30 min', NOW() - INTERVAL '2 days'),
  (16, 3, 6,  'PASS',    NULL, 'user_bob', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' - INTERVAL '25 min', NOW() - INTERVAL '2 days'),
  (17, 3, 7,  'FAIL',    'Search returns stale results after product update', 'user_bob', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' - INTERVAL '20 min', NOW() - INTERVAL '1 day'),
  (18, 3, 8,  'PENDING', NULL, NULL, NULL, NULL, NULL),
  (19, 3, 11, 'PENDING', NULL, NULL, NULL, NULL, NULL),
  (20, 3, 15, 'PENDING', NULL, NULL, NULL, NULL, NULL),

  -- Run 5: Payment integration (all pass/fail)
  (21, 5, 21, 'PASS',    'Visa payment OK', 'user_bob', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days' - INTERVAL '30 min', NOW() - INTERVAL '14 days'),
  (22, 5, 22, 'PASS',    'MC payment OK', 'user_bob', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days' - INTERVAL '25 min', NOW() - INTERVAL '14 days'),
  (23, 5, 23, 'PASS',    'Decline handled correctly', 'user_bob', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days' - INTERVAL '20 min', NOW() - INTERVAL '14 days'),
  (24, 5, 24, 'FAIL',    '3DS callback timeout issue', 'user_bob', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days' - INTERVAL '15 min', NOW() - INTERVAL '14 days'),
  (25, 5, 25, 'PASS',    NULL, 'user_bob', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days' - INTERVAL '10 min', NOW() - INTERVAL '14 days'),

  -- Run 6: API verification
  (26, 6, 27, 'PASS', 'Auth endpoint working', 'user_dave', NOW() - INTERVAL '19 days', NOW() - INTERVAL '19 days' - INTERVAL '30 min', NOW() - INTERVAL '19 days'),
  (27, 6, 28, 'PASS', NULL, 'user_dave', NOW() - INTERVAL '19 days', NOW() - INTERVAL '19 days' - INTERVAL '25 min', NOW() - INTERVAL '19 days'),
  (28, 6, 29, 'PASS', NULL, 'user_dave', NOW() - INTERVAL '19 days', NOW() - INTERVAL '19 days' - INTERVAL '20 min', NOW() - INTERVAL '19 days'),
  (29, 6, 30, 'SKIPPED', 'Endpoint not implemented yet', 'user_dave', NOW() - INTERVAL '19 days', NULL, NULL)
ON CONFLICT DO NOTHING;

SELECT setval('test_execution_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_execution));

-- ── Test Failure Details ─────────────────────────────────

INSERT INTO test_failure_detail (id, test_execution_id, failure_environment, test_method, error_message, stack_trace, comment, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 11, 'Staging', 'testAddToCart_MobileViewport', 'AssertionError: Expected cart count to be 1, got 0', 'at CartPage.verifyCartCount (cart.spec.ts:45)\n  at TestRunner.execute (runner.ts:120)', 'Mobile responsive issue with cart badge', 'user_carol', NOW() - INTERVAL '29 days'),
  (2, 17, 'Staging', 'testProductSearch', 'AssertionError: Search results contain stale product data', 'at SearchPage.verifyResults (search.spec.ts:78)\n  at TestRunner.execute (runner.ts:120)', 'Cache invalidation issue after product update', 'user_bob', NOW() - INTERVAL '1 day'),
  (3, 24, 'Sandbox', 'test3DSAuthentication', 'TimeoutError: 3DS callback not received within 30s', 'at PaymentService.await3DSCallback (payment.ts:156)\n  at TestRunner.execute (runner.ts:120)', '3DS provider timeout, may need increased timeout threshold', 'user_bob', NOW() - INTERVAL '14 days')
ON CONFLICT DO NOTHING;

SELECT setval('test_failure_detail_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_failure_detail));

-- ── Test Case Comments ───────────────────────────────────

INSERT INTO test_case_comment (id, test_case_id, user_id, content, parent_id, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1,  'user_bob',   'This test case covers the happy path. We should add edge cases for locked accounts.', NULL, NOW() - INTERVAL '50 days', NOW() - INTERVAL '50 days'),
  (2, 1,  'user_alice', 'Good point. Can you create a separate TC for that?', 1, NOW() - INTERVAL '49 days', NOW() - INTERVAL '49 days'),
  (3, 8,  'user_carol', 'Filter needs to be retested after the category restructure.', NULL, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
  (4, 11, 'user_bob',   'Found a mobile viewport issue during regression. See failure details in run 2.', NULL, NOW() - INTERVAL '29 days', NOW() - INTERVAL '29 days'),
  (5, 15, 'user_alice', 'Guest checkout is a critical flow. Let''s make sure this is in every smoke suite.', NULL, NOW() - INTERVAL '38 days', NOW() - INTERVAL '38 days')
ON CONFLICT DO NOTHING;

SELECT setval('test_case_comment_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_case_comment));

-- ── Execution Comments ───────────────────────────────────

INSERT INTO execution_comment (id, test_execution_id, user_id, content, parent_id, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 11, 'user_carol', 'The cart badge element is hidden on viewports < 768px. CSS issue.', NULL, NOW() - INTERVAL '29 days', NOW() - INTERVAL '29 days'),
  (2, 11, 'user_dave',  'I''ll fix this in the next sprint. It''s a z-index + display:none issue.', 1, NOW() - INTERVAL '28 days', NOW() - INTERVAL '28 days'),
  (3, 17, 'user_bob',   'Looks like the search index isn''t being refreshed after product updates.', NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  (4, 24, 'user_bob',   'The 3DS provider sandbox seems unstable. Might need to increase timeout to 60s.', NULL, NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days')
ON CONFLICT DO NOTHING;

SELECT setval('execution_comment_id_seq', (SELECT COALESCE(MAX(id), 0) FROM execution_comment));

-- ── Custom Fields ────────────────────────────────────────

INSERT INTO custom_field (id, project_id, name, field_type, options, required, sort_order, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'Browser',       'SELECT',   '["Chrome","Firefox","Safari","Edge"]', false, 0, 'user_alice', NOW()),
  (2, 1, 'Test Type',     'SELECT',   '["Manual","Automated","Hybrid"]',      true,  1, 'user_alice', NOW()),
  (3, 1, 'Estimated Time','TEXT',      NULL,                                   false, 2, 'user_alice', NOW()),
  (4, 2, 'Card Network',  'SELECT',   '["Visa","Mastercard","Amex","JCB"]',   false, 0, 'user_alice', NOW())
ON CONFLICT DO NOTHING;

SELECT setval('custom_field_id_seq', (SELECT COALESCE(MAX(id), 0) FROM custom_field));

-- ── Requirements ─────────────────────────────────────────

INSERT INTO requirement (id, project_id, external_id, title, description, source, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'REQ-001', 'User Authentication',     'Users must be able to log in with email/password', 'Product Spec v1.0', 'user_alice', NOW() - INTERVAL '60 days'),
  (2, 1, 'REQ-002', 'Product Browsing',         'Users must be able to browse and search products', 'Product Spec v1.0', 'user_alice', NOW() - INTERVAL '60 days'),
  (3, 1, 'REQ-003', 'Shopping Cart',            'Users must be able to add/remove items from cart', 'Product Spec v1.0', 'user_alice', NOW() - INTERVAL '60 days'),
  (4, 1, 'REQ-004', 'Checkout Process',         'Users must be able to complete purchase',          'Product Spec v1.0', 'user_alice', NOW() - INTERVAL '60 days'),
  (5, 2, 'REQ-010', 'Payment Processing',       'System must process card payments securely',       'Payment Spec v2.0', 'user_alice', NOW() - INTERVAL '50 days')
ON CONFLICT DO NOTHING;

SELECT setval('requirement_id_seq', (SELECT COALESCE(MAX(id), 0) FROM requirement));

INSERT INTO requirement_test_case (id, requirement_id, test_case_id, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  1, 1,  NOW()),
  (2,  1, 2,  NOW()),
  (3,  1, 3,  NOW()),
  (4,  2, 6,  NOW()),
  (5,  2, 7,  NOW()),
  (6,  2, 8,  NOW()),
  (7,  3, 11, NOW()),
  (8,  3, 12, NOW()),
  (9,  3, 13, NOW()),
  (10, 4, 15, NOW()),
  (11, 4, 16, NOW()),
  (12, 5, 21, NOW()),
  (13, 5, 22, NOW()),
  (14, 5, 23, NOW()),
  (15, 5, 24, NOW())
ON CONFLICT DO NOTHING;

SELECT setval('requirement_test_case_id_seq', (SELECT COALESCE(MAX(id), 0) FROM requirement_test_case));

-- ── Test Case Templates ──────────────────────────────────

INSERT INTO test_case_template (id, project_id, name, description, precondition, steps, priority, created_by, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'Login Flow Template',   'Standard login test template',   'User account exists in system', '[{"order":1,"action":"Navigate to login page","expected":"Login form displayed"},{"order":2,"action":"Enter credentials","expected":"Fields populated"},{"order":3,"action":"Click submit","expected":"Expected result occurs"}]', 'HIGH',   'user_alice', NOW(), NOW()),
  (2, 1, 'CRUD Operation Template', 'Template for CRUD test cases', NULL, '[{"order":1,"action":"Create new record","expected":"Record created"},{"order":2,"action":"Read record","expected":"Record displayed"},{"order":3,"action":"Update record","expected":"Record updated"},{"order":4,"action":"Delete record","expected":"Record removed"}]', 'MEDIUM', 'user_alice', NOW(), NOW())
ON CONFLICT DO NOTHING;

SELECT setval('test_case_template_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_case_template));

-- ── Issue Links ──────────────────────────────────────────

INSERT INTO issue_link (id, project_id, test_case_id, test_execution_id, external_url, external_key, title, status, provider, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 11, 11, 'https://jira.example.com/browse/ECOM-234', 'ECOM-234', 'Cart badge hidden on mobile', 'IN_PROGRESS', 'jira', 'user_carol', NOW() - INTERVAL '29 days'),
  (2, 1, NULL, 17, 'https://jira.example.com/browse/ECOM-301', 'ECOM-301', 'Search cache invalidation after product update', 'OPEN', 'jira', 'user_bob', NOW() - INTERVAL '1 day'),
  (3, 2, NULL, 24, 'https://jira.example.com/browse/PAY-089', 'PAY-089', '3DS callback timeout', 'OPEN', 'jira', 'user_bob', NOW() - INTERVAL '14 days')
ON CONFLICT DO NOTHING;

SELECT setval('issue_link_id_seq', (SELECT COALESCE(MAX(id), 0) FROM issue_link));

-- ── Exploratory Sessions ─────────────────────────────────

INSERT INTO exploratory_session (id, project_id, title, charter, status, started_at, paused_duration, completed_at, summary, created_by, environment, tags)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'Checkout Edge Cases', 'Explore edge cases in the checkout flow including empty cart, expired sessions, and concurrent modifications', 'COMPLETED', NOW() - INTERVAL '20 days', 300, NOW() - INTERVAL '20 days' + INTERVAL '2 hours', 'Found 2 issues: empty cart allows checkout attempt, session expiry during payment not handled gracefully', 'user_carol', 'Staging', '["checkout","edge-cases"]'),
  (2, 1, 'Mobile Responsiveness', 'Test responsive design across various mobile viewports and orientations', 'ACTIVE', NOW() - INTERVAL '1 day', 0, NULL, NULL, 'user_carol', 'Staging', '["mobile","responsive","UI"]')
ON CONFLICT DO NOTHING;

SELECT setval('exploratory_session_id_seq', (SELECT COALESCE(MAX(id), 0) FROM exploratory_session));

INSERT INTO session_note (id, session_id, content, note_type, timestamp, screenshot_path, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'Empty cart still shows Proceed to Checkout button', 'BUG',  300,  NULL, NOW() - INTERVAL '20 days'),
  (2, 1, 'Session expiry during payment shows raw error page instead of friendly message', 'BUG', 1800, NULL, NOW() - INTERVAL '20 days'),
  (3, 1, 'Multi-item checkout works smoothly with 10+ items', 'NOTE', 3600, NULL, NOW() - INTERVAL '20 days'),
  (4, 2, 'Header menu overlaps on iPhone SE viewport (320px)', 'BUG',  600,  NULL, NOW() - INTERVAL '1 day'),
  (5, 2, 'Product images lazy load correctly on slow 3G simulation', 'NOTE', 1200, NULL, NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

SELECT setval('session_note_id_seq', (SELECT COALESCE(MAX(id), 0) FROM session_note));

-- ── Notifications ────────────────────────────────────────

INSERT INTO notification (id, user_id, type, title, message, link, project_id, is_read, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'user_bob',   'TEST_RUN_COMPLETED', 'Test Run Completed',    'v1.0 Launch Smoke Test completed with 6/6 passed',        '/projects/1/test-runs/1', 1, true,  NOW() - INTERVAL '27 days'),
  (2, 'user_bob',   'TEST_FAILURE',       'Test Failure Detected', 'TC-011 failed in v1.0 Full Regression run',                '/projects/1/test-runs/2', 1, true,  NOW() - INTERVAL '29 days'),
  (3, 'user_carol', 'ASSIGNED',           'Test Case Assigned',    'You have been assigned to TC-011: Add product to cart',     '/projects/1/test-cases',  1, true,  NOW() - INTERVAL '45 days'),
  (4, 'user_bob',   'TEST_FAILURE',       'Test Failure Detected', 'TC-007 failed in v1.1 Sprint 1 Testing',                   '/projects/1/test-runs/3', 1, false, NOW() - INTERVAL '1 day'),
  (5, 'user_dave',  'COMMENT',            'New Comment',           'Alice commented on your test case API-001',                  '/projects/3/test-cases',  3, false, NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

SELECT setval('notification_id_seq', (SELECT COALESCE(MAX(id), 0) FROM notification));

-- ── Audit Log (sample entries) ───────────────────────────

INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, project_id, metadata, ip_address, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'user_alice', 'CREATE', 'project',   '1', 1, '{"name":"E-Commerce Platform"}', '127.0.0.1', NOW() - INTERVAL '60 days'),
  (2, 'user_alice', 'CREATE', 'project',   '2', 2, '{"name":"Payment Gateway"}',     '127.0.0.1', NOW() - INTERVAL '50 days'),
  (3, 'user_bob',   'CREATE', 'test_case', '1', 1, '{"key":"TC-001"}',               '127.0.0.1', NOW() - INTERVAL '55 days'),
  (4, 'user_bob',   'CREATE', 'test_run',  '1', 1, '{"name":"v1.0 Launch Smoke Test"}', '127.0.0.1', NOW() - INTERVAL '28 days'),
  (5, 'user_bob',   'UPDATE', 'test_run',  '1', 1, '{"status":"COMPLETED"}',         '127.0.0.1', NOW() - INTERVAL '27 days')
ON CONFLICT DO NOTHING;

SELECT setval('audit_log_id_seq', (SELECT COALESCE(MAX(id), 0) FROM audit_log));

-- ── User Preferences ────────────────────────────────────

INSERT INTO user_preference (user_id, locale, theme, notification_settings, updated_at)
VALUES
  ('user_alice', 'en',    'light', '{"enableInApp":true,"mutedTypes":[]}',                 NOW()),
  ('user_bob',   'ko',    'dark',  '{"enableInApp":true,"mutedTypes":[]}',                 NOW()),
  ('user_carol', 'en',    'light', '{"enableInApp":true,"mutedTypes":["COMMENT"]}',        NOW()),
  ('user_dave',  'en',    'dark',  '{"enableInApp":true,"mutedTypes":[]}',                 NOW()),
  ('user_eve',   'ko',    'light', '{"enableInApp":false,"mutedTypes":[]}',                NOW())
ON CONFLICT DO NOTHING;

-- ── Saved Filters ────────────────────────────────────────

INSERT INTO saved_filter (id, project_id, user_id, name, filter_type, filters, sort_order, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'user_bob',   'My Assigned Cases',  'test_cases', '{"assignee":["user_bob"]}',                              0, NOW(), NOW()),
  (2, 1, 'user_bob',   'High Priority Only', 'test_cases', '{"priority":["HIGH","CRITICAL"]}',                       1, NOW(), NOW()),
  (3, 1, 'user_carol', 'Smoke Tests',        'test_cases', '{"tags":["Smoke"]}',                                     0, NOW(), NOW()),
  (4, 1, 'user_bob',   'Failed Executions',  'test_runs',  '{"status":["FAIL"]}',                                    0, NOW(), NOW())
ON CONFLICT DO NOTHING;

SELECT setval('saved_filter_id_seq', (SELECT COALESCE(MAX(id), 0) FROM saved_filter));

-- ── Test Case Parameters (for parameterized tests) ──────

INSERT INTO test_case_parameter (id, test_case_id, name, order_index)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1,  'username', 0),
  (2, 1,  'password', 1),
  (3, 21, 'card_number', 0),
  (4, 21, 'expiry_date', 1),
  (5, 21, 'cvv', 2)
ON CONFLICT DO NOTHING;

SELECT setval('test_case_parameter_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_case_parameter));

INSERT INTO test_case_data_set (id, test_case_id, name, "values", order_index)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'Admin user',    '{"username":"admin@test.com","password":"admin123"}',     0),
  (2, 1, 'Regular user',  '{"username":"user@test.com","password":"user123"}',       1),
  (3, 1, 'New user',      '{"username":"new@test.com","password":"newpass123"}',     2),
  (4, 21, 'Visa Classic', '{"card_number":"4111111111111111","expiry_date":"12/28","cvv":"123"}', 0),
  (5, 21, 'Visa Gold',    '{"card_number":"4000000000000002","expiry_date":"06/29","cvv":"456"}', 1)
ON CONFLICT DO NOTHING;

SELECT setval('test_case_data_set_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_case_data_set));

-- ── Test Suites ──────────────────────────────────────────

INSERT INTO test_suite (id, project_id, name, description, created_by, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'Smoke Suite',       'Critical path smoke tests for quick validation', 'user_alice', NOW() - INTERVAL '50 days'),
  (2, 1, 'Regression Suite',  'Full regression test suite',                     'user_alice', NOW() - INTERVAL '50 days'),
  (3, 2, 'Payment Smoke',     'Core payment flow tests',                        'user_alice', NOW() - INTERVAL '40 days')
ON CONFLICT DO NOTHING;

SELECT setval('test_suite_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_suite));

INSERT INTO test_suite_item (id, suite_id, test_case_id, added_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 1,  NOW()),
  (2, 1, 6,  NOW()),
  (3, 1, 11, NOW()),
  (4, 1, 15, NOW()),
  (5, 2, 1,  NOW()),
  (6, 2, 2,  NOW()),
  (7, 2, 3,  NOW()),
  (8, 2, 6,  NOW()),
  (9, 2, 7,  NOW()),
  (10, 2, 8,  NOW()),
  (11, 2, 11, NOW()),
  (12, 2, 12, NOW()),
  (13, 2, 13, NOW()),
  (14, 2, 15, NOW()),
  (15, 2, 16, NOW()),
  (16, 2, 18, NOW()),
  (17, 2, 19, NOW()),
  (18, 3, 21, NOW()),
  (19, 3, 22, NOW()),
  (20, 3, 23, NOW()),
  (21, 3, 24, NOW()),
  (22, 3, 25, NOW())
ON CONFLICT DO NOTHING;

SELECT setval('test_suite_item_id_seq', (SELECT COALESCE(MAX(id), 0) FROM test_suite_item));

COMMIT;

-- ── Summary ──────────────────────────────────────────────
SELECT 'Seed complete!' AS status;
SELECT 'Users: ' || COUNT(*) FROM "user" WHERE id LIKE 'user_%';
SELECT 'Projects: ' || COUNT(*) FROM project;
SELECT 'Test Cases: ' || COUNT(*) FROM test_case;
SELECT 'Test Runs: ' || COUNT(*) FROM test_run;
SELECT 'Executions: ' || COUNT(*) FROM test_execution;
