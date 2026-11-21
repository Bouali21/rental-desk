# Rental Desk

Rental Desk runs an equipment rental business: what you rent out, when it's free, who has it, and what they owe. Customers can book online from a public booking page.

Inspired by https://booqable.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Keep a catalog of rental products with photos, tracked as a quantity or as individual tagged items.
- Price products per rental, hour, day or week, or by rental length, with deposits and buffer time.
- See free stock per product per day, and never book more than you have.
- Create orders, reserve them, hand items out, take them back, and see today's and late pickups and returns.
- Keep customer records with their orders and balance due.
- Print quotes, contracts and invoices, and record payments and refunds.
- Share a booking page where customers pick dates, see what's free and book or request items.

Left out: accounts and sign-in, which your Gateway handles; card payments; a website builder; mobile and barcode apps; coupons, bundles and delivery fees; e-signatures and automated emails; reports and multiple locations.

## Setup

Install the app from its release on your EveryApp Gateway, or from source:

```sh
pnpm install
pnpm dev            # run locally behind the dev Gateway
pnpm test           # unit tests
pnpm run deploy     # deploy to your Cloudflare account
```

There are no secrets or settings to set. The app uses a D1 database and an R2 bucket (`files`, for product photos). The shop's name, currency, booking mode, minimum notice, contract terms and invoice due days are set by an admin on the Settings page. The booking page is at `/shop` on the app's address and is open to anyone.

The release checks in `checks/` run against a packaged build with the oss.new runtime; they don't cover a live deployment.

## Limitations

- Times are wall-clock times without a time zone, and "today" and minimum notice are reckoned in UTC.
- Payments are recorded by hand; the app doesn't take card payments or send emails.
- Members can see and edit every customer and every non-draft order; only admins manage products and settings.
