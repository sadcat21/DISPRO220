# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## النشر التلقائي إلى Vercel

- أضف الأسرار التالية في إعدادات المستودع (Settings → Secrets and variables → Actions):
	- `VERCEL_TOKEN`
	- `VERCEL_ORG_ID`
	- `VERCEL_PROJECT_ID`

- بعد إضافة هذه الأسرار، سيؤدي كل دفع إلى الفرع `main` إلى نشر تلقائي على Vercel عبر GitHub Actions.

### التشغيل الآلي للدفع من جهاز التطوير (اختياري)

إذا كنت تريد أن تُدفع التغييرات تلقائياً من جهاز التطوير عند كل حفظ ملف، أضفت سكربت مشاهدة بسيط:

- لتشغيله محلياً:

	```bash
	npm install
	npm run auto-push
	```

- السكربت: `scripts/auto-push.js` — يراقب مجلد `src` و`public` وملف القفل ويقوم بـ `git add -A`, `git commit`, `git push` بعد جمع تغييرات متتابعة.

- تحذير: هذا يلتزم ويدفع تغييرات تلقائياً لذلك تأكد أنك تريد هذا السلوك. يمكنك تعديل الملفات المراقبة أو إضافة قواعد استثناء داخل `scripts/auto-push.js`.

### إضافة أسرار Vercel عبر سطر الأوامر (خيار)

إذا تفضل إضافة الأسرار عبر CLI، يمكنك استخدام GitHub CLI (`gh`):

```bash
# استبدل القيم المناسبة
gh secret set VERCEL_TOKEN --body "<your-vercel-token>"
gh secret set VERCEL_ORG_ID --body "<your-vercel-org-id>"
gh secret set VERCEL_PROJECT_ID --body "<your-vercel-project-id>"
```

انتهى.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
