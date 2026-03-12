This is a Next.js SVG viewer workbench for pasting inline SVG, previewing the render, and converting valid markup into React-safe JSX.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Codex Harness

This repo includes a checked-in long-running Codex harness so fresh sessions can get their bearings without hidden context.

- `AGENTS.md`: required Codex session workflow
- `init.sh`: starts or reuses the local app server and prints a healthy URL
- `feature_list.json`: structured baseline feature ledger
- `codex-progress.txt`: append-only handoff log for future sessions

For a normal Codex session, start with:

```bash
pwd
cat codex-progress.txt
cat feature_list.json
git log --oneline -10
bash ./init.sh
```

After `init.sh` reports a healthy URL, use browser tooling to verify the app still works before making any code changes.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
