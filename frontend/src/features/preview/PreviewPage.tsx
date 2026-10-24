import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { ThemeToggle } from '../../components/ThemeToggle';

// Local, synthetic examples only. This route has no workspace data or mutations.
export function PreviewPage() {
  useEffect(() => { document.title = 'Read-only preview · BrandSentry'; }, []);
  return <main id="main-content" className="product-workspace min-h-screen bg-neu-canvas-light dark:bg-neu-canvas-dark text-slate-900 dark:text-slate-100 p-4 sm:p-8">
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/login" className="brand-wordmark text-2xl">BrandSentry</Link>
        <ThemeToggle />
      </header>
      <Card className="p-6 space-y-3">
        <p className="font-semibold">Read-only preview · Synthetic data</p>
        <h1 className="text-3xl font-bold">Create confidently. Publish responsibly.</h1>
        <p>Explore the brand review workflow without signing in. These local examples are fictional, not saved workspace records. No AI validation or human approval has been performed.</p>
        <Link className="neu-btn-secondary inline-flex items-center px-4 py-3" to="/login">Go to sign-in and check service availability</Link>
      </Card>
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-3">
          <h2 className="text-xl font-semibold">1. Brand Knowledge Vault</h2>
          <p className="text-sm">Synthetic brand: Fern &amp; Field</p>
          <h3 className="font-semibold">Example policy · Claims and tone</h3>
          <p>Use clear, measured language. Avoid absolute guarantees. Product claims should cite an approved source.</p>
          <p className="text-sm">Local illustration only; this policy is not an uploaded or verified source.</p>
        </Card>
        <Card className="p-6 space-y-3">
          <h2 className="text-xl font-semibold">2. Content Studio</h2>
          <h3 className="font-semibold">Example draft</h3>
          <blockquote className="border-l-2 pl-4">Our product guarantees 100% results!</blockquote>
          <p>A creator would submit a draft for checks against their workspace’s approved policies. This preview does not run checks or generate findings.</p>
        </Card>
        <Card className="p-6 space-y-3">
          <h2 className="text-xl font-semibold">3. Evidence and revisions</h2>
          <p>In the connected application, findings reference policy versions and evidence. Creators inspect suggestions and decide how to revise their content.</p>
          <p className="font-semibold">Preview state: Not validated</p>
        </Card>
        <Card className="p-6 space-y-3">
          <h2 className="text-xl font-semibold">4. Human review</h2>
          <p>An authorized reviewer considers the exact content version and records a decision. AI suggestions never grant approval.</p>
          <p className="font-semibold">Preview state: No review decision</p>
        </Card>
      </div>
      <footer className="text-sm">Real Google sign-in and Guest Demo require an available backend. This preview grants no workspace access.</footer>
    </div>
  </main>;
}
