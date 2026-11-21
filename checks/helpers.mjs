// Shared helpers for the release checks.
export function at(daysFromNow, hour = 9) {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 16);
}

export function day(daysFromNow) {
  return at(daysFromNow).slice(0, 10);
}

export async function goto(page, path) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

export async function createProduct(page, { name, description, tracking }) {
  await goto(page, '/products');
  await page.getByRole('button', { name: 'New product' }).click();
  await page.locator('#product-name').fill(name);
  await page.locator('#product-description').fill(description);
  await page.locator('#product-tracking').selectOption(tracking);
  await Promise.all([
    page.waitForURL(/\/products\/[^/]+$/),
    page.getByRole('button', { name: 'Create product' }).click(),
  ]);
  await page.getByRole('heading', { level: 1, name }).waitFor();
  return page.url().split('/').pop();
}

export async function setPricing(page, { method, price, tiers = [], deposit = '', buffer = '0' }) {
  await page.locator('#pricing-method').selectOption(method);
  if (method === 'tiered') {
    for (let i = 0; i < tiers.length; i++) {
      await page.getByRole('button', { name: 'Add tier' }).click();
      await page.getByTestId('tier-days').nth(i).fill(String(tiers[i][0]));
      await page.getByTestId('tier-price').nth(i).fill(tiers[i][1]);
    }
  } else {
    await page.locator('#price').fill(price);
  }
  await page.locator('#deposit').fill(deposit);
  await page.locator('#buffer').fill(buffer);
  await page.getByRole('button', { name: 'Save pricing' }).click();
  await page.getByText('Pricing saved').first().waitFor();
}

export async function publish(page) {
  await page.getByRole('checkbox', { name: 'Show in shop' }).click();
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByText('Details saved').first().waitFor();
}

export async function createCustomer(page, { name, email, phone = '', address = '' }) {
  await goto(page, '/customers');
  await page.getByRole('button', { name: 'New customer' }).click();
  await page.locator('#customer-name').fill(name);
  await page.locator('#customer-email').fill(email);
  await page.locator('#customer-phone').fill(phone);
  await page.locator('#customer-address').fill(address);
  await Promise.all([
    page.waitForURL(/\/customers\/[^/]+$/),
    page.getByRole('button', { name: 'Create customer' }).click(),
  ]);
  await page.getByRole('heading', { level: 1, name }).waitFor();
  return page.url().split('/').pop();
}

export async function createOrder(page, { customer, start, end }) {
  await goto(page, '/orders');
  await page.getByRole('button', { name: 'New order' }).click();
  await page.locator('#order-customer').selectOption({ label: customer });
  await page.locator('#order-start').fill(start);
  await page.locator('#order-end').fill(end);
  await Promise.all([
    page.waitForURL(/\/orders\/[^/]+$/),
    page.getByRole('button', { name: 'Create order' }).click(),
  ]);
  await page.getByTestId('order-status').waitFor();
  return page.url().split('/').pop();
}

export async function addLine(page, product, quantity) {
  const before = await page.getByTestId('order-line').count();
  await page.locator('#line-product').selectOption({ label: product });
  await page.locator('#line-quantity').fill(String(quantity));
  await page.getByRole('button', { name: 'Add line' }).click();
  return before;
}

/** Records the next server-function POST the page makes while `action` runs. */
export async function captureServerCall(page, action) {
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/_serverFn/')),
    action(),
  ]);
  const url = new URL(request.url());
  const headers = {};
  for (const [k, v] of Object.entries(request.headers())) {
    if (k === 'content-type' || k === 'accept' || k.startsWith('x-')) headers[k] = v;
  }
  return { path: url.pathname + url.search, headers, body: request.postData() };
}
