import type { DashboardCompanyViewModel } from "../../../lib/trpc";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
};

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

const renderInvitationItems = (
  items: DashboardCompanyViewModel["invitations"]["invitations"],
  emptyCopy: string
) => {
  if (items.length === 0) {
    return `<p data-testid="invitation-list-empty">${escapeHtml(emptyCopy)}</p>`;
  }

  return `<ul data-testid="invitation-list">${items
    .map(
      (item) => `<li>
        <strong>${escapeHtml(item.channel)}</strong>
        <div>status: <code>${escapeHtml(item.status)}</code></div>
        <div>convite: <code>${escapeHtml(item.invitationId)}</code></div>
        <div>token: <code data-testid="invitation-token">${escapeHtml(item.token)}</code></div>
        <div>contato: <code>${escapeHtml(item.invitedContact ?? "n/a")}</code></div>
        <div>expira em: <code>${escapeHtml(formatDate(item.expiresAt))}</code></div>
        <div>aceito em: <code>${escapeHtml(formatDate(item.acceptedAt))}</code></div>
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
      .invite-form { display: grid; gap: 12px; margin-bottom: 16px; }
      .invite-form-row { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); }
      label { display: grid; gap: 6px; }
      input, select, button { font: inherit; padding: 12px; border-radius: 10px; border: 1px solid #334155; background: #020617; color: #e2e8f0; }
      button { cursor: pointer; background: #2563eb; border-color: #2563eb; }
      .invite-generated { margin-bottom: 16px; padding: 16px; border-radius: 12px; background: rgba(37,99,235,.12); border: 1px solid #2563eb; }
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
          <li>invitationsState: <code data-testid="invitations-state">${escapeHtml(viewModel.invitations.state)}</code></li>
        </ul>
      </section>
      <section class="card ${viewModel.invitations.state === "error" ? "status-error" : viewModel.invitations.state === "empty" ? "status-empty" : ""}">
        <h2>Convites de entregador</h2>
        <p>Gere um link SSR e acompanhe o estado dos convites emitidos por esta empresa.</p>
        ${viewModel.invitations.error ? `<p role="alert" data-testid="invitation-error">${escapeHtml(viewModel.invitations.error)}</p>` : ""}
        ${viewModel.invitations.generatedInvitation
          ? `<div class="invite-generated" data-testid="generated-invitation">
              <strong>Convite gerado com sucesso</strong>
              <div>invitationId: <code>${escapeHtml(viewModel.invitations.generatedInvitation.invitationId)}</code></div>
              <div>token: <code>${escapeHtml(viewModel.invitations.generatedInvitation.token)}</code></div>
              <div>url: <code data-testid="generated-invite-url">${escapeHtml(viewModel.invitations.generatedInvitation.inviteUrl)}</code></div>
            </div>`
          : ""}
        ${viewModel.invitations.state === "not-company" ? '<p data-testid="invitation-not-company">Somente contas empresa podem gerar e listar convites.</p>' : ""}
        <form class="invite-form" method="post" action="/dashboard/invitations">
          <div class="invite-form-row">
            <label>Canal
              <select name="channel" data-testid="invitation-channel-select">
                <option value="link">Link</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label>Contato (opcional)
              <input name="invitedContact" placeholder="email, telefone ou apelido" data-testid="invited-contact-input" />
            </label>
          </div>
          <button type="submit" data-testid="generate-invitation-button">Gerar link de convite</button>
        </form>
        ${renderInvitationItems(viewModel.invitations.invitations, "Nenhum convite gerado no momento.")}
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
