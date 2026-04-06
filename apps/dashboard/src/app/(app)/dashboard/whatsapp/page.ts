import type { WhatsAppSessionViewModel } from "../../../../lib/trpc";

const escapeHtml = (value: string | null | undefined): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderStatusBadge = (status: WhatsAppSessionViewModel["status"]): string => {
  if (status === "connected") {
    return `<span data-testid="whatsapp-status-badge" style="display:inline-block;padding:6px 14px;border-radius:20px;background:#166534;color:#bbf7d0;font-weight:600;">✓ Conectado</span>`;
  }
  if (status === "connecting") {
    return `<span data-testid="whatsapp-status-badge" style="display:inline-block;padding:6px 14px;border-radius:20px;background:#92400e;color:#fef3c7;font-weight:600;">⟳ Conectando...</span>`;
  }
  return `<span data-testid="whatsapp-status-badge" style="display:inline-block;padding:6px 14px;border-radius:20px;background:#374151;color:#d1d5db;font-weight:600;">● Desconectado</span>`;
};

const renderQrCode = (qrCode: string | null, status: WhatsAppSessionViewModel["status"]): string => {
  if (status !== "connecting" || !qrCode) return "";
  return `<div style="margin-top:16px;" data-testid="whatsapp-qr-section">
    <p>Escaneie o QR code com o WhatsApp no celular:</p>
    <img data-testid="whatsapp-qr-image" src="${escapeHtml(qrCode)}" alt="QR Code WhatsApp" style="max-width:280px;border:2px solid #334155;border-radius:12px;padding:8px;" />
  </div>`;
};

const renderConnectButton = (status: WhatsAppSessionViewModel["status"]): string => {
  if (status === "connected") return "";
  return `<form method="post" action="/dashboard/whatsapp/connect" style="display:inline;">
    <button type="submit" data-testid="whatsapp-connect-button" style="padding:10px 20px;border-radius:10px;background:#2563eb;border:none;color:#fff;font:inherit;cursor:pointer;">
      Conectar via QR
    </button>
  </form>`;
};

const renderDisconnectButton = (status: WhatsAppSessionViewModel["status"]): string => {
  if (status === "disconnected") return "";
  return `<form method="post" action="/dashboard/whatsapp/disconnect" style="display:inline;margin-left:10px;">
    <button type="submit" data-testid="whatsapp-disconnect-button" style="padding:10px 20px;border-radius:10px;background:#dc2626;border:none;color:#fff;font:inherit;cursor:pointer;">
      Desconectar
    </button>
  </form>`;
};

const renderLastError = (status: WhatsAppSessionViewModel["status"], lastError: string | null | undefined): string => {
  if (status !== "disconnected" || !lastError) return "";
  return `<p data-testid="whatsapp-last-error" role="alert" style="margin-top:12px;padding:12px;border-radius:10px;background:#fef2f2;color:#991b1b;border:1px solid #fca5a5;">
    Último erro: ${escapeHtml(lastError)}
  </p>`;
};

export type WhatsAppPageOptions = {
  session: WhatsAppSessionViewModel | null;
  userName?: string;
  feedback?: string | null;
  error?: string | null;
};

export const renderWhatsAppPage = (options: WhatsAppPageOptions): string => {
  const { session, feedback, error } = options;
  const status = session?.status ?? "disconnected";
  const qrCode = session?.qrCode ?? null;
  const lastError = session?.lastError ?? null;

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WhatsApp – Dashboard Sendro</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      main { max-width: 800px; margin: 48px auto; padding: 32px; }
      .card { background: rgba(15,23,42,.85); border: 1px solid #334155; border-radius: 16px; padding: 24px; margin-bottom: 16px; }
      .nav { margin-bottom: 24px; }
      .nav a { color: #93c5fd; text-decoration: none; margin-right: 16px; }
      .nav a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <main>
      <nav class="nav" data-testid="whatsapp-nav">
        <a href="/dashboard">← Dashboard</a>
      </nav>
      <section class="card">
        <h1>Canal WhatsApp</h1>
        <p>Conecte sua conta WhatsApp via QR code para habilitar o bot Sendro.</p>
        ${feedback ? `<div data-testid="whatsapp-feedback" style="padding:12px;border-radius:10px;background:rgba(37,99,235,.12);border:1px solid #2563eb;margin-bottom:16px;">${escapeHtml(feedback)}</div>` : ""}
        ${error ? `<p data-testid="whatsapp-error" role="alert" style="padding:12px;border-radius:10px;background:#fef2f2;color:#991b1b;border:1px solid #fca5a5;">${escapeHtml(error)}</p>` : ""}
        <div style="margin:16px 0;">
          ${renderStatusBadge(status)}
        </div>
        <div style="margin-top:16px;">
          ${renderConnectButton(status)}
          ${renderDisconnectButton(status)}
        </div>
        ${renderQrCode(qrCode, status)}
        ${renderLastError(status, lastError)}
      </section>
    </main>
  </body>
</html>`;
};
