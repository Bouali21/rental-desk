import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { at, goto, createProduct, setPricing, publish, createCustomer, createOrder, addLine, captureServerCall } from './helpers.mjs';

const runtime = await startRuntime();
try {
  // Anonymous and outsider are refused on member pages; owner and member get in.
  await runtime.assertPrivateAccess(['/', '/orders', '/products', '/customers', '/availability', '/settings']);

  // The app has no sign-in of its own.
  for (const path of ['/login', '/signin', '/signup', '/register', '/logout', '/auth/login']) {
    const res = await runtime.fetch(path, { role: 'member' });
    expect(res.status, path).toBe(404);
  }

  const owner = await (await runtime.context('owner')).newPage();
  const db = await runtime.database();

  // Owner (admin) sets up one published and one unpublished product.
  const publishedId = await createProduct(owner, { name: 'Projector', description: 'Bright projector.', tracking: 'bulk' });
  await setPricing(owner, { method: 'daily', price: '40' });
  await owner.locator('#stock-quantity').fill('3');
  await owner.getByRole('button', { name: 'Save stock' }).click();
  await expect(owner.getByText('Stock saved').first()).toBeVisible();
  await publish(owner);

  const hiddenId = await createProduct(owner, { name: 'Fog machine', description: 'Internal only.', tracking: 'bulk' });
  await setPricing(owner, { method: 'fixed', price: '999' });
  // Capture the admin's product save, to replay it as a member.
  await owner.locator('#product-name').fill('Fog machine');
  const saveProduct = await captureServerCall(owner, () => owner.getByRole('button', { name: 'Save details' }).click());
  await expect(owner.getByText('Details saved').first()).toBeVisible();

  // Admin-only: product writes refuse a member
  const asMember = await runtime.fetch(saveProduct.path, { role: 'member', method: 'POST', headers: saveProduct.headers, body: saveProduct.body.replace('Fog machine', 'Hijacked') });
  expect(asMember.status).not.toBe(200);
  const nameRow = await db.prepare('select name from products where id = ?').bind(hiddenId).first();
  expect(nameRow.name).toBe('Fog machine');

  // Admin-only: settings
  await goto(owner, '/settings');
  await owner.locator('#shop-name').fill('Lakeside AV Hire');
  const saveSettings = await captureServerCall(owner, () => owner.getByRole('button', { name: 'Save settings' }).click());
  await expect(owner.getByText('Settings saved').first()).toBeVisible();
  const settingsAsMember = await runtime.fetch(saveSettings.path, { role: 'member', method: 'POST', headers: saveSettings.headers, body: saveSettings.body.replace('Lakeside AV Hire', 'Pwned Shop') });
  expect(settingsAsMember.status).not.toBe(200);
  const shopRow = await db.prepare('select shop_name from settings').first();
  expect(shopRow.shop_name).toBe('Lakeside AV Hire');

  // Members see admin pages without edit controls
  const member = await (await runtime.context('member')).newPage();
  await goto(member, '/settings');
  await expect(member.getByRole('button', { name: 'Save settings' })).toHaveCount(0);
  await goto(member, `/products/${publishedId}`);
  await expect(member.getByRole('heading', { level: 1, name: 'Projector' })).toBeVisible();
  await expect(member.getByRole('button', { name: 'Save pricing' })).toHaveCount(0);
  await expect(member.getByRole('button', { name: 'Archive product' })).toHaveCount(0);
  await goto(member, '/products');
  await expect(member.getByRole('button', { name: 'New product' })).toHaveCount(0);

  // Drafts are private to their creator (and admins)
  await createCustomer(owner, { name: 'Priya Raman', email: 'priya@example.com' });
  const draftId = await createOrder(owner, { customer: 'Priya Raman', start: at(5), end: at(6) });
  const addCall = await captureServerCall(owner, () => addLine(owner, 'Projector', 1));
  await expect(owner.getByTestId('order-line')).toHaveCount(1);

  await goto(member, '/orders');
  await expect(member.getByTestId('order-row')).toHaveCount(0);
  await goto(member, `/orders/${draftId}`);
  await expect(member.getByTestId('order-status')).toHaveCount(0);
  await expect(member.getByText('Order not found')).toBeVisible();
  const replay = await runtime.fetch(addCall.path, { role: 'member', method: 'POST', headers: addCall.headers, body: addCall.body });
  expect(replay.status).not.toBe(200);
  const lines = await db.prepare('select count(*) as n from order_lines where order_id = ?').bind(draftId).first();
  expect(lines.n).toBe(1);

  // A member edits their own draft, and an admin can open it
  const memberDraft = await createOrder(member, { customer: 'Priya Raman', start: at(7), end: at(8) });
  await addLine(member, 'Projector', 1);
  await expect(member.getByTestId('order-line')).toHaveCount(1);
  await goto(owner, `/orders/${memberDraft}`);
  await expect(owner.getByTestId('order-status')).toHaveText('Draft');

  // Once reserved, the owner's order is shared with members
  await goto(owner, `/orders/${draftId}`);
  await owner.getByRole('button', { name: 'Reserve' }).click();
  await expect(owner.getByTestId('order-status')).toHaveText('Reserved');
  await goto(member, `/orders/${draftId}`);
  await expect(member.getByTestId('order-status')).toHaveText('Reserved');

  // Outsiders cannot call server functions or private routes
  const outsider = await runtime.fetch(addCall.path, { role: 'outsider', method: 'POST', headers: addCall.headers, body: addCall.body });
  expect([401, 403]).toContain(outsider.status);
  const anon = await runtime.fetch(addCall.path, { method: 'POST', headers: addCall.headers, body: addCall.body });
  expect(anon.status).toBeGreaterThanOrEqual(300);
  expect(anon.status).not.toBe(404);
  const anonImage = await runtime.fetch(`/api/images/${publishedId}`);
  expect(anonImage.status).toBeGreaterThanOrEqual(300);

  // Public routes expose only published products and no customer data
  const catalog = await runtime.fetch(`/shop/api/catalog?start=${at(10)}&end=${at(11)}`);
  expect(catalog.status).toBe(200);
  const text = await catalog.text();
  expect(text).toContain('Projector');
  expect(text).not.toContain('Fog machine');
  expect(text).not.toContain('priya@example.com');
  expect(text).not.toContain('Priya');
  const hiddenImage = await runtime.fetch(`/shop/img/${hiddenId}`);
  expect(hiddenImage.status).toBe(404);
  const unknownBooking = await runtime.fetch(`/shop/api/booking/${'0'.repeat(32)}`);
  expect(unknownBooking.status).toBe(404);
  const hiddenBooking = await runtime.fetch('/shop/api/book', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ start: at(10), end: at(11), name: 'Eve', email: 'eve@example.com', phone: '1', items: [{ productId: hiddenId, quantity: 1 }] }),
  });
  expect(hiddenBooking.status).toBe(400);
  const shopPage = await runtime.fetch('/shop');
  expect(shopPage.status).toBe(200);
  const shopHtml = await shopPage.text();
  expect(shopHtml).not.toContain('Fog machine');
  expect(shopHtml).not.toContain('All apps');

  // A confirmation exposes only its own booking
  const booked = await runtime.fetch('/shop/api/book', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ start: at(10), end: at(11), name: 'Ana Silva', email: 'ana@example.com', phone: '2', items: [{ productId: publishedId, quantity: 1 }] }),
  });
  expect(booked.status).toBe(201);
  const { token } = await booked.json();
  const conf = await (await runtime.fetch(`/shop/api/booking/${token}`)).text();
  expect(conf).toContain('Projector');
  expect(conf).not.toContain('Priya');
  expect(conf).not.toContain('ana@example.com');
  console.log('authorization: ok');
} finally {
  await runtime.close();
}
