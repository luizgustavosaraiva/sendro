import type { DashboardCompanyViewModel } from "../../../lib/trpc";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderBondItems = (
  items: Array<{
    bondId: string;
    entityId: string;
    entityName: string;
    entityType: string;
    status: string;
    entitySlug?: string | null;
    entityLifecycle?: string | null;
  }>,
  emptyCopy: string,
  testId: string
) => {
  if (items.length === 0) {
    return `<p data-testid="${testId}-empty">${escapeHtml(emptyCopy)}</p>`;
  }

  return `<ul data-testid="${testId}-list">${items
    .map(
      (item) => `<li>
        <strong>${escapeHtml(item.entityName)}</strong>
        <div>entityId: <code>${escapeHtml(item.entityId)}</code></div>
        <div>bondId: <code>${escapeHtml(item.bondId)}</code></div>
        <div>status: <code>${escapeHtml(item.status)}</code></div>
        <div>tipo: <code>${escapeHtml(item.entityType)}</code></div>
        <div>slug: <code>${escapeHtml(item.entitySlug ?? "n/a")}</code></div>
        <div>lifecycle: <code>${escapeHtml(item.entityLifecycle ?? "n/a")}</code></div>
      </li>`
    )
    .join("")}</ul>`;
};

export const renderDashboardPage = (viewModel: DashboardCompanyViewModel) => `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dashboard Sendro</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      main { max-width: 960px; margin: 48px auto; padding: 32px; }
      .card { background: rgba(15,23,42,.85); border: 1px solid #334155; border-radius: 16px; padding: 24px; margin-bottom: 16px; }
      .meta { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; }
      .bond-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(260px,1fr)); gap: 16px; }
      .bond-section { border: 1px solid #334155; border-radius: 12px; padding: 16px; background: rgba(2,6,23,.55); }
      .status-error { border-color: #ef4444; }
      .status-empty { border-color: #f59e0b; }
      code { background: #020617; padding: 2px 6px; border-radius: 6px; }
      ul { padding-left: 20px; }
      li + li { margin-top: 12px; }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>Dashboard autenticado</h1>
        <p>Usuário SSR resolvido com sucesso a partir da sessão Better Auth.</p>
      </section>
      <section class="card meta">
        <div><strong>Nome</strong><div data-testid="user-name">${escapeHtml(viewModel.user.name)}</div></div>
        <div><strong>E-mail</strong><div data-testid="user-email">${escapeHtml(viewModel.user.email)}</div></div>
        <div><strong>Role</strong><div data-testid="user-role">${escapeHtml(viewModel.user.role)}</div></div>
        <div><strong>Perfil</strong><div data-testid="profile-name">${escapeHtml(viewModel.profile?.name ?? "n/a")}</div></div>
      </section>
      <section class="card">
        <h2>Diagnóstico</h2>
        <ul>
          <li>role: <code>${escapeHtml(viewModel.diagnostics?.role ?? "unknown")}</code></li>
          <li>profileCreated: <code>${String(viewModel.diagnostics?.profileCreated ?? false)}</code></li>
          <li>stripeStage: <code>${escapeHtml(viewModel.diagnostics?.stripeStage ?? "unknown")}</code></li>
          <li>stripeCustomerId: <code>${escapeHtml(viewModel.profile?.stripeCustomerId ?? "none")}</code></li>
          <li>bondsState: <code data-testid="bonds-state">${escapeHtml(viewModel.bondsState)}</code></li>
        </ul>
      </section>
      <section class="card ${viewModel.bondsState === "error" ? "status-error" : viewModel.bondsState === "empty" ? "status-empty" : ""}">
        <h2>Vínculos da empresa</h2>
        ${viewModel.bondsError ? `<p role="alert" data-testid="bonds-error">${escapeHtml(viewModel.bondsError)}</p>` : ""}
        ${viewModel.bondsState === "empty" ? '<p data-testid="bonds-empty">Nenhum vínculo ativo ou pendente foi encontrado para esta empresa.</p>' : ""}
        ${viewModel.bondsState === "not-company" ? '<p data-testid="bonds-not-company">Somente contas empresa visualizam vínculos da empresa no dashboard.</p>' : ""}
        <div class="bond-grid">
          <section class="bond-section">
            <h3>Lojistas vinculados</h3>
            ${renderBondItems(
              viewModel.bonds.activeRetailers,
              "Nenhum lojista vinculado no momento.",
              "active-retailers"
            )}
          </section>
          <section class="bond-section">
            <h3>Solicitações pendentes</h3>
            ${renderBondItems(
              viewModel.bonds.pendingRetailers,
              "Nenhuma solicitação pendente no momento.",
              "pending-retailers"
            )}
          </section>
          <section class="bond-section">
            <h3>Entregadores vinculados</h3>
            ${renderBondItems(
              viewModel.bonds.activeDrivers,
              "Nenhum entregador vinculado no momento.",
              "active-drivers"
            )}
          </section>
        </div>
      </section>
    </main>
  </body>
</html>`;
