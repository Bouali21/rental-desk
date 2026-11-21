import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { at, goto, createProduct, setPricing, createCustomer, createOrder, addLine } from './helpers.mjs';

const runtime = await startRuntime();
try {
  let page = await (await runtime.context('owner')).newPage();
  const productId = await createProduct(page, { name: 'Wireless mic set', description: 'Two handhelds and a receiver.', tracking: 'bulk' });
  await setPricing(page, { method: 'weekly', price: '120', deposit: '50' });
  await page.locator('#stock-quantity').fill('5');
  await page.getByRole('button', { name: 'Save stock' }).click();
  await expect(page.getByText('Stock saved').first()).toBeVisible();
  await createCustomer(page, { name: 'Marco Bianchi', email: 'marco@example.com' });
  const orderId = await createOrder(page, { customer: 'Marco Bianchi', start: at(3), end: at(6) });
  await addLine(page, 'Wireless mic set', 2);
  await expect(page.getByTestId('order-line')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reserve' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('Reserved');

  await runtime.restart();

  page = await (await runtime.context('owner')).newPage();
  await goto(page, `/orders/${orderId}`);
  await expect(page.getByTestId('order-status')).toHaveText('Reserved');
  await expect(page.getByTestId('order-line')).toContainText('Wireless mic set');
  await expect(page.getByTestId('total-total')).toContainText('$340.00');
  await goto(page, `/products/${productId}`);
  await expect(page.locator('#stock-quantity')).toHaveValue('5');
  await goto(page, '/customers');
  await expect(page.getByTestId('customer-row').filter({ hasText: 'Marco Bianchi' })).toHaveCount(1);
  console.log('persistence: ok');
} finally {
  await runtime.close();
}
