import { describe, expect, it } from "vitest";
import { renderWhatsAppPage } from "../page";

describe("WhatsApp dashboard page", () => {
  it("renders 'Desconectado' status badge when status is disconnected", () => {
    const html = renderWhatsAppPage({
      session: { status: "disconnected", qrCode: null }
    });
    expect(html).toContain('data-testid="whatsapp-status-badge"');
    expect(html).toContain("Desconectado");
  });

  it("shows 'Conectar via QR' button when disconnected", () => {
    const html = renderWhatsAppPage({
      session: { status: "disconnected", qrCode: null }
    });
    expect(html).toContain('data-testid="whatsapp-connect-button"');
    expect(html).toContain("Conectar via QR");
  });

  it("hides 'Conectar via QR' button when connected", () => {
    const html = renderWhatsAppPage({
      session: { status: "connected", qrCode: null }
    });
    expect(html).not.toContain('data-testid="whatsapp-connect-button"');
  });

  it("shows 'Desconectar' button when connected", () => {
    const html = renderWhatsAppPage({
      session: { status: "connected", qrCode: null }
    });
    expect(html).toContain('data-testid="whatsapp-disconnect-button"');
    expect(html).toContain("Desconectar");
  });

  it("shows 'Desconectar' button when connecting", () => {
    const html = renderWhatsAppPage({
      session: { status: "connecting", qrCode: null }
    });
    expect(html).toContain('data-testid="whatsapp-disconnect-button"');
  });

  it("hides 'Desconectar' button when disconnected", () => {
    const html = renderWhatsAppPage({
      session: { status: "disconnected", qrCode: null }
    });
    expect(html).not.toContain('data-testid="whatsapp-disconnect-button"');
  });

  it("renders QR image when status is 'connecting' and qrCode is set", () => {
    const html = renderWhatsAppPage({
      session: { status: "connecting", qrCode: "data:image/png;base64,TESTQR" }
    });
    expect(html).toContain('data-testid="whatsapp-qr-image"');
    expect(html).toContain("data:image/png;base64,TESTQR");
  });

  it("does not render QR image when status is 'disconnected'", () => {
    const html = renderWhatsAppPage({
      session: { status: "disconnected", qrCode: "data:image/png;base64,TESTQR" }
    });
    expect(html).not.toContain('data-testid="whatsapp-qr-image"');
  });

  it("does not render QR image when status is 'connected'", () => {
    const html = renderWhatsAppPage({
      session: { status: "connected", qrCode: "data:image/png;base64,TESTQR" }
    });
    expect(html).not.toContain('data-testid="whatsapp-qr-image"');
  });

  it("renders 'Conectando...' badge when status is connecting", () => {
    const html = renderWhatsAppPage({
      session: { status: "connecting", qrCode: null }
    });
    expect(html).toContain("Conectando...");
  });

  it("renders 'Conectado' badge when status is connected", () => {
    const html = renderWhatsAppPage({
      session: { status: "connected", qrCode: null }
    });
    expect(html).toContain("Conectado");
  });

  it("renders last_error message when disconnected with error", () => {
    const html = renderWhatsAppPage({
      session: { status: "disconnected", qrCode: null, lastError: "connection_timeout" }
    });
    expect(html).toContain('data-testid="whatsapp-last-error"');
    expect(html).toContain("connection_timeout");
  });

  it("does not render last_error when status is connected", () => {
    const html = renderWhatsAppPage({
      session: { status: "connected", qrCode: null, lastError: "old_error" }
    });
    expect(html).not.toContain('data-testid="whatsapp-last-error"');
  });

  it("renders feedback message when provided", () => {
    const html = renderWhatsAppPage({
      session: { status: "connecting", qrCode: null },
      feedback: "QR code gerado. Escaneie com o WhatsApp."
    });
    expect(html).toContain('data-testid="whatsapp-feedback"');
    expect(html).toContain("QR code gerado");
  });

  it("renders error message when provided", () => {
    const html = renderWhatsAppPage({
      session: null,
      error: "Sessão não disponível."
    });
    expect(html).toContain('data-testid="whatsapp-error"');
    expect(html).toContain("Sessão não disponível.");
  });

  it("renders fallback disconnected state when session is null", () => {
    const html = renderWhatsAppPage({ session: null });
    expect(html).toContain("Desconectado");
    expect(html).toContain('data-testid="whatsapp-connect-button"');
  });

  it("escapes HTML in last_error to prevent XSS", () => {
    const html = renderWhatsAppPage({
      session: { status: "disconnected", qrCode: null, lastError: '<script>alert("xss")</script>' }
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
