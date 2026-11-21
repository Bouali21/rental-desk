import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { at, day, goto, createProduct, setPricing, publish, createCustomer, createOrder, addLine } from './helpers.mjs';

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const runtime = await startRuntime();
try {
  const page = await (await runtime.context('owner')).newPage();

  // F007 settings (admin)
  await goto(page, '/settings');
  await page.locator('#shop-name').fill('Harbor Camera Rentals');
  await page.locator('#currency').fill('USD');
  await page.locator('#booking-mode').selectOption('instant');
  await page.locator('#min-notice').fill('2');
  await page.locator('#due-days').fill('14');
  await page.locator('#terms').fill('Equipment is returned clean and in working order. Damage is charged at repair cost.');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved').first()).toBeVisible();

  // F001 + F002: a trackable product with tiers, deposit, buffer and an image
  const cameraId = await createProduct(page, {
    name: 'Cinema camera kit',
    description: 'Body, two lenses, batteries and a hard case.',
    tracking: 'trackable',
  });
  await setPricing(page, {
    method: 'tiered',
    tiers: [[1, '80'], [3, '200'], [7, '400']],
    deposit: '250',
    buffer: '60',
  });
  for (const tag of ['CAM-001', 'CAM-002']) {
    await page.locator('#new-item').fill(tag);
    await page.getByRole('button', { name: 'Add item' }).click();
    await expect(page.getByTestId('stock-item').filter({ hasText: tag })).toBeVisible();
  }
  await page.getByTestId('image-input').setInputFiles({ name: 'camera.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('product-image')).toBeVisible();
  await publish(page);

  // Retire and re-add flow on a spare tag
  await page.locator('#new-item').fill('CAM-SPARE');
  await page.getByRole('button', { name: 'Add item' }).click();
  const spare = page.getByTestId('stock-item').filter({ hasText: 'CAM-SPARE' });
  await spare.getByRole('button', { name: 'Retire' }).click();
  await expect(spare).toContainText('Retired');

  const ledId = await createProduct(page, {
    name: 'LED light panel',
    description: 'Bi-colour panel with stand and diffuser.',
    tracking: 'bulk',
  });
  await setPricing(page, { method: 'daily', price: '15', deposit: '', buffer: '0' });
  await page.locator('#stock-quantity').fill('4');
  await page.getByRole('button', { name: 'Save stock' }).click();
  await expect(page.getByText('Stock saved').first()).toBeVisible();
  await publish(page);

  // Catalog browse and search
  await goto(page, '/products');
  await page.getByTestId('product-search').fill('camera');
  await expect(page.getByTestId('product-row')).toHaveCount(1);
  await expect(page.getByTestId('product-row').first()).toContainText('Cinema camera kit');
  await expect(page.getByTestId('product-row').first()).toContainText('2 in stock');

  // F005 customers
  await createCustomer(page, { name: 'Dana Whitfield', email: 'dana@whitfieldfilms.example', phone: '555-0142', address: '12 Pier Road' });
  await createCustomer(page, { name: 'Northside Theatre Co.', email: 'props@northside.example', phone: '555-0199' });

  // F004 + F002: an order with computed prices
  const order1 = await createOrder(page, { customer: 'Dana Whitfield', start: at(2), end: at(5) });
  await expect(page.getByTestId('order-status')).toHaveText('Draft');
  await addLine(page, 'Cinema camera kit', 1);
  await expect(page.getByTestId('order-line')).toHaveCount(1);
  await addLine(page, 'LED light panel', 2);
  await expect(page.getByTestId('order-line')).toHaveCount(2);
  await expect(page.getByTestId('order-line').filter({ hasText: 'Cinema camera kit' })).toContainText('$200.00');
  await expect(page.getByTestId('order-line').filter({ hasText: 'LED light panel' })).toContainText('$90.00');
  await page.locator('#discount-type').selectOption('percent');
  await page.locator('#discount-value').fill('10');
  await page.getByRole('button', { name: 'Save discount' }).click();
  await expect(page.getByTestId('total-subtotal')).toContainText('$290.00');
  await expect(page.getByTestId('total-discount')).toContainText('$29.00');
  await expect(page.getByTestId('total-deposit')).toContainText('$250.00');
  await expect(page.getByTestId('total-total')).toContainText('$511.00');
  await page.getByRole('button', { name: 'Reserve' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('Reserved');
  const order1Number = (await page.getByRole('heading', { level: 1 }).textContent()).match(/#(\d+)/)[1];

  // F003: overlapping order is refused with what is short
  const order2 = await createOrder(page, { customer: 'Northside Theatre Co.', start: at(3), end: at(4) });
  await addLine(page, 'LED light panel', 3);
  await expect(page.getByTestId('order-error')).toContainText('LED light panel');
  await expect(page.getByTestId('order-error')).toContainText('2 free');
  await expect(page.getByTestId('order-line')).toHaveCount(0);
  await addLine(page, 'Cinema camera kit', 2);
  await expect(page.getByTestId('order-error')).toContainText('Cinema camera kit');
  await addLine(page, 'Cinema camera kit', 1);
  await expect(page.getByTestId('order-line')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reserve' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('Reserved');

  // Editing a reserved order re-checks availability
  await page.getByTestId('order-line').first().getByLabel('Quantity').fill('2');
  await page.getByTestId('order-line').first().getByRole('button', { name: 'Update' }).click();
  await expect(page.getByTestId('order-error')).toContainText('Cinema camera kit');

  // F004: pickup assigns stock items on order 1
  await goto(page, `/orders/${order1}`);
  await page.getByRole('button', { name: 'Pick up' }).click();
  await page.getByRole('checkbox', { name: 'CAM-001' }).waitFor();
  await page.getByRole('button', { name: 'Confirm pickup' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('Picked up');
  await expect(page.getByTestId('order-line').filter({ hasText: 'Cinema camera kit' })).toContainText('CAM-001');

  // Trackable items held by an overlapping order are not offered
  await goto(page, `/orders/${order2}`);
  await page.getByRole('button', { name: 'Pick up' }).click();
  await expect(page.getByRole('checkbox', { name: 'CAM-002' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'CAM-001' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'CAM-SPARE' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Late return: an order whose return time has passed
  const order3 = await createOrder(page, { customer: 'Northside Theatre Co.', start: at(-3), end: at(-1) });
  await addLine(page, 'LED light panel', 1);
  await expect(page.getByTestId('order-line')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reserve' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('Reserved');
  await page.getByRole('button', { name: 'Pick up' }).click();
  await page.getByRole('button', { name: 'Confirm pickup' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('Picked up');
  await expect(page.getByTestId('late-badge')).toBeVisible();

  // Planner
  await goto(page, '/');
  await expect(page.getByRole('heading', { level: 1, name: 'Planner' })).toBeVisible();
  await expect(page.getByTestId('late-returns')).toContainText('Northside Theatre Co.');
  await expect(page.getByTestId('upcoming-pickups')).toContainText('Northside Theatre Co.');
  await expect(page.getByTestId('upcoming-returns')).toContainText('Dana Whitfield');

  await goto(page, `/orders/${order3}`);
  await page.getByRole('button', { name: 'Return' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('Returned');
  await expect(page.getByTestId('late-badge')).toHaveCount(0);

  // Order list filters and search
  await goto(page, '/orders');
  await page.getByTestId('order-search').fill('Northside');
  await expect(page.getByTestId('order-row')).toHaveCount(2);
  await page.getByTestId('order-search').fill('');
  await page.locator('#status-filter').selectOption('picked_up');
  await expect(page.getByTestId('order-row')).toHaveCount(1);
  await expect(page.getByTestId('order-row').first()).toContainText('Dana Whitfield');

  // F003 availability view
  await goto(page, '/availability');
  await page.locator('#avail-from').fill(day(2));
  await page.locator('#avail-to').fill(day(5));
  await page.getByRole('button', { name: 'Show' }).click();
  const ledRow = page.getByTestId('avail-row').filter({ hasText: 'LED light panel' });
  await expect(ledRow.locator(`[data-date="${day(3)}"]`)).toHaveText('2');
  const camRow = page.getByTestId('avail-row').filter({ hasText: 'Cinema camera kit' });
  await expect(camRow.locator(`[data-date="${day(3)}"]`)).toHaveText('0');

  // Upcoming bookings on the product
  await goto(page, `/products/${ledId}`);
  await expect(page.getByTestId('product-booking').first()).toContainText(`#${order1Number}`);

  // F006 payments
  await goto(page, `/orders/${order1}`);
  await expect(page.getByTestId('payment-status')).toHaveText('Unpaid');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.locator('#payment-amount').fill('300');
  await page.locator('#payment-method').fill('Card');
  await page.locator('#payment-note').fill('Paid at the counter');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByTestId('payment-row')).toHaveCount(1);
  await expect(page.getByTestId('payment-status')).toHaveText('Partially paid');
  await expect(page.getByTestId('total-due')).toContainText('$211.00');

  // F006 documents
  await goto(page, `/orders/${order1}/invoice`);
  const doc = page.getByTestId('document');
  await expect(doc).toContainText('Harbor Camera Rentals');
  await expect(doc).toContainText(/INV-\d+/);
  await expect(doc).toContainText('Cinema camera kit');
  await expect(doc).toContainText('$511.00');
  await expect(doc).toContainText('Due');
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
  await goto(page, `/orders/${order1}/contract`);
  await expect(page.getByTestId('document')).toContainText('Damage is charged at repair cost.');
  await expect(page.getByTestId('document')).toContainText('Dana Whitfield');
  await goto(page, `/orders/${order1}/quote`);
  await expect(page.getByTestId('document')).toContainText('$511.00');

  // Invoice follows order changes
  await goto(page, `/orders/${order1}`);
  await page.locator('#discount-type').selectOption('none');
  await page.getByRole('button', { name: 'Save discount' }).click();
  await expect(page.getByTestId('total-total')).toContainText('$540.00');
  await goto(page, `/orders/${order1}/invoice`);
  await expect(page.getByTestId('document')).toContainText('$540.00');

  // F005 customer page with orders and balance
  await goto(page, '/customers');
  await page.getByTestId('customer-search').fill('Dana');
  await expect(page.getByTestId('customer-row')).toHaveCount(1);
  await page.getByTestId('customer-row').first().getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dana Whitfield' })).toBeVisible();
  await expect(page.getByTestId('customer-balance')).toContainText('$240.00');
  await expect(page.getByTestId('customer-order')).toHaveCount(1);

  // F007 public booking page: request-level checks
  const catalogRes = await runtime.fetch(`/shop/api/catalog?start=${at(10)}&end=${at(12)}`);
  expect(catalogRes.status).toBe(200);
  const catalog = await catalogRes.json();
  expect(catalog.shop.name).toBe('Harbor Camera Rentals');
  const led = catalog.products.find((p) => p.name === 'LED light panel');
  expect(led.available).toBe(4);
  const cam = catalog.products.find((p) => p.name === 'Cinema camera kit');
  expect(cam.imageUrl).toBeTruthy();
  const img = await runtime.fetch(new URL(cam.imageUrl, `https://${runtime.hostname}`).pathname);
  expect(img.status).toBe(200);
  expect(img.headers.get('content-type')).toContain('image/png');

  const tooSoon = await runtime.fetch('/shop/api/book', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ start: new Date(Date.now() + 30 * 60000).toISOString().slice(0, 16), end: at(12), name: 'Late Larry', email: 'larry@example.com', phone: '1', items: [{ productId: ledId, quantity: 1 }] }),
  });
  expect(tooSoon.status).toBe(400);
  expect((await tooSoon.json()).error).toMatch(/notice/i);

  const tooMany = await runtime.fetch('/shop/api/book', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ start: at(3), end: at(4), name: 'Greedy Gail', email: 'gail@example.com', phone: '1', items: [{ productId: ledId, quantity: 3 }] }),
  });
  expect(tooMany.status).toBe(409);
  expect((await tooMany.json()).error).toContain('LED light panel');

  // F007 browser: an anonymous visitor books
  const visitor = await (await runtime.context(null)).newPage();
  await goto(visitor, '/shop');
  await expect(visitor.getByRole('heading', { level: 1, name: 'Harbor Camera Rentals' })).toBeVisible();
  await visitor.locator('#shop-start').fill(at(10));
  await visitor.locator('#shop-end').fill(at(12));
  await visitor.getByRole('button', { name: 'Check availability' }).click();
  const ledCard = visitor.getByTestId('shop-product').filter({ hasText: 'LED light panel' });
  await expect(ledCard.getByTestId('shop-available')).toHaveText('4 available');
  await ledCard.getByLabel('Quantity for LED light panel').fill('2');
  await ledCard.getByRole('button', { name: 'Add' }).click();
  await expect(visitor.getByTestId('shop-cart')).toContainText('LED light panel');
  await visitor.locator('#guest-name').fill('Sam Ortiz');
  await visitor.locator('#guest-email').fill('sam.ortiz@example.com');
  await visitor.locator('#guest-phone').fill('555-0110');
  await Promise.all([
    visitor.waitForURL(/\/shop\/booking\/[^/]+$/),
    visitor.getByRole('button', { name: 'Book now' }).click(),
  ]);
  await expect(visitor.getByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeVisible();
  await expect(visitor.getByTestId('booking-reference')).toContainText('#');
  await expect(visitor.getByTestId('booking-total')).toContainText('$60.00');
  await expect(visitor.getByText('LED light panel')).toBeVisible();

  // The booking holds stock
  const after = await (await runtime.fetch(`/shop/api/catalog?start=${at(10)}&end=${at(12)}`)).json();
  expect(after.products.find((p) => p.name === 'LED light panel').available).toBe(2);

  // Request mode: booking arrives for approval and attaches to the existing customer
  await goto(page, '/settings');
  await page.locator('#booking-mode').selectOption('request');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved').first()).toBeVisible();
  const requested = await runtime.fetch('/shop/api/book', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ start: at(20), end: at(21), name: 'Dana W.', email: 'DANA@whitfieldfilms.example', phone: '555-0142', items: [{ productId: cameraId, quantity: 1 }] }),
  });
  expect(requested.status).toBe(201);
  const reqBody = await requested.json();
  expect(reqBody.status).toBe('request');
  const confirmation = await runtime.fetch(`/shop/api/booking/${reqBody.token}`);
  expect(confirmation.status).toBe(200);
  expect(JSON.stringify(await confirmation.json())).toContain('Cinema camera kit');

  await goto(page, '/orders');
  await page.locator('#status-filter').selectOption('request');
  await expect(page.getByTestId('order-row')).toHaveCount(1);
  await expect(page.getByTestId('order-row').first()).toContainText('Dana Whitfield');
  await page.getByTestId('order-row').first().getByRole('link').first().click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('Reserved');

  await goto(page, '/customers');
  await page.getByTestId('customer-search').fill('Sam Ortiz');
  await expect(page.getByTestId('customer-row')).toHaveCount(1);

  // Archived products cannot go on new orders
  await goto(page, `/products/${ledId}`);
  await page.getByRole('button', { name: 'Archive product' }).click();
  await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible();
  await createOrder(page, { customer: 'Dana Whitfield', start: at(30), end: at(31) });
  await expect(page.locator('#line-product option', { hasText: 'LED light panel' })).toHaveCount(0);
  await goto(page, `/products/${ledId}`);
  await page.getByRole('button', { name: 'Restore product' }).click();
  await expect(page.getByRole('button', { name: 'Archive product' })).toBeVisible();

  // Phone-sized smoke
  const phone = await (await runtime.context('member', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await goto(phone, '/orders');
  await expect(phone.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
  await expect(phone.getByTestId('order-row').first()).toBeVisible();

  // End of the journey: the order with its lines, totals and payment
  await goto(page, `/orders/${order1}`);
  await runtime.assertBackLink(page);
  await expect(page.getByTestId('order-line')).toHaveCount(2);
  await expect(page.getByTestId('payment-row')).toHaveCount(1);
  await runtime.screenshot(page);
  console.log('behavior: ok');
} finally {
  await runtime.close();
}
