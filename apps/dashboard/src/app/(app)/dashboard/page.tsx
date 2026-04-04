export type DashboardViewModel = {
  user: {
    name: string;
    email: string;
    role: string;
  };
  profile?: {
    name?: string | null;
    slug?: string | null;
    stripeCustomerId?: string | null;
  } | null;
  diagnostics?: {
    role?: string;
    profileCreated?: boolean;
    stripeStage?: string;
  } | null;
};

export const renderDashboardPage = (viewModel: DashboardViewModel) => `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dashboard Sendro</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      main { max-width: 860px; margin: 48px auto; padding: 32px; }
      .card { background: rgba(15,23,42,.85); border: 1px solid #334155; border-radius: 16px; padding: 24px; margin-bottom: 16px; }
      .meta { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; }
      code { background: #020617; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>Dashboard autenticado</h1>
        <p>Usuário SSR resolvido com sucesso a partir da sessão Better Auth.</p>
      </section>
      <section class="card meta">
        <div><strong>Nome</strong><div data-testid="user-name">${viewModel.user.name}</div></div>
        <div><strong>E-mail</strong><div data-testid="user-email">${viewModel.user.email}</div></div>
        <div><strong>Role</strong><div data-testid="user-role">${viewModel.user.role}</div></div>
        <div><strong>Perfil</strong><div data-testid="profile-name">${viewModel.profile?.name ?? "n/a"}</div></div>
      </section>
      <section class="card">
        <h2>Diagnóstico</h2>
        <ul>
          <li>role: <code>${viewModel.diagnostics?.role ?? "unknown"}</code></li>
          <li>profileCreated: <code>${String(viewModel.diagnostics?.profileCreated ?? false)}</code></li>
          <li>stripeStage: <code>${viewModel.diagnostics?.stripeStage ?? "unknown"}</code></li>
          <li>stripeCustomerId: <code>${viewModel.profile?.stripeCustomerId ?? "none"}</code></li>
        </ul>
      </section>
    </main>
  </body>
</html>`;
